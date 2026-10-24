/**
 * DUX v2 — anime.js 스크롤 연동 3D 장면
 *  1. 히어로: 위에서 보던 도시가 스크롤로 기울며 솟아오르고, 경로 → 지연 → 재추천이 진행
 *  2. 말하기: 문장 속 조건이 3D 큐브로 날아와 쌓인 뒤 한 줄로 정렬
 *  3. 다시 안내: 휴대폰이 3D로 회전하며 화면이 맞춤 경로 → 지연 → 대안으로 전환
 * 모션 감소 설정이거나 스크립트를 불러오지 못하면 .anim 없이 최종 상태만 보여줍니다.
 */
import { animate, createTimeline, onScroll, stagger, splitText, svg } from "./vendor/anime.esm.min.js";

const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isNarrow = () => window.innerWidth < 1024;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- 도시 격자 생성 ---------- */
const SIZE = 9;
const ROUTE_A = [[8, 0], [7, 0], [6, 0], [6, 1], [6, 2], [6, 3], [5, 3], [4, 3], [3, 3], [3, 4], [3, 5], [3, 6], [2, 6], [1, 6], [1, 7], [1, 8], [0, 8]];
const DIVERGE = 5; // (6,3)에서 대안 경로가 갈라짐
const DELAY = 7;   // (4,3) 402번 버스 지연 지점
const ROUTE_C = [[6, 3], [6, 4], [6, 5], [6, 6], [6, 7], [5, 7], [4, 7], [3, 7], [2, 7], [2, 8], [1, 8], [0, 8]];
const PARKS = [[1, 1], [7, 5], [4, 5], [0, 3]];

function buildCity() {
  const plane = $("#plane");
  if (!plane) return;
  const key = (r, c) => r * SIZE + c;
  const inA = new Map(ROUTE_A.map((p, i) => [key(...p), i]));
  const inC = new Map(ROUTE_C.map((p, i) => [key(...p), i]));
  const parks = new Set(PARKS.map((p) => key(...p)));
  let seed = 23;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const frag = document.createDocumentFragment();

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const k = key(r, c);
      const cell = document.createElement("div");
      cell.className = "cell";
      const a = inA.get(k);
      const cc = inC.get(k);
      if (a !== undefined || cc !== undefined) {
        cell.classList.add("cell--road");
        if (a !== undefined) {
          cell.classList.add("cell--ra");
          cell.dataset.a = a;
          cell.insertAdjacentHTML("beforeend", '<i class="g g--a"></i>');
          if (a > DIVERGE && cc === undefined) {
            cell.classList.add("cell--rw");
            cell.insertAdjacentHTML("beforeend", '<i class="g g--w"></i>');
          }
        }
        if (cc !== undefined && cc > 0) {
          cell.classList.add("cell--rc");
          cell.dataset.c = cc;
          cell.insertAdjacentHTML("beforeend", '<i class="g g--c"></i>');
        }
        if (a === 0) cell.classList.add("cell--start");
        if (a === ROUTE_A.length - 1) cell.classList.add("cell--end");
        if (a === DELAY) {
          cell.insertAdjacentHTML("beforeend",
            '<span class="sign"><span class="sign__in"><svg class="ic"><use href="#i-bus"/></svg>402번 9분 지연</span></span>');
        }
      } else if (parks.has(k)) {
        cell.classList.add("cell--park");
      } else {
        // 경로 바로 옆 블록은 낮게 두어 경로가 가려지지 않게 함
        const nearRoute = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => inA.has(key(r + dr, c + dc)) || inC.has(key(r + dr, c + dc)));
        const hmax = (0.25 + Math.pow(rand(), 1.6) * (nearRoute ? 0.7 : 1.5)).toFixed(2);
        const glass = rand() > 0.86 ? " bld--glass" : "";
        const dist = Math.hypot(r - 4, c - 4).toFixed(2);
        cell.innerHTML = `<div class="bld${glass}" style="--hmax:${hmax}" data-d="${dist}"><i class="t"></i><i class="f"></i><i class="r"></i><i class="l"></i></div>`;
      }
      frag.appendChild(cell);
    }
  }
  plane.appendChild(frag);
}

