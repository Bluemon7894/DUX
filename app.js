/**
 * DUX — 홍보 웹사이트 인터랙션
 * 헤더/메뉴, 모션 제어, 스크롤 등장, 페이지 경로선, 사용 방법 스티키 화면,
 * 시나리오 스크롤 스토리, 기능 카드 타이핑, 출시 알림 양식
 */
(function () {
  "use strict";

  const root = document.documentElement;
  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const config = window.DUX_CONFIG || {};
  const demo = window.DUX_DEMO || {};
  const motion = { paused: reduceMQ.matches };
  const motionOn = () => !motion.paused && !reduceMQ.matches;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- 스크롤 처리 (rAF 1회로 묶음) ---------- */
  const scrollTasks = [];
  let ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      for (const fn of scrollTasks) fn();
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  /* ---------- 헤더 & 모바일 메뉴 ---------- */
  const header = document.getElementById("site-header");
  const nav = document.getElementById("main-nav");
  const menuBtn = document.getElementById("menu-btn");

  scrollTasks.push(() => header.classList.toggle("is-scrolled", window.scrollY > 8));

  function setMenu(open) {
    nav.classList.toggle("is-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
    menuBtn.querySelector("use").setAttribute("href", open ? "#i-close" : "#i-menu");
  }
  menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("is-open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) { setMenu(false); menuBtn.focus(); }
  });

  // 현재 섹션 메뉴 표시
  const navLinks = [...nav.querySelectorAll("a")];
  if ("IntersectionObserver" in window) {
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        navLinks.forEach((a) => {
          const on = a.getAttribute("href") === "#" + en.target.id;
          a.classList.toggle("is-active", on);
          on ? a.setAttribute("aria-current", "true") : a.removeAttribute("aria-current");
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    navLinks.forEach((a) => { const s = document.querySelector(a.getAttribute("href")); if (s) navIO.observe(s); });
    ["top", "notify"].forEach((id) => { const s = document.getElementById(id); if (s) navIO.observe(s); });
  }

  /* ---------- 모션 일시정지 토글 ---------- */
  const motionBtn = document.getElementById("motion-toggle");
  function applyMotion() {
    root.classList.toggle("motion-paused", motion.paused);
    motionBtn.setAttribute("aria-pressed", String(motion.paused));
    motionBtn.querySelector("use").setAttribute("href", motion.paused ? "#i-play" : "#i-pause");
    motionBtn.querySelector("span").textContent = motion.paused ? "모션 재생" : "모션 멈추기";
    document.dispatchEvent(new CustomEvent("dux:motion", { detail: { paused: motion.paused } }));
  }
  motionBtn.addEventListener("click", () => { motion.paused = !motion.paused; applyMotion(); });
  reduceMQ.addEventListener && reduceMQ.addEventListener("change", (e) => { motion.paused = e.matches; applyMotion(); });
  applyMotion();

  /* ---------- 스크롤 등장 ---------- */
  const reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMQ.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.08 });
    reveals.forEach((el) => io.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("is-in"));
  }

  /* ---------- 페이지 전체를 잇는 경로선 (데스크톱) ---------- */
  (function pageRoute() {
    const svg = document.getElementById("page-route");
    const main = document.getElementById("main");
    if (!svg || !main) return;
    const base = svg.querySelector(".page-route__base");
    const drawP = svg.querySelector(".page-route__draw");
    const head = svg.querySelector(".page-route__head");
    const desktop = window.matchMedia("(min-width: 1024px)");
    let table = [];
    let total = 0;

    function build() {
      if (!desktop.matches) { svg.classList.remove("is-ready"); return; }
      const w = main.clientWidth;
      const sections = [...main.querySelectorAll("[data-route-anchor]")];
      const pad = Math.max(24, (w - 1200) / 2 * 0.55 + 20);
      const xs = [w - pad, pad];
      let d = "";
      sections.forEach((sec, i) => {
        const x = xs[i % 2];
        const top = sec.offsetTop + (i === 0 ? sec.offsetHeight * 0.55 : 110);
        const bottom = sec.offsetTop + sec.offsetHeight - 110;
        if (i === 0) d += `M ${w * 0.78} ${top} C ${w * 0.78} ${top + 120}, ${x} ${bottom - 160}, ${x} ${bottom}`;
        else {
          const prevX = xs[(i - 1) % 2];
          const prevBottom = sections[i - 1].offsetTop + sections[i - 1].offsetHeight - 110;
          d += ` C ${prevX} ${prevBottom + 140}, ${x} ${top - 140}, ${x} ${top} L ${x} ${Math.max(top, bottom)}`;
        }
      });
      svg.setAttribute("viewBox", `0 0 ${w} ${main.offsetHeight}`);
      base.setAttribute("d", d);
      drawP.setAttribute("d", d);
      total = drawP.getTotalLength();
      drawP.style.strokeDasharray = `${total}`;
      table = [];
      const steps = 240;
      for (let i = 0; i <= steps; i++) {
        const l = (total * i) / steps;
        const p = drawP.getPointAtLength(l);
        table.push({ l, x: p.x, y: p.y });
      }
      svg.classList.add("is-ready");
      update();
    }

    function update() {
      if (!table.length || !desktop.matches) return;
      const target = window.scrollY + window.innerHeight * 0.6 - main.offsetTop;
      let lo = 0, hi = table.length - 1;
      if (target <= table[0].y) hi = 0;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        table[mid].y <= target ? (lo = mid) : (hi = mid - 1);
      }
      const p = table[lo];
      drawP.style.strokeDashoffset = `${total - p.l}`;
      head.setAttribute("cx", p.x);
      head.setAttribute("cy", p.y);
    }

    scrollTasks.push(update);
    let rt;
    const rebuild = () => { clearTimeout(rt); rt = setTimeout(build, 150); };
    if ("ResizeObserver" in window) new ResizeObserver(rebuild).observe(main);
    window.addEventListener("load", build);
    build();
  })();

  /* ---------- 사용 방법: 단계별 화면 전환 ---------- */
  (function howSteps() {
    const phone = document.getElementById("how-phone");
    const wrap = phone && phone.closest(".how-phone-wrap");
    const steps = [...document.querySelectorAll(".how-steps .step")];
    if (!phone || !steps.length) return;

    // 모바일: 각 단계 안에 해당 화면 복제
    steps.forEach((step, i) => {
      const media = step.querySelector(".step-media");
      const src = phone.querySelector(`.screen[data-screen="${i}"]`);
      if (!media || !src) return;
      const mini = document.createElement("div");
      mini.className = "phone";
      mini.innerHTML = '<div class="phone__notch"></div><div class="phone__screen"></div>';
      const screen = mini.querySelector(".phone__screen");
      screen.appendChild(phone.querySelector(".ui-status").cloneNode(true));
      screen.appendChild(src.cloneNode(true));
      media.appendChild(mini);
    });

    function setStep(i) {
      phone.dataset.step = String(i);
      if (wrap) wrap.dataset.active = String(i);
      steps.forEach((s, k) => s.classList.toggle("is-active", k === i));
    }
    setStep(0);

    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setStep(Number(en.target.dataset.step)); });
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((s) => io.observe(s));

    const mediaIO = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); mediaIO.unobserve(en.target); } });
    }, { threshold: 0.4 });
    document.querySelectorAll(".step-media").forEach((m) => mediaIO.observe(m));
  })();

  /* ---------- 대표 시나리오: 스크롤 스토리 ---------- */
  (function story() {
    const phone = document.getElementById("story-phone");
    const track = document.getElementById("story-track");
    const eta = document.getElementById("story-eta");
    const meDot = document.getElementById("story-dot");
    const path = document.getElementById("story-p1");
    const beats = [...document.querySelectorAll(".story-beats .beat")];
    const beatData = (demo.story && demo.story.beats) || [];
    if (!phone || !beats.length) return;

    let current = -1;
    const walkLen = 98; // 집 앞(40,330) → 정류장(40,232)
    const pathLen = path ? path.getTotalLength() : 0;
    const stopFrac = pathLen ? walkLen / pathLen : 0;

    function moveDot(f) {
      if (!path || !meDot) return;
      // pathLength="1"로 정규화되어 있어도 getPointAtLength는 실제 길이를 사용
      const p = path.getPointAtLength(clamp(f, 0, 1) * stopFrac * pathLen);
      meDot.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
    }

    function setBeat(i) {
      if (i === current) return;
      current = i;
      phone.dataset.beat = String(i);
      beats.forEach((b, k) => b.classList.toggle("is-active", k === i));
      const d = beatData[i];
      if (d && eta) {
        eta.dataset.tone = d.etaTone;
        eta.querySelector("use").setAttribute("href", "#i-" + d.etaIcon);
        const span = eta.querySelector("span");
        span.textContent = d.eta;
        eta.classList.remove("is-swap");
        void eta.offsetWidth;
        eta.classList.add("is-swap");
      }
      if (!motionOn()) moveDot(i >= 2 ? 1 : 0);
    }
    setBeat(0);

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver((entries) => {
        entries.forEach((en) => { if (en.isIntersecting) setBeat(Number(en.target.dataset.beat)); });
      }, { rootMargin: "-48% 0px -48% 0px" });
      beats.forEach((b) => io.observe(b));
    }

    // 2~3단계 사이 스크롤에 따라 사용자 위치가 정류장까지 이동
    scrollTasks.push(() => {
      if (!motionOn()) return;
      const r = track.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const b1 = beats[1].getBoundingClientRect();
      const b3 = beats[2].getBoundingClientRect();
      const mid = window.innerHeight * 0.5;
      const f = (mid - b1.top) / Math.max(1, b3.top + b3.height * 0.5 - b1.top);
      moveDot(f);
    });
  })();

  /* ---------- 기능 카드: 자연어 입력 타이핑 ---------- */
  (function typewriter() {
    const el = document.getElementById("typewriter");
    const lines = demo.promptExamples || [];
    if (!el || !lines.length) return;
    let li = 0, ci = lines[0].length, deleting = true, visible = false, timer = 0;

    function tick() {
      timer = 0;
      if (!visible || !motionOn()) return;
      const line = lines[li];
      if (deleting) {
        ci = Math.max(0, ci - 2);
        if (ci === 0) { deleting = false; li = (li + 1) % lines.length; }
      } else {
        ci++;
        if (ci >= lines[li].length) { deleting = true; el.textContent = lines[li]; timer = setTimeout(tick, 2200); return; }
      }
      el.textContent = (deleting ? line : lines[li]).slice(0, ci) || " ";
      timer = setTimeout(tick, deleting ? 28 : 70);
    }
    function kick() { if (!timer && visible && motionOn()) timer = setTimeout(tick, 1600); }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; kick(); }, { threshold: 0.3 }).observe(el);
    }
    document.addEventListener("dux:motion", () => {
      if (!motionOn()) { clearTimeout(timer); timer = 0; el.textContent = lines[li]; ci = lines[li].length; deleting = true; }
      else kick();
    });
  })();

  /* ---------- 출시 알림 / 체험 신청 양식 ---------- */
  (function notifyForm() {
    const form = document.getElementById("notify-form");
    if (!form) return;
    const input = form.querySelector("#notify-email");
    const status = form.querySelector("#notify-status");
    const btn = form.querySelector("button[type=submit]");

    function say(msg, tone) { status.textContent = msg; status.dataset.tone = tone || ""; }

    input.addEventListener("input", () => { input.removeAttribute("aria-invalid"); if (status.dataset.tone === "error") say(""); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = input.value.trim();
      if (!email || !input.checkValidity()) {
        input.setAttribute("aria-invalid", "true");
        say("이메일 주소를 확인해 주세요. 예: name@example.com", "error");
        input.focus();
        return;
      }
      const intent = form.querySelector("input[name=intent]:checked").value;
      const label = intent === "beta" ? "체험 참여 신청" : "출시 알림 신청";

      if (!config.signupEndpoint) {
        say(`${label} 접수 기능은 아직 연결되지 않았어요. 입력하신 이메일은 저장되거나 전송되지 않았어요. 접수가 시작되면 이 양식에서 바로 신청할 수 있도록 준비하고 있어요.`, "info");
        return;
      }

      btn.disabled = true;
      say("신청을 보내는 중이에요…");
      try {
        const res = await fetch(config.signupEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, intent })
        });
        if (!res.ok) throw new Error(String(res.status));
        say(`${label}이 접수됐어요. 고마워요!`, "ok");
        form.reset();
      } catch (err) {
        say("지금은 신청을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  })();

  /* ---------- 문의 링크 (설정된 경우에만 활성화) ---------- */
  document.querySelectorAll("[data-contact]").forEach((slot) => {
    if (!config.contactEmail) return;
    const a = document.createElement("a");
    a.href = "mailto:" + config.contactEmail;
    a.textContent = "문의하기 (" + config.contactEmail + ")";
    slot.replaceWith(a);
  });

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  onScroll();
})();
