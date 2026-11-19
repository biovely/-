/* BIO BLACK BOX · archived incident replay */
(() => {
  'use strict';
  const root = () => document.getElementById('replay-root');
  const view = () => document.getElementById('replay');
  const units = { Fg_aeration: 'L/h', Fs_sugar: 'L/h', Fb_base: 'L/h', Fc_cool: 'L/h', DO2: 'mg/L', T: 'K', pH: '', CO2_out: '%', O2_out: '기록값', CER: 'g/h' };
  const symbols = { O2_out: '배기 O₂', CO2_out: '배기 CO₂', DO2: '용존산소 (DO)', CER: 'CO₂ 발생속도' };
  const iconPaths = {
    play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M7 5v14M16 5v14" stroke-width="4"/>',
    skip: '<path d="m5 6 9 6-9 6z" fill="currentColor" stroke="none"/><path d="M18 6v12"/>',
    pulse: '<path d="M2 12h5l3-7 4 14 3-7h5"/>',
    record: '<path d="M5 3h10l4 4v14H5z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
    check: '<path d="m4 12 5 5L20 6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'
  };
  const icon = (name) => '<svg aria-hidden="true" class="rp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + iconPaths[name] + '</svg>';
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const hour = (num) => Number(num).toFixed(1);
  const display = (num, key) => !Number.isFinite(num) ? '—' : Number(num).toLocaleString('ko-KR', {maximumFractionDigits: ['O2_out','CO2_out','pH','CER'].includes(key) ? 3 : 2});
  let data, pending, batch, index = 0, channel, timer = 0, guided = false, serial = 0, wired = false;
  let displayedCard = '', card, announcer = '';
  let runId = 0, firstAlarmSent = false;
  const acknowledgments = new Set();
  function caseId(b) {
    if (b.id.includes('숨은')) return 'hidden99';
    if (b.sensor_alert) return 'do' + b.batch;
    if (b.kind === '정상') return 'normal' + b.batch;
    return String(b.batch);
  }
  function resolveBatch(id, guide) {
    let proposed = String(id ?? '').trim();
    try { proposed = decodeURIComponent(proposed); } catch {}
    proposed = proposed.replace(/^#?replay\//, '');
    const compact = proposed.toLowerCase().replace(/[\s_–-]+/g, '');
    return data.batches.find(b => b.id === proposed || caseId(b) === compact || (b.batch === 99 && b.id.includes('숨은') && ['99hidden','hidden','guided'].includes(compact)) || (b.sensor_alert && ['26','sensor26','dosensor'].includes(compact)) || (b.kind === '정상' && String(b.batch) === compact)) || data.batches.find(b => caseId(b) === (guide ? 'hidden99' : '99')) || data.batches[0];
  }
  const el = id => document.getElementById('rp-' + id);
  const label = key => symbols[key] || data.meta.kor[key] || key;
  function firstPoint(time) {
    let lo = 0, hi = batch.t.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (batch.t[mid] < time) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  function setMessage(message) {
    if (announcer === message) return;
    announcer = message;
    el('announcement').textContent = message;
  }
  function currentCard() {
    const now = batch.t[index];
    let recent = null;
    for (const entry of batch.cards) {
      if (entry.alarm_t <= now) recent = entry;
    }
    return recent;
  }
  function caseOptions() {
    const groups = [['추천 사건', b => b.batch === 99 || Boolean(b.sensor_alert)], ['공정 고장', b => b.batch !== 99 && b.kind !== '정상' && !b.sensor_alert], ['정상 운전', b => b.kind === '정상']];
    return groups.map(([name,test]) => '<optgroup label="' + name + '">' + data.batches.filter(test).map(b => '<option value="' + escape(caseId(b)) + '">' + escape(b.id.replace(/ \(.*\)/,'')) + ' · ' + escape(caseId(b) === 'hidden99' ? '가림 처리 기록' : b.kind) + '</option>').join('') + '</optgroup>').join('');
  }
  function shell() {
    root().innerHTML = `
      <header class="rp-heading"><div class="rp-eyebrow"><span class="rp-spec-dot"></span> INCIDENT REPLAY</div>
        <h1>배치 리플레이</h1><p>발효 기록을 되감아 경보가 울린 시점과 가장 먼저 달라진 변수를 확인하세요.</p>
      </header>
      <div class="rp-toolbar">
        <label class="rp-case-select">재생할 배치<select id="rp-case">${caseOptions()}</select></label>
        <div class="rp-toolbar-note"><span class="rp-spec-dot"></span>IndPenSim 시뮬레이션 기록</div>
      </div>
      <div class="rp-layout">
        <div class="rp-graph-panel">
          <div class="rp-panel-heading"><div><div class="rp-overline">SIGNAL MONITOR</div><h2>센서 신호</h2></div><span class="rp-badge" id="rp-status"></span></div>
          <div class="rp-signal-bar"><label class="rp-channel">관찰 변수<select id="rp-channel"></select></label><div class="rp-legend"><span><i></i>측정값</span><span><i class="rp-expected"></i>예상값</span></div></div>
          <div class="rp-chart-box" id="rp-chart"></div>
          <div class="rp-readings"><div><span>측정값</span><strong id="rp-actual"></strong></div><div><span>예상값</span><strong id="rp-expected"></strong></div><div><span>측정 − 예상</span><strong id="rp-delta"></strong></div></div>
          <div class="rp-transport">
            <div class="rp-time"><div>${icon('clock')} <span>배양 시간</span></div><p><strong id="rp-time"></strong><span id="rp-total"></span></p></div>
            <label class="rp-sr" for="rp-seek">배양 시간 이동</label><input id="rp-seek" type="range" min="0" step="1" value="0">
            <div class="rp-time-marks"><span id="rp-range-start"></span><span id="rp-range-end"></span></div>
            <div class="rp-buttons"><button type="button" id="rp-play" class="rp-primary"></button><button type="button" id="rp-jump" class="rp-secondary">${icon('skip')}<span>다음 경보로 이동</span></button></div>
          </div>
        </div>
        <aside class="rp-incident" aria-label="사건 기록"><div class="rp-panel-heading"><div><div class="rp-overline">FAILURE PASSPORT</div><h2>사건 카드</h2></div><span class="rp-doc-icon">${icon('record')}</span></div><div id="rp-card"></div></aside>
      </div>
      <p class="rp-caption">그래프는 선택한 시점까지의 저장된 기록을 표시합니다. 사건 카드는 해당 경보에 대한 사후 분석을 포함합니다.</p>
      <div role="status" aria-live="polite" class="rp-sr" id="rp-announcement"></div>`;
    el('case').addEventListener('change', event => {
      const next = resolveBatch(event.target.value, false);
      const route = '#replay/' + caseId(next);
      if (location.hash !== route) history.replaceState(null, '', route);
      selectCase(next, false);
    });
    el('channel').addEventListener('change', event => { channel = event.target.value; render(); });
    el('seek').addEventListener('input', event => { stop(); index = Number(event.target.value); render(); });
    el('play').addEventListener('click', () => { if (timer) stop(); else play(); render(); });
    el('jump').addEventListener('click', () => {
      if (!batch.cards.length) return;
      stop();
      const next = batch.cards.find(c => c.alarm_t > batch.t[index]) || batch.cards[0];
      index = firstPoint(next.alarm_t);
      channel = next.first_domino in batch.vars ? next.first_domino : channel;
      el('channel').value = channel;
      render(); setMessage('경보 시점 ' + hour(next.alarm_t) + '시간으로 이동했습니다.');
    });
    el('card').addEventListener('click', event => {
      if (!card) return;
      if (event.target.closest('#rp-ack')) {
        acknowledgments.add(keyFor(card));
        try { sessionStorage.setItem('bbb-reviewed-events', JSON.stringify([...acknowledgments])); } catch {}
        displayedCard = ''; renderCard(); setMessage('이 사건을 검토 완료로 표시했습니다.');
      }
      if (event.target.closest('#rp-download')) download();
    });
  }
  const keyFor = entry => caseId(batch) + ':' + entry.alarm_t;
  function renderCard() {
    card = currentCard();
    const sensorConfirmed = batch.sensor_alert && batch.t[index] >= batch.sensor_alert.t;
    const identity = caseId(batch) + ':' + (card ? card.alarm_t : 'waiting') + ':' + !!sensorConfirmed;
    if (identity === displayedCard) return;
    displayedCard = identity;
    if (!card) {
      const hasEvents = batch.cards.length > 0;
      el('card').innerHTML = '<div class="rp-wait">' + icon('pulse') + '<h3>' + (hasEvents ? '첫 경보를 기다리는 중' : '정상 배치 기록') + '</h3><p>' + (hasEvents ? '재생을 시작하거나 ‘다음 경보로 이동’을 눌러 최초 이탈 변수와 유사 사례를 확인하세요.' : '이 배치에는 저장된 사건 카드가 없습니다. 센서별 측정값과 예상값을 비교해 보세요.') + '</p></div>';
      return;
    }
    const similar = (card.similar || []).filter(s => s.within);
    const isSensor = !!card.sensor_action;
    const action = isSensor ? card.sensor_action : (similar[0]?.action || '');
    const order = [];
    for (const item of card.order || []) {
      if (!order.some(prior => prior.var === item.var)) order.push(item);
    }
    const checked = acknowledgments.has(keyFor(card));
    const kind = isSensor && sensorConfirmed ? '센서 교차 확인 경보' : card.kind;
    el('card').innerHTML = `
      <div class="rp-event-top"><span class="rp-alert-label"><i></i>${escape(kind)}</span><span>경보 ${hour(card.alarm_t)} h</span></div>
      <h3 class="rp-event-title">${escape(label(card.first_domino))} ${escape(card.direction)}</h3>
      <p class="rp-event-desc">${hour(card.start_t)}시간부터 이탈이 관측되었습니다.${isSensor ? (sensorConfirmed ? ' ' + hour(batch.sensor_alert.t) + '시간에 독립적인 센서 점검 경보가 기록되었습니다.' : ' 다른 신호와 함께 센서 상태를 점검합니다.') : ''}</p>
      <div class="rp-mini-title">이탈 순서 <span>First Domino</span></div>
      <ol class="rp-sequence">${order.slice(0,4).map(item => '<li><b>' + escape(label(item.var)) + '</b><span>' + escape(item.dir) + ' · ' + hour(item.start) + ' h</span></li>').join('')}</ol>
      <div class="rp-mini-title">${isSensor ? '센서 점검' : '유사 과거 사례'}</div>
      ${isSensor ? '<p class="rp-helper">공정 고장 조치를 적용하기 전에 해당 센서를 교차 확인합니다.</p>' : (similar.length ? '<div class="rp-nearest">' + similar.slice(0,2).map(s => '<div><span>' + escape(s.case) + '<small>' + escape(s.type) + '</small></span><em>거리 ' + Number(s.dist).toFixed(2) + '</em></div>').join('') + '</div>' : '<p class="rp-helper">기준 거리 이내에 일치하는 사건이 없습니다.</p>')}
      ${action ? '<div class="rp-suggest"><b>점검 제안</b><p>' + escape(action) + '</p></div>' : ''}
      <div class="rp-card-actions"><button type="button" class="rp-secondary" id="rp-ack" ${checked ? 'disabled' : ''}>${icon('check')}${checked ? '검토 완료' : '검토 완료 표시'}</button><button type="button" class="rp-text-btn" id="rp-download">${icon('download')}카드 저장</button></div>`;
  }
  function download() {
    const report = ['BIO BLACK BOX · 사건 카드', batch.id + ' | IndPenSim 시뮬레이션 재생', '경보 ' + hour(card.alarm_t) + ' h · 최초 이탈 ' + hour(card.start_t) + ' h', card.kind + ' · ' + label(card.first_domino) + ' ' + card.direction, '', '이탈 기록', ...(card.order || []).map(i => '• ' + label(i.var) + ' ' + i.dir + ' / ' + hour(i.start) + ' h'), '', '유사 사례', ...(card.similar || []).filter(s => s.within).map(s => '• ' + s.case + ' / ' + s.type + ' / DTW ' + s.dist), '', '점검 제안: ' + (card.sensor_action || (card.similar || []).find(s => s.within)?.action || '기준 거리 내 사례 없음'), '검토 상태: ' + (acknowledgments.has(keyFor(card)) ? '검토 완료' : '미검토')].join('\n');
    const url = URL.createObjectURL(new Blob(['\ufeff' + report], {type:'text/plain;charset=utf-8'}));
    const a = document.createElement('a');
    a.href = url; a.download = 'BIO_BLACK_BOX_' + caseId(batch) + '_' + card.alarm_t + 'h.txt';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function graph() {
    const {act,exp} = batch.vars[channel];
    const t = batch.t, now = t[index];
    const left = Math.max(t[0], now - 26), right = Math.max(t[0] + 12, now + 1.5);
    const start = firstPoint(left), end = index;
    const actual = act.slice(start,end+1), expected = exp.slice(start,end+1);
    const vals = [...actual,...expected].filter(Number.isFinite);
    if (!vals.length) { el('chart').textContent = '선택한 구간에 측정값이 없습니다.'; return; }
    let low = Math.min(...vals), high = Math.max(...vals);
    const padding = (high - low) * 0.2 || Math.max(Math.abs(low) * 0.03, 0.02);
    high += padding; low -= padding;
    const width = Math.max(260, el('chart').clientWidth || 580), height = width < 430 ? 174 : 205, x0 = 48, x1 = width - 18, y0 = 16, y1 = height - 33;
    const x = time => x0 + (time - left)/(right-left) * (x1-x0);
    const y = value => y1 - (value-low)/(high-low)*(y1-y0);
    const line = values => values.reduce((str,v,i) => !Number.isFinite(v) ? str : str + (i === 0 || !Number.isFinite(values[i-1]) ? 'M' : ' L') + x(t[start+i]).toFixed(1) + ',' + y(v).toFixed(1), '');
    const grid = [0, 0.5, 1].map(f => {
      const v=low+f*(high-low), pos=y(v);
      return '<path class="rp-gridline" d="M'+x0+' '+pos+'H'+x1+'"/><text x="'+(x0-8)+'" y="'+(pos+3)+'" text-anchor="end">'+display(v,channel)+'</text>';
    }).join('');
    const xTicks = width < 430 ? [0, 1/3, 2/3, 1] : [0, 0.25, 0.5, 0.75, 1];
    const xLabels = xTicks.map(f => {
      const h=left+f*(right-left);
      return '<text x="'+x(h)+'" y="'+(y1+21)+'" text-anchor="middle">'+Math.round(h)+' h</text>';
    }).join('');
    const event = currentCard();
    const mark = event && event.alarm_t >= left && event.alarm_t <= right ? '<path class="rp-alert-line" d="M'+x(event.alarm_t)+' '+y0+'V'+y1+'"/>' : '';
    const current = Number.isFinite(act[index]) ? '<circle class="rp-current" cx="'+x(now)+'" cy="'+y(act[index])+'" r="4"/>' : '';
    el('chart').innerHTML = '<svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+escape(label(channel))+'의 측정값과 예상값, 배양 '+hour(now)+'시간까지"><g>'+grid+xLabels+mark+'</g><path class="rp-actual-line" d="'+line(actual)+'"/><path class="rp-expected-line" d="'+line(expected)+'"/>'+current+'</svg>';
  }
  function render() {
    const v = batch.vars[channel], now = batch.t[index], last = batch.t.at(-1);
    const past = currentCard();
    el('status').textContent = past ? (past.sensor_action ? '센서 점검' : '경보 기록') : '감시 중';
    el('status').classList.toggle('rp-alarmed', Boolean(past));
    const unit = units[channel] || '';
    const withUnit = (n, signed=false) => (signed && n>0 ? '+' : '') + display(n,channel) + (unit && unit!=='기록값' ? ' <small>'+unit+'</small>' : '');
    el('actual').innerHTML = withUnit(v.act[index]);
    el('expected').innerHTML = withUnit(v.exp[index]);
    el('delta').innerHTML = withUnit(v.act[index]-v.exp[index],true);
    el('time').textContent = hour(now) + ' h';
    el('total').textContent = ' / ' + hour(last) + ' h';
    el('seek').value = index; el('seek').style.setProperty('--rp-progress', (index/(batch.t.length-1)*100)+'%');
    el('seek').setAttribute('aria-valuetext', hour(now) + '시간');
    el('play').innerHTML = icon(timer ? 'pause' : 'play') + '<span>' + (timer ? '일시정지' : (index===batch.t.length-1 ? '처음부터 재생' : '재생')) + '</span>';
    el('jump').disabled = !batch.cards.length;
    el('jump').lastElementChild.textContent = !batch.cards.length ? '경보 없음' : (batch.cards.some(c=>c.alarm_t>now) ? '다음 경보로 이동' : '첫 경보로 이동');
    graph(); renderCard();
  }
  function stop() {
    if (timer) window.clearInterval(timer);
    timer = 0; guided = false;
  }
  function play() {
    if (timer || !batch) return;
    if (index >= batch.t.length - 1) { index = 0; firstAlarmSent = false; runId += 1; }
    timer = window.setInterval(() => {
      if (view()?.hidden || document.hidden) { stop(); render(); return; }
      const before = batch.t[index];
      index = Math.min(index+1, batch.t.length-1);
      const crossed = batch.cards.find(c => c.alarm_t > before && c.alarm_t <= batch.t[index]);
      if (crossed) {
        channel = crossed.first_domino in batch.vars ? crossed.first_domino : channel;
        el('channel').value = channel;
        if (guided) stop();
        if (!firstAlarmSent) {
          firstAlarmSent = true;
          const message = label(crossed.first_domino)+' '+crossed.direction+' · '+hour(crossed.alarm_t)+' h';
          setMessage(crossed.kind+' 경보. '+message);
          window.dispatchEvent(new CustomEvent('bio:alarm',{detail:{id:batch.id,title:batch.id+' · '+crossed.kind,message,hour:crossed.alarm_t,runId}}));
        }
      }
      if (index===batch.t.length-1) stop();
      render();
    },320);
  }
  function selectCase(next, guide, alarmHour) {
    stop(); batch = next; runId += 1; firstAlarmSent = false;
    displayedCard = ''; card = null; guided = guide;
    const earliest = batch.cards[0];
    index = earliest ? firstPoint(Math.max(batch.t[0], earliest.alarm_t - (guide ? 6 : 12))) : 0;
    const requestedHour = typeof alarmHour === 'number' && Number.isFinite(alarmHour);
    if (requestedHour) { index = firstPoint(alarmHour); guided = false; }
    const focusCard = requestedHour ? currentCard() : earliest;
    channel = focusCard && focusCard.first_domino in batch.vars ? focusCard.first_domino : ('DO2' in batch.vars ? 'DO2' : Object.keys(batch.vars)[0]);
    el('case').value = caseId(batch);
    el('channel').innerHTML = Object.keys(batch.vars).map(k => '<option value="'+escape(k)+'">'+escape(label(k))+(units[k] ? ' · '+escape(units[k]) : '')+'</option>').join('');
    el('channel').value = channel;
    el('seek').max = batch.t.length-1;
    el('range-start').textContent = hour(batch.t[0])+' h'; el('range-end').textContent = hour(batch.t.at(-1))+' h';
    if (guided && earliest) play();
    render();
    setMessage(requestedHour ? hour(batch.t[index])+'시간 기록을 열었습니다.' : batch.id + (guide ? ' 안내 재생을 시작합니다.' : ' 기록을 열었습니다.'));
  }
  async function open(id, guide=false, alarmHour) {
    const current=++serial;
    if (!root()) return;
    if (!data) {
      root().innerHTML = '<p class="rp-loading" role="status">배치 기록을 불러오는 중입니다…</p>';
      const archive = document.getElementById('archived-signals');
      if (!pending) pending = archive ? Promise.resolve().then(() => JSON.parse(archive.textContent)) : fetch('./replay-data.json').then(response => {
        if (!response.ok) throw Error('데이터 요청 오류');
        return response.json();
      });
      try { data = await pending; } catch {
        pending = null;
        if (current===serial) {
          root().innerHTML = '<p class="rp-loading">배치 기록을 불러오지 못했습니다. <button type="button" class="rp-secondary" id="rp-retry">다시 시도</button></p>';
          el('retry').onclick = () => open(id,guide,alarmHour);
        }
        return;
      }
    }
    if (current!==serial || view()?.hidden) return;
    if (!wired) {
      try { for (const value of JSON.parse(sessionStorage.getItem('bbb-reviewed-events')||'[]')) acknowledgments.add(value); } catch {}
      shell(); wired = true;
      new MutationObserver(() => { if (view()?.hidden && timer) { stop(); render(); } }).observe(view(), {attributes:true,attributeFilter:['hidden']});
      if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (batch && !view()?.hidden) graph(); }).observe(el('chart'));
      document.addEventListener('visibilitychange', () => { if (document.hidden && timer) { stop(); render(); } });
    }
    selectCase(resolveBatch(id,guide), guide, alarmHour);
  }
  window.BioReplay = {open, close() { ++serial; stop(); if (batch && wired) render(); }};
})();