/* ---------- 출시 알림 양식 · 문의 링크 (모션과 무관) ---------- */
function setupForm() {
  const config = window.DUX_CONFIG || {};
  const form = $("#notify-form");
  if (form) {
    const input = $("#notify-email", form);
    const status = $("#notify-status", form);
    const btn = $("button[type=submit]", form);
    const say = (msg, tone) => { status.textContent = msg; status.dataset.tone = tone || ""; };
    input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!input.value.trim() || !input.checkValidity()) {
        input.setAttribute("aria-invalid", "true");
        say("이메일 주소를 확인해 주세요. 예: name@example.com", "error");
        input.focus();
        return;
      }
      const intent = $("input[name=intent]:checked", form).value;
      const label = intent === "beta" ? "체험 참여 신청" : "출시 알림 신청";
      if (!config.signupEndpoint) {
        say(`${label} 접수 기능은 아직 연결되지 않았어요. 입력하신 이메일은 저장되거나 전송되지 않았어요.`, "info");
        return;
      }
      btn.disabled = true;
      say("신청을 보내는 중이에요…");
      try {
        const res = await fetch(config.signupEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: input.value.trim(), intent })
        });
        if (!res.ok) throw new Error(String(res.status));
        say(`${label}이 접수됐어요. 고마워요!`, "ok");
        form.reset();
      } catch {
        say("지금은 신청을 보낼 수 없어요. 잠시 후 다시 시도해 주세요.", "error");
      } finally {
        btn.disabled = false;
      }
    });
  }
  $$("[data-contact]").forEach((slot) => {
    if (!config.contactEmail) return;
    const a = document.createElement("a");
    a.href = "mailto:" + config.contactEmail;
    a.textContent = "문의하기 (" + config.contactEmail + ")";
    slot.replaceWith(a);
  });
}

/* ---------- 글자 분리 + 그라데이션 이어 붙이기 ---------- */
function splitChars(el) {
  const chars = splitText(el, { chars: { class: "ch" } }).chars;
  if (el.classList.contains("split--accent")) {
    const w = el.offsetWidth;
    chars.forEach((ch) => {
      ch.style.backgroundSize = `${w}px 100%`;
      ch.style.backgroundPosition = `${-ch.offsetLeft}px 0`;
    });
  }
  return chars;
}

/* ---------- 1. 히어로 ---------- */
function heroScene() {
  const scene = $(".scene--hero");
  const plane = $("#plane");
  const blds = $$(".bld", plane);
  const glowA = $$(".cell--ra", plane).sort((p, q) => p.dataset.a - q.dataset.a).map((c) => $(".g--a", c));
  const tailA = $$(".cell--rw", plane).map((c) => $(".g--a", c));
  const warn = $$(".cell--rw .g--w", plane);
  const glowC = $$(".cell--rc", plane).sort((p, q) => p.dataset.c - q.dataset.c).map((c) => $(".g--c", c));
  const sign = $(".sign", plane);
  const steps = $$(".hs");
  const bars = steps.map((s) => $(".hs__bar i", s));
  const etas = $$(".eta");

  const tl = createTimeline({
    defaults: { ease: "inOutQuad" },
    autoplay: onScroll({ target: scene, enter: "top top", leave: "bottom bottom", sync: true })
  });

  tl
    .add(plane, { "--rx": [22, 56], "--rz": [-6, -36], "--sc": [0.82, 1], duration: 320 }, 0)
    .add(blds, { "--h": [0.06, 1], duration: 220, delay: (el) => Number(el.dataset.d) * 18, ease: "outQuad" }, 0)
    .add(steps[0], { opacity: [0.35, 1], duration: 40 }, 300)
    .add(bars[0], { scaleX: [0, 1], duration: 280, ease: "linear" }, 320)
    .add(glowA, { opacity: [0, 1], duration: 60, delay: stagger(15) }, 330)
    // 지연 발생
    .add(steps[0], { opacity: 0.35, duration: 40 }, 600)
    .add(steps[1], { opacity: [0.35, 1], duration: 40 }, 600)
    .add(bars[1], { scaleX: [0, 1], duration: 100, ease: "linear" }, 600)
    .add(sign, { opacity: [0, 1], duration: 60, ease: "outQuad" }, 610)
    .add(etas[0], { opacity: [1, 0], duration: 40 }, 610)
    .add(etas[1], { opacity: [0, 1], duration: 40 }, 630)
    .add(tailA, { opacity: 0.2, duration: 60 }, 640)
    .add(warn, { opacity: [0, 1], duration: 60, delay: stagger(6) }, 640)
    // 조건 유지 재추천
    .add(steps[1], { opacity: 0.35, duration: 40 }, 720)
    .add(steps[2], { opacity: [0.35, 1], duration: 40 }, 720)
    .add(bars[2], { scaleX: [0, 1], duration: 240, ease: "linear" }, 720)
    .add(glowC, { opacity: [0, 1], duration: 60, delay: stagger(16) }, 730)
    .add(warn, { opacity: 0.35, duration: 80 }, 880)
    .add(etas[1], { opacity: 0, duration: 40 }, 880)
    .add(etas[2], { opacity: [0, 1], duration: 40 }, 900)
    .add(sign, { opacity: 0.45, duration: 60 }, 900)
    .add(plane, { "--rz": -42, duration: 100, ease: "linear" }, 900);

  // 마우스 위치에 따라 도시가 살짝 기울어짐 (정밀 포인터만)
  if (window.matchMedia("(pointer: fine)").matches) {
    const tilt = $("#city-tilt");
    scene.addEventListener("pointermove", (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      tilt.style.transform = `rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 8).toFixed(2)}deg)`;
    }, { passive: true });
  }
}

