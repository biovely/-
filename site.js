(() => {
  const titles = { home: "배양 공정 분석실", replay: "사건 재생", evidence: "검증 결과", pilot: "AI 운전", notify: "휴대폰 알림 설정" };
  const nav = document.getElementById("nav");
  const menu = document.getElementById("menu-toggle");
  const main = document.getElementById("main");
  let currentView;
  function closeMenu() {
    menu.setAttribute("aria-expanded", "false");
    menu.setAttribute("aria-label", "메뉴 열기");
    nav.classList.remove("open");
  }
  function route() {
    const fragment = location.hash.slice(1).replace(/^\//, "");
    const [path, query = ""] = fragment.split("?");
    const entries = path.split("/");
    const timeText = new URLSearchParams(query).get("at");
    const alarmHour = timeText !== null && /^\d+(?:\.\d+)?$/.test(timeText) ? Number(timeText) : undefined;
    const guided = entries[0] === "guided";
    const name = guided ? "replay" : Object.hasOwn(titles, entries[0]) ? entries[0] : "home";
    let caseId;
    try { caseId = entries[1] && decodeURIComponent(entries.slice(1).join("/")); } catch { caseId = undefined; }
    if (currentView === "replay" && name !== "replay") window.BioReplay?.close?.();
    for (const section of document.querySelectorAll("main > .view")) section.hidden = section.id !== name;
    for (const link of document.querySelectorAll("[data-route]")) {
      if (link.dataset.route === name) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    closeMenu();
    document.title = titles[name] + " · BIO BLACK BOX";
    if (name === "replay") window.BioReplay?.open(guided ? "hidden99" : caseId, guided, alarmHour);
    if (currentView !== undefined) {
      window.scrollTo(0, 0);
      main.focus({ preventScroll: true });
    }
    currentView = name;
  }
  menu.addEventListener("click", () => {
    if (nav.classList.contains("open")) closeMenu();
    else {
      nav.classList.add("open");
      menu.setAttribute("aria-expanded", "true");
      menu.setAttribute("aria-label", "메뉴 닫기");
    }
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && nav.classList.contains("open")) { closeMenu(); menu.focus(); }
  });
  document.getElementById("skip").addEventListener("click", event => { event.preventDefault(); main.focus(); });
  document.querySelectorAll(".plot-switch button").forEach(button => {
    button.addEventListener("click", () => {
      for (const plot of document.querySelectorAll(".hero-plot")) plot.hidden = plot.id !== button.dataset.gas;
      for (const peer of document.querySelectorAll(".plot-switch button")) peer.setAttribute("aria-pressed", String(peer === button));
    });
  });
  nav.addEventListener("click", closeMenu);
  window.addEventListener("hashchange", route);
  route();
})();
