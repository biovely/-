(() => {
  'use strict';

  const get = id => document.getElementById(id);
  const keys = { notify: 'bbb-demo:topic:v1', pilot: 'bbb-demo:pilot:v1' };

  function read(key) {
    try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
  }

  function save(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep working in memory. */ }
  }

  function installNotifications(root) {
    const topicPattern = /^bbb-[a-f0-9]{24}$/;
    const previous = read(keys.notify);
    const state = previous && topicPattern.test(previous.topic)
      ? { topic: previous.topic, enabled: previous.enabled === true }
      : { topic: '', enabled: false };
    const notified = new Set();
    let testing = false;
    let generation = 0;

    root.innerHTML = `
      <header class="bc-intro"><h1>휴대폰 알림</h1><p>배치를 재생하다 첫 경보에 도달하면, 내 휴대폰에서 사건 카드를 열어 보세요.</p></header>
      <div class="bc-cols">
        <article class="bc-panel bc-setup"><header class="bc-panel-head"><h2>내 휴대폰 연결</h2><span class="bc-pill" id="bc-connection"></span></header>
          <section class="bc-step"><span class="bc-stepno" aria-hidden="true">1</span><div><h3>알림 주제 만들기</h3>
            <p>주제는 웹사이트와 휴대폰을 연결하는 이름입니다. 개인용 무작위 이름을 생성하세요.</p>
            <div class="bc-actions"><button class="bc-button" id="bc-generate">주제 생성</button></div>
            <div class="bc-topic" id="bc-topic-box" hidden><label for="bc-topic">내 주제 이름</label><div class="bc-topic-input"><input id="bc-topic" type="text" readonly autocomplete="off" spellcheck="false"><button class="bc-button bc-light" id="bc-copy">복사</button></div></div></div></section>
          <section class="bc-step"><span class="bc-stepno" aria-hidden="true">2</span><div><h3>휴대폰에서 같은 주제 구독</h3>
            <p>휴대폰에서 <b>ntfy</b> 앱을 열고 <b>＋</b>를 눌러 위 이름을 입력하세요. 서버는 <b>ntfy.sh</b>를 선택하고 앱 알림을 허용하세요.</p>
            <a class="bc-textlink" href="https://docs.ntfy.sh/subscribe/phone/" target="_blank" rel="noopener noreferrer">ntfy 앱 설치 및 구독 안내</a></div></section>
          <section class="bc-step"><span class="bc-stepno" aria-hidden="true">3</span><div><h3>알림을 켜고 수신 확인</h3>
            <label class="bc-check"><input type="checkbox" id="bc-enable"><span>이 탭에서 배치 경보를 내 주제로 전송</span></label>
            <div class="bc-actions"><button class="bc-button" id="bc-test">테스트 알림 보내기</button><a class="bc-textlink" href="#guided" id="bc-replay-link" hidden>대표 사건 재생</a></div></div></section>
        </article>
        <aside class="bc-side">
          <div class="bc-dark"><span class="bc-chapter">휴대폰 수신 예시</span><div class="bc-phone-card"><div class="bc-app-row"><span class="bc-app-icon" aria-hidden="true">n</span><b>ntfy</b><span>지금</span></div><strong>BIO BLACK BOX · 배치 경보</strong><p>배치 99 · 21.2 h<br>배기 산소 신호에서 이상이 감지되었습니다.</p></div><p>알림을 누르면 해당 배치의 사건 재생 화면이 열립니다.</p></div>
          <div class="bc-info"><h3>전송 상태</h3><p id="bc-delivery" role="status" aria-live="polite"></p></div>
          <p class="bc-note">이 탭에서 재생하는 데모 경보만 전송합니다. ntfy.sh의 공개 주제는 이름을 아는 사람이 구독할 수 있으니 개인용으로 보관하세요.</p>
        </aside>
      </div>`;

    const status = get('bc-delivery');
    function showStatus(message, error = false) {
      status.textContent = message;
      status.parentElement.classList.toggle('bc-error', error);
    }

    function refresh() {
      get('bc-connection').textContent = state.enabled ? '알림 켜짐' : '알림 꺼짐';
      get('bc-connection').classList.toggle('bc-on', state.enabled);
      get('bc-topic-box').hidden = !state.topic;
      get('bc-topic').value = state.topic;
      get('bc-enable').disabled = !state.topic;
      get('bc-enable').checked = state.enabled;
      get('bc-test').disabled = !state.enabled || testing;
      get('bc-replay-link').hidden = !state.enabled;
      get('bc-generate').textContent = state.topic ? '새 주제 생성' : '주제 생성';
    }

    get('bc-generate').addEventListener('click', () => {
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      state.topic = 'bbb-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
      state.enabled = false;
      generation++;
      notified.clear();
      save(keys.notify, state);
      refresh();
      showStatus('새 주제를 만들었습니다. 휴대폰에서 이 이름을 구독해 주세요.');
    });

    get('bc-copy').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(state.topic);
        showStatus('주제 이름을 복사했습니다.');
      } catch {
        get('bc-topic').select();
        showStatus('주제 이름을 선택했습니다. 기기의 복사 기능을 이용하세요.');
      }
    });

    get('bc-enable').addEventListener('change', event => {
      state.enabled = Boolean(state.topic && event.target.checked);
      generation++;
      save(keys.notify, state);
      refresh();
      showStatus(state.enabled ? '테스트 알림으로 휴대폰 수신을 확인할 수 있습니다.' : '배치 알림 전송을 껐습니다.');
    });

    const displayTime = () => new Date().toLocaleTimeString('ko-KR', { hour:'2-digit', minute:'2-digit' });
    async function send(payload, isTest = false) {
      if (!state.enabled || !topicPattern.test(state.topic)) return;
      const version = generation;
      if (isTest) testing = true;
      refresh();
      showStatus('ntfy로 전송 중입니다.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('https://ntfy.sh/', {
          method: 'POST',
          body: JSON.stringify({ ...payload, topic: state.topic }),
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          signal: controller.signal
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const result = await response.json();
        if (!result.id || result.event !== 'message') throw new Error('응답 형식 확인 필요');
        if (generation === version) showStatus(displayTime() + ' · ntfy가 ' + (isTest ? '테스트 알림' : '배치 경보') + '을 접수했습니다. 휴대폰에서 수신을 확인하세요.');
      } catch (error) {
        if (generation === version) {
          const reason = error.name === 'AbortError' ? '응답 시간 초과' : (error.message.startsWith('HTTP ') ? error.message : '네트워크 또는 서비스 연결 오류');
          showStatus('전송 결과를 확인할 수 없습니다 (' + reason + '). 연결과 주제 구독을 확인한 뒤 테스트해 주세요.', true);
        }
      } finally {
        clearTimeout(timeout);
        if (isTest) testing = false;
        refresh();
      }
    }

    function pageLink(hash) {
      const url = new URL(location.href);
      url.search = '';
      url.hash = hash;
      return url.href;
    }

    get('bc-test').addEventListener('click', () => {
      if (!testing) void send({
        title: 'BIO BLACK BOX · 연결 테스트', message: '휴대폰 알림이 연결되었습니다. 사이트에서 대표 사건을 재생해 보세요.',
        priority: 3, tags: ['test_tube'], click: pageLink('notify')
      }, true);
    });

    window.addEventListener('bio:alarm', event => {
      const alarm = event.detail;
      if (!state.enabled || !alarm || typeof alarm.id !== 'string' || !alarm.id) return;
      const code = alarm.runId != null ? String(alarm.runId) : '';
      const key = [alarm.id, alarm.hour, code].join('/');
      if (notified.has(key)) return;
      notified.add(key);
      const detail = [alarm.id, alarm.hour != null ? alarm.hour + ' h' : '', alarm.message || alarm.title].filter(Boolean).join(' · ');
      const at = Number.isFinite(alarm.hour) && alarm.hour >= 0 ? '?at=' + alarm.hour : '';
      void send({
        title: 'BIO BLACK BOX · 배치 경보', message: detail.slice(0, 600), priority: 4,
        tags: ['warning'], click: pageLink('replay/' + encodeURIComponent(alarm.id) + at)
      });
    });
    refresh();
    showStatus(state.enabled ? '알림이 켜져 있습니다. 첫 경보 또는 테스트 전송을 기다립니다.' : '알림을 켜면 여기에서 ntfy 접수 결과를 확인할 수 있습니다.');
  }

  const proposals = [
    { delta: 3, reason: '모의 센서 신호가 기준 아래로 이동했습니다. 공기 공급 지령을 한 단계 높이는 제안입니다.' },
    { delta: 4, reason: '모의 신호가 아직 회복되지 않았습니다. 현재 지령을 기준으로 추가 조정을 검토합니다.' },
    { delta: 6, reason: '센서 편차가 커졌습니다. 이번 제안의 변경 폭이 정책 한도 안인지 확인합니다.' },
    { delta: -2, reason: '모의 신호가 기준 근처로 복귀했습니다. 공급 지령을 조금 낮추는 제안입니다.' },
    { delta: 4, reason: '모의 신호의 작은 하락이 재현되었습니다. 현재 설정에서 한 차례 상향을 검토합니다.' },
    { delta: 4, reason: '마지막 조정 제안입니다. 누적된 설정값이 허용 범위 안인지 확인합니다.' }
  ];

  function installPilot(root) {
    const first = () => ({ mode: 'manual', index: 0, setpoint: 100, log: [], evaluated: false });
    const cached = read(keys.pilot);
    const state = cached && Number.isInteger(cached.index) && cached.index >= 0 && cached.index <= proposals.length &&
      Number.isFinite(cached.setpoint) && cached.setpoint >= 90 && cached.setpoint <= 110 && ['manual','auto'].includes(cached.mode) &&
      Array.isArray(cached.log) && cached.log.length <= proposals.length && cached.log.every(row =>
        row && Number.isInteger(row.index) && ['승인','거절','자동 적용','차단'].includes(row.decision) &&
        Number.isFinite(row.before) && Number.isFinite(row.target) && Number.isFinite(row.after))
      ? cached : first();
    const f = signed => (signed > 0 ? '+' : '') + signed;
    root.innerHTML = `
      <header class="bc-intro"><h1>AI 운전 체험</h1><p>같은 제안을 승인하거나 거절해 보세요. 다음 제안은 방금 적용한 설정값에서 출발합니다.</p></header>
      <div class="bc-cols">
        <article class="bc-panel bc-lab"><div class="bc-panel-head"><h2>설정값 제어 실습</h2><span class="bc-pill">로컬 시뮬레이션</span></div>
          <fieldset class="bc-mode"><legend>운전 방식</legend><div><label><input type="radio" name="bc-mode" value="manual" id="bc-mode-manual"><span>사용자 승인</span></label><label><input type="radio" name="bc-mode" value="auto" id="bc-mode-auto"><span>제한 자동</span></label></div></fieldset>
          <p id="bc-mode-info" class="bc-muted"></p>
          <div class="bc-proposal"><div class="bc-panel-head"><h3 id="bc-proposal-title">제안</h3><span class="bc-ordinal" id="bc-counter"></span></div>
            <div class="bc-readings"><div><span>현재 적용값</span><strong id="bc-current"></strong></div><div><span>제안값</span><strong id="bc-proposed"></strong></div><div><span>변경 폭</span><strong id="bc-delta"></strong></div></div>
            <p id="bc-rationale"></p>
          </div>
          <div class="bc-guard" id="bc-guard" aria-live="polite"></div>
          <div class="bc-actions" id="bc-pilot-actions">
            <button class="bc-button" id="bc-approve">승인하고 적용</button><button class="bc-button bc-light" id="bc-reject">거절하고 유지</button>
            <button class="bc-button" id="bc-auto">다음 제안 평가</button><button class="bc-button bc-light" id="bc-block">차단 기록 후 계속</button>
            <button class="bc-button" id="bc-reset">처음부터 다시 체험</button>
          </div>
        </article>
        <aside class="bc-side"><div class="bc-dark"><span class="bc-chapter">실습 정책</span><h2>공기 공급 지령</h2><p>기준 설정을 100으로 놓은 가상 지수입니다. 각 제안은 두 가지 조건을 함께 통과해야 합니다.</p>
          <dl class="bc-rule"><div><dt>허용 설정 범위</dt><dd>90–110</dd></div><div><dt>1회 최대 변경 폭</dt><dd>±4</dd></div></dl></div>
          <div class="bc-info"><h3>연구 결과와 비교</h3><p>팀 보고서의 공식 시뮬레이터에서는 정상 8배치의 평균 생산량이 <b>3,536 kg에서 3,862 kg</b>으로 증가했습니다. 당 투입량도 약 13% 증가했습니다. 위 실습은 의사결정 과정을 재현합니다.</p><a class="bc-textlink" id="bc-evidence-link" href="#evidence">검증 결과 보기</a></div>
        </aside>
      </div>
      <section class="bc-panel bc-audit"><div class="bc-panel-head"><h2>운전 기록</h2><span class="bc-ordinal" id="bc-audit-count"></span></div><div id="bc-log" aria-live="polite" aria-relevant="additions text"></div></section>`;

    function details() {
      const proposal = proposals[state.index];
      if (!proposal) return null;
      const target = state.setpoint + proposal.delta;
      const problems = [];
      if (Math.abs(proposal.delta) > 4) problems.push('1회 최대 변경 폭(±4) 초과');
      if (target < 90 || target > 110) problems.push('허용 범위(90–110) 이탈');
      return { proposal, target, problems };
    }

    function render() {
      const next = details();
      const finished = !next;
      get('bc-mode-' + state.mode).checked = true;
      get('bc-mode-manual').disabled = finished;
      get('bc-mode-auto').disabled = finished;
      get('bc-mode-info').textContent = state.mode === 'manual'
        ? '운전자가 제안마다 승인 여부를 결정합니다.' : '제안 평가를 누르면 허용 범위와 변경 폭을 검사해 통과한 제안을 적용합니다.';
      get('bc-counter').textContent = finished ? '완료' : (state.index + 1) + ' / ' + proposals.length;
      get('bc-proposal-title').textContent = finished ? '운전 체험 완료' : '공기 공급 지령 조정';
      get('bc-current').textContent = state.setpoint;
      get('bc-proposed').textContent = next?.target ?? '—';
      get('bc-delta').textContent = next ? f(next.proposal.delta) : '—';
      get('bc-rationale').textContent = next?.proposal.reason || '모든 제안이 처리되었습니다. 아래 기록에서 실제 적용값과 거절·차단 결과를 비교하세요.';
      const blocked = Boolean(next?.problems.length);
      const guard = get('bc-guard');
      guard.classList.toggle('bc-blocked', blocked);
      guard.textContent = finished ? '최종 적용값 ' + state.setpoint :
        (blocked ? '정책 차단 · ' + next.problems.join(' / ') : '정책 통과 · 설정 범위와 변경 폭 충족');
      get('bc-approve').hidden = finished || state.mode !== 'manual' || blocked;
      get('bc-reject').hidden = finished || state.mode !== 'manual' || blocked;
      get('bc-auto').hidden = finished || state.mode !== 'auto';
      get('bc-block').hidden = finished || state.mode !== 'manual' || !blocked;
      get('bc-reset').hidden = !finished;
      get('bc-audit-count').textContent = state.log.length + '건';
      const log = get('bc-log');
      log.replaceChildren();
      if (!state.log.length) {
        const empty = document.createElement('p');
        empty.className = 'bc-empty';
        empty.textContent = '첫 제안을 처리하면 제안값과 적용값이 여기에 기록됩니다.';
        log.append(empty);
      } else {
        const list = document.createElement('ol');
        list.className = 'bc-loglist';
        for (const entry of [...state.log].reverse()) {
          const row = document.createElement('li');
          const label = document.createElement('b');
          label.className = 'bc-decision' + (entry.decision === '차단' ? ' bc-restricted' : '');
          label.textContent = entry.decision;
          const detail = document.createElement('span');
          detail.textContent = '제안 ' + (entry.index + 1) + ' · 이전 ' + entry.before + ' / 제안 ' + entry.target;
          const applied = document.createElement('strong');
          applied.textContent = '적용값 ' + entry.after;
          row.append(label, detail, applied);
          list.append(row);
        }
        log.append(list);
      }
    }

    function decide(action) {
      const next = details();
      if (!next) return;
      const blocked = next.problems.length > 0;
      let decision;
      if (state.mode === 'auto' && action === 'evaluate') decision = blocked ? '차단' : '자동 적용';
      else if (state.mode === 'manual' && blocked && action === 'block') decision = '차단';
      else if (state.mode === 'manual' && !blocked && action === 'approve') decision = '승인';
      else if (state.mode === 'manual' && !blocked && action === 'reject') decision = '거절';
      else return;
      const before = state.setpoint;
      if (decision === '승인' || decision === '자동 적용') state.setpoint = next.target;
      state.log.push({ index: state.index, before, target: next.target, after: state.setpoint, decision });
      state.index++;
      save(keys.pilot, state);
      render();
    }
    for (const mode of ['manual', 'auto']) {
      get('bc-mode-' + mode).addEventListener('change', () => {
        state.mode = mode;
        save(keys.pilot, state);
        render();
      });
    }
    for (const [id, action] of [['approve', 'approve'], ['reject', 'reject'], ['auto', 'evaluate'], ['block', 'block']]) {
      get('bc-' + id).addEventListener('click', () => decide(action));
    }
    get('bc-reset').addEventListener('click', () => {
      Object.assign(state, first());
      save(keys.pilot, state);
      render();
    });
    render();
  }

  function boot() {
    if (get('notify-root')) installNotifications(get('notify-root'));
    if (get('pilot-root')) installPilot(get('pilot-root'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