/* ---------- 2. 말하기 ---------- */
function speakScene() {
  const scene = $(".scene--speak");
  const hls = $$(".hl__bg", scene);
  const cubes = $$(".cube", scene);
  const engine = $(".engine", scene);
  const line = $(".engine__line", scene);

  const tl = createTimeline({
    defaults: { ease: "inOutQuad" },
    autoplay: onScroll({ target: scene, enter: "top top", leave: "bottom bottom", sync: true })
  });

  cubes.forEach((cube, i) => {
    const at = 40 + i * 230;
    tl.add(hls[i], { scaleX: [0, 1], duration: 120 }, at)
      .add(cube, {
        opacity: [0, 1],
        translateX: [isNarrow() ? "0%" : "-170%", "0%"],
        translateY: ["-260%", `${(1 - i) * 106}%`],
        translateZ: [-700, 0],
        rotateX: [-160, -18],
        rotateY: [220, 24],
        duration: 220,
        ease: "outQuad"
      }, at + 40);
  });

  tl.add(cubes, {
    translateX: (el, i) => `${(i - 1) * 125}%`,
    translateY: "0%",
    rotateY: 384,
    duration: 180,
    delay: stagger(20)
  }, 760)
    .add(engine, { opacity: [0, 1], translateY: [20, 0], duration: 80 }, 900)
    .add(line, { scaleY: [0, 1], duration: 80 }, 910);
}

/* ---------- 3. 다시 안내 ---------- */
function rerouteScene() {
  const scene = $(".scene--reroute");
  const phone = $("#phone3d");
  const scr = $$(".scr", scene);
  const rr = $$(".rr", scene);
  const marquee = $(".marquee span", scene);
  const dim = isNarrow() ? 0 : 0.3;

  const tl = createTimeline({
    defaults: { ease: "inOutQuad" },
    autoplay: onScroll({ target: scene, enter: "top top", leave: "bottom bottom", sync: true })
  });

  tl.add(phone, { rotateY: [-32, 22], rotateX: [10, -4], translateZ: [-120, 0], duration: 1000, ease: "linear" }, 0)
    .add(marquee, { translateX: ["0%", "-35%"], duration: 1000, ease: "linear" }, 0)
    .add(rr[0], { opacity: [dim, 1], duration: 50 }, 20)
    // 지연 화면
    .add(scr[0], { opacity: [1, 0], translateY: [0, -20], duration: 60 }, 320)
    .add(scr[1], { opacity: [0, 1], translateY: [20, 0], duration: 60 }, 340)
    .add(rr[0], { opacity: dim, duration: 50 }, 320)
    .add(rr[1], { opacity: [dim, 1], duration: 50 }, 340)
    .add(phone, { scale: [1, 1.04, 1], duration: 80 }, 330)
    // 대안 화면
    .add(scr[1], { opacity: 0, translateY: -20, duration: 60 }, 640)
    .add(scr[2], { opacity: [0, 1], translateY: [20, 0], duration: 60 }, 660)
    .add(rr[1], { opacity: dim, duration: 50 }, 640)
    .add(rr[2], { opacity: [dim, 1], duration: 50 }, 660);
}

/* ---------- 기능 · 신뢰 · CTA 등장 ---------- */
function revealScenes() {
  const cards = $$(".fc");
  animate(cards, {
    opacity: [0, 1],
    translateY: [60, 0],
    rotateX: [-30, 0],
    duration: 1100,
    ease: "outExpo",
    delay: stagger(90, { grid: isNarrow() ? [1, 6] : [3, 2], from: "center" }),
    autoplay: onScroll({ target: $("#fgrid"), enter: "85% top", repeat: false })
  });

  const flow = $("#flow");
  const [drawable] = svg.createDrawable("#flow-path");
  animate(drawable, {
    draw: ["0 0", "0 1"],
    ease: "linear",
    autoplay: onScroll({ target: flow, enter: "bottom top", leave: "center center", sync: true })
  });
  animate($$(".flow__nodes li"), {
    opacity: [0, 1],
    translateY: [30, 0],
    scale: [0.9, 1],
    duration: 900,
    ease: "outExpo",
    delay: stagger(140),
    autoplay: onScroll({ target: flow, enter: "85% top", repeat: false })
  });

  $$(".cta__title .split").forEach((el, i) => {
    animate(splitChars(el), {
      opacity: [0, 1],
      translateY: ["0.6em", "0em"],
      rotateZ: [8, 0],
      duration: 900,
      ease: "outExpo",
      delay: stagger(28, { start: i * 300 }),
      autoplay: onScroll({ target: $(".cta__title"), enter: "85% top", repeat: false })
    });
  });
}

/* ---------- 시작 ---------- */
buildCity();
setupForm();

if (!reduceMotion) {
  root.classList.add("anim");

  // 히어로 제목: 로드 시 글자 단위 등장
  $$(".hero__title .split").forEach((el, i) => {
    animate(splitChars(el), {
      opacity: [0, 1],
      translateY: ["0.5em", "0em"],
      rotateX: [-70, 0],
      duration: 1000,
      ease: "outExpo",
      delay: stagger(40, { start: 150 + i * 320 })
    });
  });

  heroScene();
  speakScene();
  rerouteScene();
  revealScenes();
}
