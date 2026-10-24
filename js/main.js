/**
 * DUX 홍보 사이트 — 1인칭으로 걷는 거리
 *
 * 스크롤 진행률 p(0~1)에 따라
 *  - 카메라(눈높이 1.6m)가 집 앞 골목 → 이면도로 → 횡단보도 → 버스정류장 → 지하철 엘리베이터 → (지하철) → 400번 버스 안 → 도착지로 이동하고
 *  - 바닥의 금색 경로선, 버스정보안내기, 손에 든 휴대폰의 DUX 화면과 지도가 함께 바뀝니다.
 * 하늘·조명은 방문자의 실제 현재 시각을 따릅니다(낮·노을·밤·새벽). 점검용: ?t=18.5 처럼 시각을, ?p=0.45 처럼 진행률을 지정.
 * 거리 데이터는 <meta name="dux-city-data"> 에 경로가 있으면 그 파일(OpenStreetMap 변환본)을, 없으면 js/scene/city-gen.js 의 생성 동네를 씁니다.
 */
import { WebGLRenderer, Scene, PerspectiveCamera, FogExp2, HemisphereLight, DirectionalLight, Vector3, Color } from "../vendor/three.min.js";
import { generateCity } from "./scene/city-gen.js";
import { buildCity, resample } from "./scene/city-build.js";
import { createSky, skyAt, fogUniforms, patchFog } from "./scene/sky.js";
import { createPhoneMap } from "./phone-map.js";
import { createBusRide } from "./scene/bus-ride.js";

const root = document.documentElement;
const qs = new URLSearchParams(location.search);
// 점검용 위치 지정(?dev&p=0.45)은 dev 가 있을 때만. 일반 방문은 항상 첫 장면부터.
const DEV_P = qs.has("dev") ? parseFloat(qs.get("p")) : NaN;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 760px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
const toPts = (flat) => { const o = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const DEG = Math.PI / 180;

/* ==========================================================================
   실제 시각
   ========================================================================== */
const NOW = new Date();
const qt = parseFloat(qs.get("t"));
const START_MIN = Number.isFinite(qt) ? qt * 60 : NOW.getHours() * 60 + NOW.getMinutes() + NOW.getSeconds() / 60;
function fmt(min, pad = true) {
  const m = ((Math.floor(min) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60), mm = m % 60;
  return `${pad ? String(h).padStart(2, "0") : h}:${String(mm).padStart(2, "0")}`;
}
// 이동 경과 시간(분): 출발 → 정류장 4분 → 지연 → 지하철 → 400번 버스 → 35분 뒤 도착 (+출발 전 4분)
function tripMin(p) {
  let m = 4 * smooth(0.33, 0.5, p);
  if (p > 0.62) m = 4 + 4 * smooth(0.62, 0.735, p);
  if (p > 0.735) m = 8 + 12 * smooth(0.741, 0.756, p);
  if (p > 0.756) m = 20 + 11 * smooth(0.771, 0.803, p);
  if (p > 0.803) m = 31 + 8 * smooth(0.82, 0.905, p);
  return m;
}
function fillTimes() {
  $$("[data-t]").forEach((el) => { el.textContent = fmt(START_MIN + Number(el.dataset.t)); });
  $$('[data-clock="now"]').forEach((el) => { el.textContent = fmt(START_MIN, false); });
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  $$("[data-date]").forEach((el) => { el.textContent = `${NOW.getMonth() + 1}월 ${NOW.getDate()}일 ${days[NOW.getDay()]}요일`; });
}

/* ==========================================================================
   렌더러 · 장면
   ========================================================================== */
const canvas = $("#scene");
let renderer = null;
try {
  renderer = new WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: "high-performance" });
} catch (e) {
  root.classList.add("no-webgl");
}
const scene = new Scene();
scene.fog = new FogExp2(new Color("#0e1320"), 0.006);
const camera = new PerspectiveCamera(62, 1, 0.2, 2600);
const hemi = new HemisphereLight("#3f4f7c", "#0f0c09", 0.4);
const sunLight = new DirectionalLight("#8aa0d0", 0.1);
scene.add(hemi, sunLight, sunLight.target);
const sky = createSky();
scene.add(sky.mesh);

let world = null;
let paths = null;
let phoneMap = null;
let mapData = null;
let citySource = "procedural";

async function loadCity() {
  const src = document.querySelector('meta[name="dux-city-data"]')?.content;
  if (!src) return generateCity();
  try {
    const res = await fetch(src, { cache: "no-store" });
    if (res.ok) { const data = await res.json(); citySource = data.source || "osm"; return data; }
  } catch (e) { /* 없으면 생성 동네 */ }
  return generateCity();
}

function sampler(flat) {
  const rs = resample(flat, 0.5);
  const at = (d) => {
    d = clamp(d, 0, rs.length);
    let lo = 0, hi = rs.dist.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; rs.dist[m] <= d ? (lo = m) : (hi = m); }
    const t = (d - rs.dist[lo]) / ((rs.dist[hi] - rs.dist[lo]) || 1);
    return [lerp(rs.pts[lo][0], rs.pts[hi][0], t), lerp(rs.pts[lo][1], rs.pts[hi][1], t)];
  };
  // d 이후 남은 경로 점들
  const rest = (d) => [at(d), ...rs.pts.filter((_, i) => rs.dist[i] > d)];
  return { length: rs.length, at, rest };
}

// 버스 노선: 양 끝 너머로도 곧게 이어짐 (출발 전 · 떠난 뒤)
function busPath(flat) {
  const s = sampler(flat), n = flat.length;
  const a = [flat[0], flat[1]], b = [flat[n - 2], flat[n - 1]];
  const y0 = yawTo(a, [flat[2], flat[3]]), y1 = yawTo([flat[n - 4], flat[n - 3]], b);
  const pose = (d) => {
    if (d < 0) return [a[0] + Math.cos(y0) * d, a[1] + Math.sin(y0) * d, y0];
    if (d > s.length) { const e = d - s.length; return [b[0] + Math.cos(y1) * e, b[1] + Math.sin(y1) * e, y1]; }
    return [...s.at(d), yawTo(s.at(Math.max(0, d - 1)), s.at(Math.min(s.length, d + 1)))];
  };
  return { length: s.length, pose };
}

/* ==========================================================================
   1인칭 카메라
   ========================================================================== */
const EYE = 1.62;
const fwd = new Vector3();
const tod = {};
function yawTo(from, to) { return Math.atan2(to[1] - from[1], to[0] - from[0]); }
function angLerp(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

function walk(path, d) {
  const p = path.at(d);
  const ahead = path.at(Math.min(path.length, d + 6));
  const back = path.at(Math.max(0, d - 0.5));
  const yaw = d + 6 > path.length ? yawTo(back, path.at(path.length)) : yawTo(p, ahead);
  return { x: p[0], z: p[1], yaw: Number.isFinite(yaw) ? yaw : 0 };
}

// 지하철에서 올라와 400번 버스를 타고, 도서관 입구에서 가운데 문으로 내린 뒤 버스가 떠남 (진행률)
const BUS = { show: 0.752, close: 0.764, go: 0.771, stop: 0.803, out: 0.82, leave: 0.832, gone: 0.875 };
const busPose = { x: 0, z: 0, yaw: 0, show: false, inside: false, doors: 0, arriving: false };
function busState(p) {
  const R = world.bus, b = paths.bus;
  let d = lerp(-R.CAM.z, b.length - R.DOOR.z, smooth(BUS.go, BUS.stop, p));
  if (p > BUS.leave) d += 240 * Math.pow(smooth(BUS.leave, BUS.gone, p), 2);
  [busPose.x, busPose.z, busPose.yaw] = b.pose(d);
  busPose.show = p > BUS.show && p < BUS.gone;
  busPose.inside = p < BUS.out;
  busPose.doors = Math.max(1 - smooth(BUS.close, BUS.go, p), smooth(BUS.stop, BUS.stop + 0.004, p) * (1 - smooth(BUS.out + 0.002, BUS.leave, p)));
  busPose.arriving = p > 0.79 && p < BUS.out;
  return busPose;
}

// 하차 동선: 통로 → 가운데 문 → 보도 → 걷기 시작점
function setupAlight(w3Start) {
  const R = world.bus, b = paths.bus;
  const [x, z, yaw] = b.pose(b.length - R.DOOR.z);
  const at = { x, z, yaw };
  const pts = [R.toWorld(at, R.CAM.x, R.CAM.z), R.toWorld(at, -0.55, 0.05), R.toWorld(at, -1.3, R.DOOR.z), R.toWorld(at, -2.5, 0.6), w3Start];
  let door = 0;
  for (let i = 1; i <= 2; i++) door += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  paths.alight = sampler(pts.flat());
  paths.alightDoor = door / paths.alight.length;
  paths.rideYaw = yaw;
}

const STILLS = [0.02, 0.17, 0.3, 0.45, 0.56, 0.7, 0.845, 0.92, 1];
const cam = { x: 0, z: 0, yaw: 0, d1: 0, d3: 0 };
function cameraState(p) {
  const { w1, w2, w3 } = paths;
  const bis = world.city.pois.bis;
  let s, pitch = 0, bob = 0, eye = EYE, shake = 0;
  cam.d1 = 0; cam.d3 = 0;
  if (p < 0.33) {
    s = walk(w1, 0);
    s.yaw += Math.sin(p * 9) * 0.04;
    pitch = lerp(64, 1.5, smooth(0.05, 0.2, p)) * DEG;
  } else if (p < 0.5) {
    const d = smooth(0.33, 0.5, p) * w1.length;
    s = walk(w1, d); bob = d; cam.d1 = d;
  } else if (p < 0.62) {
    s = walk(w1, w1.length); cam.d1 = w1.length;
    const toBis = yawTo([s.x, s.z], [bis.x, bis.z]);
    s.yaw = angLerp(s.yaw, toBis, smooth(0.5, 0.535, p) * (1 - smooth(0.585, 0.62, p) * 0.6));
    pitch = 8 * DEG * smooth(0.5, 0.535, p) * (1 - smooth(0.585, 0.62, p));
  } else if (p < 0.757) {
    const d = smooth(0.62, 0.735, p) * w2.length;
    s = walk(w2, d); bob = d + 400;
  } else if (p < BUS.stop) {
    // 버스 안: 통로에 서서 앞을 봄. 엔진 떨림과 가감속에 따라 몸이 살짝 흔들림
    const B = busState(p), R = world.bus, m = R.motion;
    const [x, z] = R.toWorld(B, R.CAM.x, R.CAM.z);
    s = { x, z, yaw: B.yaw + 0.1 };
    eye = R.CAM.y; bob = 600;
    const sp = Math.min(1, m.speed / 12);
    pitch = -0.03 + clamp(-m.accel * 0.0025, -0.03, 0.03);
    if (!reduceMotion) {
      shake = Math.sin(time * 37) * 0.0022 * (0.35 + sp) + Math.sin(time * 0.9) * 0.012 * sp;
      s.yaw += Math.sin(time * 0.7) * 0.012 * sp;
    }
  } else if (p < BUS.out) {
    // 하차: 문 쪽으로 돌아서 내려와 걷는 방향으로
    const A = paths.alight, t = smooth(BUS.stop, BUS.out, p);
    const d = A.length * smooth(0.12, 1, t);
    const [x, z] = A.at(d);
    const travel = yawTo([x, z], A.at(Math.min(A.length, d + 1.2)));
    const yaw = angLerp(angLerp(paths.rideYaw + 0.1, travel, smooth(0, 0.3, t)), walk(w3, 0).yaw, smooth(0.7, 1, t));
    s = { x, z, yaw };
    eye = lerp(world.bus.CAM.y, EYE, smooth(paths.alightDoor - 0.03, paths.alightDoor + 0.1, d / A.length));
    bob = d + 700;
  } else if (p < 0.905) {
    const d = smooth(BUS.out, 0.905, p) * w3.length;
    s = walk(w3, d); bob = d + 900; cam.d3 = d;
  } else {
    s = walk(w3, w3.length); cam.d3 = w3.length;
    pitch = 4 * DEG * smooth(0.905, 0.98, p);
  }
  // 도착 무렵에는 길 끝을 바라봄 (아침 해가 낮게 떠 있으면 해 쪽으로)
  if (p > 0.86) {
    const lowMorningSun = !tod.evening && tod.sunElev > -6 && tod.sunElev < 14;
    s.yaw = angLerp(s.yaw, lowMorningSun ? tod.sunAz : 0, smooth(0.86, 0.93, p));
  }
  s.pitch = pitch;
  s.bob = bob;
  s.eye = eye + shake;
  return s;
}

let lastBob = 0, bobAmp = 0, handBob = 0;
function placeCamera(p, dt) {
  const s = cameraState(p);
  const moving = Math.abs(s.bob - lastBob) > 0.01;
  lastBob = s.bob;
  bobAmp = lerp(bobAmp, moving && !reduceMotion ? 1 : 0, Math.min(1, dt * 4));
  const y = s.eye + Math.sin(s.bob * 2.6) * 0.028 * bobAmp;
  handBob = Math.sin(s.bob * 2.6 + 0.6) * 5 * bobAmp;
  camera.position.set(s.x, y, s.z);
  cam.x = s.x; cam.z = s.z; cam.yaw = s.yaw;
  fwd.set(Math.cos(s.yaw) * Math.cos(s.pitch), Math.sin(s.pitch), Math.sin(s.yaw) * Math.cos(s.pitch));
  camera.lookAt(s.x + fwd.x, y + fwd.y, s.z + fwd.z);
}

/* ==========================================================================
   시간대 · 지도 상태
   ========================================================================== */
const sunDir = new Vector3();
let bisDelayed = null;
function updateWorld(p, cp, time, dt) {
  scene.fog.color.copy(tod.fog);
  scene.fog.density = tod.density;
  hemi.color.copy(tod.hemiSky);
  hemi.groundColor.copy(tod.hemiGround);
  hemi.intensity = tod.hemi;
  const el = tod.sunElev * DEG, az = tod.sunAz;
  sunDir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
  sunLight.color.copy(tod.sun);
  sunLight.intensity = tod.sunI;
  if (tod.night > 0.5) sunLight.position.set(camera.position.x - 0.3, camera.position.y + 1, camera.position.z + 0.4);
  else sunLight.position.copy(camera.position).add(sunDir);
  sunLight.target.position.copy(camera.position);

  const u = sky.uniforms;
  u.uZenith.value.copy(tod.zenith);
  u.uHorizon.value.copy(tod.horizon);
  u.uSunDir.value.copy(sunDir);
  u.uSunStrength.value = tod.sunElev > -3 ? tod.sunStrength : 0;
  u.uNight.value = tod.night;
  u.uHaze.value = tod.haze;
  u.uCityGlow.value.copy(tod.cityGlow);
  u.uTime.value = reduceMotion ? 0 : time;
  sky.mesh.position.copy(camera.position);
  fogUniforms.uSunView.value.copy(sunDir).transformDirection(camera.matrixWorldInverse);
  fogUniforms.uSunGlow.value.copy(tod.glow).multiplyScalar(tod.sunElev > -3 ? tod.sunStrength : 0);

  const rb = world.ribbons;
  rb.w1.setProgress(smooth(0.24, 0.31, p));
  rb.busA.setProgress(smooth(0.27, 0.33, p));
  rb.w2.setProgress(smooth(0.6, 0.645, p));
  rb.w3.setProgress(p > 0.785 ? smooth(0.79, 0.83, p) : 0);
  const delay = smooth(0.54, 0.575, p);
  rb.busA.mat.color.set("#e6b54a").lerp(new Color("#ff8a1e"), delay);
  rb.busA.mat.opacity = lerp(1, 0.28, delay) * (1 - smooth(0.7, 0.74, p));
  rb.w1.mat.opacity = 1 - smooth(0.7, 0.74, p);
  const delayed = p > 0.535;
  if (delayed !== bisDelayed) { bisDelayed = delayed; world.setBis(delayed); }
  world.update(reduceMotion ? 0 : time, reduceMotion ? 0 : dt, tod);
  world.bus.update(busState(cp), reduceMotion ? 0 : time, dt, tod);
}

/* ==========================================================================
   장(章) 연출 · 휴대폰
   ========================================================================== */
const chapters = $$(".ch").map((el) => ({ el, a: Number(el.dataset.a), b: Number(el.dataset.b) }));
const railFill = $("#rail-fill");
const hudTime = $("#hud-time");
const hudName = $("#hud-name");
const typeMsg = $("#type-msg");
const typeText = typeMsg ? typeMsg.dataset.text : "";
const veil = $("#veil");
const hand = $("#hand");
const navStep = $("#nav-step");
const navDist = $("#nav-dist");
const navRem = $("#nav-rem");
const nav3 = $("#nav3-dist");
const navIcon = $('[data-ps="nav"] .turn__ic use');
const tripClocks = $$('[data-clock="trip"]');
let introIn = reduceMotion ? 1 : 0;

const HUD = [
  [0.08, "출발 전"], [0.22, "조건 말하는 중"], [0.33, "경로 고르는 중"], [0.5, "정류장으로 걷는 중"],
  [0.6, "버스 지연 감지"], [0.735, "대안 경로로 이동"], [0.762, "지하철 2정거장 이동 중"], [0.818, "400번 버스 타고 가는 중"],
  [0.87, "도서관으로 걷는 중"], [0.935, "도착"], [1.1, ""]
];
const hud = $(".hud");
const PHONE = [
  [0.08, "lock"], [0.22, "voice"], [0.33, "understood"], [0.5, "nav"], [0.6, "alert"],
  [0.735, "compare"], [0.764, null], [0.82, "ride"], [0.87, "trust"], [0.935, "arrived"], [1.1, null]
];
const rideLeft = $("#ride-left");
const rideTxt = $("#ride-txt");
const metroStops = $$(".metro__st");
const NAV_STEPS = [["골목 끝에서 오른쪽", "ic-turn"], ["큰길 앞에서 오른쪽", "ic-turn"], ["횡단보도 건너기", "ic-cross"], ["횡단보도 건너기", "ic-cross"], ["정류장까지 직진", "ic-up"]];
let navInfo = null;
function setupNav() {
  const pts = world.city.route.w1;
  const cum = [0];
  for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
  navInfo = { cum, total: cum[cum.length - 1], steps: citySource === "procedural" ? NAV_STEPS : null };
}

function setupPhoneMap() {
  const R = world.city.route;
  const w2 = toPts(R.w2), w3 = toPts(R.w3);
  mapData = {
    w1: toPts(R.w1), busA: toPts(R.busA), w2, w3, dest: R.dest, origin: R.w1.slice(0, 2),
    sub: R.subAlt ? toPts(R.subAlt) : [w2[w2.length - 1], w3[0]],
    bus2: R.busAlt ? toPts(R.busAlt) : null
  };
  phoneMap = createPhoneMap($("#phone-map"), world.city);
}

function phoneView(s) {
  const M = mapData;
  const user = { x: cam.x, z: cam.z, yaw: cam.yaw };
  const follow = (scale, segments, extra = {}) => Object.assign({ mode: "follow", x: cam.x, z: cam.z, yaw: cam.yaw, scale, segments, user }, extra);
  switch (s) {
    case "voice": return follow(2.2, []);
    case "understood": return {
      mode: "overview", fit: [...M.w1, ...M.busA, M.dest], top: 0.2, bottom: 0.4, origin: M.origin, dest: M.dest,
      segments: [{ pts: M.w1, kind: "walk" }, { pts: M.busA, kind: "bus", label: "402" }]
    };
    case "nav": return follow(2.5, [{ pts: M.w1, kind: "walk", dim: true }, { pts: paths.w1.rest(cam.d1), kind: "walk" }, { pts: M.busA, kind: "bus", label: "402" }]);
    case "alert": return follow(1.3, [{ pts: M.w1, kind: "walk", dim: true }, { pts: M.busA, kind: "off", label: "402 · 9분 지연" }], { anchorY: 0.6 });
    case "compare": {
      const segs = [{ pts: M.busA, kind: "off", dim: true }, { pts: M.w2, kind: "walk" }, { pts: M.sub, kind: "sub", label: "지하철" }];
      if (M.bus2) segs.push({ pts: M.bus2, kind: "bus", label: "400" });
      segs.push({ pts: M.w3, kind: "walk" });
      return { mode: "overview", fit: [...M.w2, ...M.sub, ...(M.bus2 || []), ...M.w3, M.dest], top: 0.16, bottom: 0.34, dest: M.dest, user, segments: segs };
    }
    case "ride": return follow(1.7, [...(M.bus2 ? [{ pts: M.bus2, kind: "bus", label: "400" }] : []), { pts: M.w3, kind: "walk" }], { dest: M.dest });
    case "trust": return follow(2.5, [{ pts: M.w3, kind: "walk", dim: true }, { pts: paths.w3.rest(cam.d3), kind: "walk" }], { dest: M.dest });
    case "arrived": return follow(3, [{ pts: M.w3, kind: "walk", dim: true }], { dest: M.dest, anchorY: 0.4 });
    default: return null;
  }
}

function updatePhone(p) {
  const s = PHONE.find(([edge]) => p < edge)[1];
  if (s && hand.dataset.s !== s) hand.dataset.s = s;
  hand.style.setProperty("--hide", s ? "0" : "1");
  hand.style.setProperty("--bob", handBob.toFixed(2));
  if (!paths) return;
  if (s === "nav" && navInfo) {
    const d = cam.d1;
    let seg = navInfo.cum.findIndex((c) => c > d) - 1;
    if (seg < 0) seg = navInfo.cum.length - 2;
    const toTurn = Math.max(0, Math.round(navInfo.cum[seg + 1] - d));
    const [txt, icon] = navInfo.steps ? navInfo.steps[Math.min(seg, navInfo.steps.length - 1)] : ["경로를 따라 직진", "ic-up"];
    navStep.textContent = txt;
    navIcon.setAttribute("href", "#" + icon);
    navDist.textContent = String(toTurn);
    navRem.textContent = String(Math.max(0, Math.round(navInfo.total - d)));
  }
  if (s === "ride") {
    const f = smooth(BUS.go, BUS.stop, p);
    const [a, b] = p > BUS.stop - 0.004 ? ["이번 정류장에서 내려요", "가운데 문 쪽에 계단이 없어요"]
      : f > 0.55 ? ["다음 정류장에서 내려요", "400번 · 도서관 입구 하차"]
      : ["2정거장 뒤 내려요", "400번 · 내릴 때가 되면 알려 드려요"];
    if (rideLeft.textContent !== a) { rideLeft.textContent = a; rideTxt.textContent = b; }
  }
  if (s === "trust") nav3.textContent = String(Math.max(0, Math.round(paths.w3.length - cam.d3)));
  if (phoneMap && s && s !== "lock") {
    const v = phoneView(s);
    if (v) phoneMap.draw(v);
  }
}

function updateChapters(p) {
  for (const c of chapters) {
    const t = (p - c.a) / (c.b - c.a);
    let v;
    if (c.a === 0) v = 1 - smooth(0.6, 1, t);
    else if (c.b > 1) v = smooth(0, 0.35, t);
    else v = smooth(0, 0.14, t) * (1 - smooth(0.86, 1, t));
    const on = v > 0.002;
    c.el.classList.toggle("is-on", on);
    if (!on) continue;
    const tin = c.a === 0 ? introIn : reduceMotion ? 1 : ease(t / 0.32);
    const tout = reduceMotion ? 0 : ease((t - 0.78) / 0.22);
    const s = c.el.style;
    s.setProperty("--t", clamp(t).toFixed(4));
    s.setProperty("--v", v.toFixed(4));
    s.setProperty("--in", tin.toFixed(4));
    s.setProperty("--out", tout.toFixed(4));
  }
  if (typeMsg) {
    const c = chapters[1];
    const t = clamp((p - c.a) / (c.b - c.a));
    const count = Math.floor(clamp((t - 0.12) / 0.55) * typeText.length);
    if (typeMsg.textContent.length !== count) typeMsg.textContent = typeText.slice(0, count);
  }
  updatePhone(p);
  // 지하철 구간: 화면을 덮고 노선도 위로 열차가 2정거장 이동
  const vv = smooth(0.728, 0.742, p) * (1 - smooth(0.757, 0.767, p));
  veil.style.opacity = vv.toFixed(3);
  veil.classList.toggle("is-on", vv > 0.001);
  if (vv > 0.001) {
    const sp = smooth(0.741, 0.756, p);
    veil.style.setProperty("--sp", sp.toFixed(4));
    metroStops.forEach((el) => el.classList.toggle("is-past", sp >= Number(el.dataset.at) - 0.001));
  }
  root.dataset.tod = tod.night > 0.5 ? "night" : "day";
  railFill.style.transform = `scaleY(${p.toFixed(4)})`;
  const m = tripMin(p);
  hudTime.textContent = fmt(START_MIN + m);
  tripClocks.forEach((el) => { el.textContent = fmt(START_MIN + m, false); });
  hudName.textContent = HUD.find(([edge]) => p < edge)[1];
  hud.classList.toggle("is-off", p > 0.935);
}

/* ==========================================================================
   스페이스바: 다음 단계로 천천히 이동 (Shift+스페이스는 이전 단계)
   ========================================================================== */
// 버스에 탄 직후(0.769) · 정류장에 선 순간(0.805)에도 한 번씩 멈춤
const STOPS = [0, 0.16, 0.29, 0.44, 0.56, 0.68, 0.769, 0.805, 0.845, 0.91, 1];
let stepAnim = null;
const easeInOut = (t) => 0.5 - Math.cos(Math.PI * t) / 2;
function stepTo(dir) {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  if (max <= 0) return;
  const base = stepAnim ? stepAnim.to : window.scrollY / max;
  const next = dir > 0 ? STOPS.find((s) => s > base + 0.004) : [...STOPS].reverse().find((s) => s < base - 0.004);
  if (next === undefined) return;
  const from = window.scrollY / max;
  const dur = reduceMotion ? 0 : Math.min(5200, 2800 + Math.abs(next - from) * 14000);
  stepAnim = { from, to: next, t0: performance.now(), dur };
  const tick = (now) => {
    if (!stepAnim) return;
    const k = stepAnim.dur ? clamp((now - stepAnim.t0) / stepAnim.dur) : 1;
    const p = lerp(stepAnim.from, stepAnim.to, easeInOut(k));
    window.scrollTo({ top: p * (document.documentElement.scrollHeight - window.innerHeight), behavior: "instant" });
    if (k < 1) requestAnimationFrame(tick); else stepAnim = null;
  };
  requestAnimationFrame(tick);
}
document.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.key !== " ") return;
  if (e.target.closest && e.target.closest("a, button, input, textarea, select, [contenteditable]")) return;
  e.preventDefault();
  stepTo(e.shiftKey ? -1 : 1);
});
// 휠·터치로 직접 움직이면 자동 이동을 멈춤
["wheel", "touchstart"].forEach((ev) => window.addEventListener(ev, () => { stepAnim = null; }, { passive: true }));

/* ==========================================================================
   거리 위 라벨
   ========================================================================== */
let labels = [];
function setupLabels() {
  const r = world.city.route, P = world.city.pois;
  const defs = {
    stop: { at: [P.bis.x, 3.6, P.bis.z], show: [0.44, 0.6] },
    elevator: { at: [P.elevator.x, 3.8, P.elevator.z], show: [0.7, 0.745] },
    dest: { at: [r.dest[0], 6, r.dest[1]], show: [0.82, 0.93] }
  };
  labels = $$(".lbl").map((el) => ({ el, cfg: defs[el.dataset.lbl], v: new Vector3() })).filter((l) => l.cfg);
}
function updateLabels(p) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const L of labels) {
    const [a, b] = L.cfg.show;
    const vis = smooth(a, a + 0.015, p) * (1 - smooth(b - 0.015, b, p));
    L.v.set(...L.cfg.at).project(camera);
    const inFront = L.v.z < 1 && Math.abs(L.v.x) < 1.05 && Math.abs(L.v.y) < 1.05;
    const o = inFront ? vis : 0;
    L.el.style.opacity = o.toFixed(3);
    if (o > 0) L.el.style.transform = `translate3d(${((L.v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - L.v.y) / 2 * h).toFixed(1)}px, 0)`;
  }
}

/* ==========================================================================
   스크롤 · 루프
   ========================================================================== */
let target = 0, current = 0, time = 0, last = performance.now(), running = false;
function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  target = max > 0 ? clamp(window.scrollY / max) : 0;
}
function cameraP(p) {
  if (!reduceMotion) return p;
  const i = chapters.findIndex((ch) => p >= ch.a && p < ch.b);
  return i < 0 ? 0.785 : STILLS[i]; // 장 사이(지하철 · 버스 구간)는 버스 안 장면
}
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 74 : 62;
  camera.updateProjectionMatrix();
  if (phoneMap) phoneMap.resize();
}
function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  if (introIn < 1) introIn = Math.min(1, introIn + dt / 1.8);
  current = reduceMotion ? target : current + (target - current) * (1 - Math.pow(0.045, dt));
  if (Math.abs(target - current) < 0.00004) current = target;
  skyAt((START_MIN + tripMin(current)) / 60, tod);
  const cp = cameraP(current);
  if (renderer && world) {
    placeCamera(cp, dt);
    camera.updateMatrixWorld();
  }
  updateChapters(current);
  if (renderer && world) {
    updateWorld(current, cp, time, dt);
    updateLabels(current);
    renderer.render(scene, camera);
  }
}
function start() { if (running) return; running = true; last = performance.now(); requestAnimationFrame(frame); }
function stop() { running = false; }

/* ==========================================================================
   앱 받기 버튼 · 키보드 초점
   ========================================================================== */
function setupDownload() {
  const link = $("#apk-link"), note = $("#apk-note");
  if (!link) return;
  let available = true;
  fetch(link.getAttribute("href"), { method: "HEAD" })
    .then((res) => { available = res.ok; if (!res.ok) console.warn("[DUX] APK 파일을 찾을 수 없습니다:", link.href); })
    .catch(() => { available = true; });
  link.addEventListener("click", (e) => {
    if (available) return;
    e.preventDefault();
    note.textContent = "설치 파일을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.";
    note.classList.add("is-warn");
  });
}
/* ==========================================================================
   배경음악: 들어오자마자 켬. 브라우저가 소리 자동 재생을 막으면
   첫 클릭·터치·키 입력 때 바로 시작하고, 머리말 버튼으로 끄고 켬
   ========================================================================== */
function setupMusic() {
  const audio = $("#bgm"), btn = $("#snd");
  if (!audio || !btn) return;
  const VOL = 0.45;
  const GESTURES = ["pointerdown", "pointerup", "mousedown", "click", "keydown", "touchend", "wheel"];
  let wanted = true; // 기본은 켜짐. 방문자가 버튼으로 끄면 그때부터 꺼 둠
  let fade = 0, trying = false;
  // 켤 때만 1.6초 동안 서서히 키움 (끌 때는 바로 멈춤)
  const fadeIn = () => {
    clearInterval(fade);
    const t0 = performance.now();
    fade = setInterval(() => {
      const k = clamp((performance.now() - t0) / 1600);
      audio.volume = VOL * k;
      if (k >= 1) clearInterval(fade);
    }, 40);
  };
  const onGesture = (e) => {
    if (e.target.closest && e.target.closest("#snd")) return;
    if (wanted) play();
  };
  const unlisten = () => GESTURES.forEach((ev) => window.removeEventListener(ev, onGesture, { capture: true }));
  // 막히면 버튼이 깜박이며 기다리고, 다음 입력 때 다시 시도
  const play = () => {
    if (!audio.paused || trying) return;
    trying = true;
    audio.volume = 0;
    audio.play()
      .then(() => { unlisten(); fadeIn(); })
      .catch(() => btn.classList.add("is-waiting"))
      .finally(() => { trying = false; });
  };
  const pause = () => { clearInterval(fade); audio.pause(); };
  const render = () => {
    const on = !audio.paused;
    if (on) btn.classList.remove("is-waiting");
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
    btn.setAttribute("aria-label", on ? "배경음악 끄기" : "배경음악 켜기");
    $(".snd__txt", btn).textContent = on ? "음악 끄기" : "음악 켜기";
  };
  audio.addEventListener("play", render);
  audio.addEventListener("pause", render);
  btn.addEventListener("click", () => {
    wanted = audio.paused;
    if (wanted) play();
    else { btn.classList.remove("is-waiting"); pause(); }
  });
  GESTURES.forEach((ev) => window.addEventListener(ev, onGesture, { capture: true, passive: true }));
  // 다른 탭으로 가면 멈췄다가 돌아오면 다시
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else if (wanted) play();
  });
  play();
}

document.addEventListener("focusin", (e) => {
  const ch = e.target.closest && e.target.closest(".ch");
  if (!ch || ch.classList.contains("is-on")) return;
  if (ch.id === "s-download") document.getElementById("c-download").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
});

/* ==========================================================================
   시작
   ========================================================================== */
function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// 처음 들어오면 항상 첫 장면부터 (이전 스크롤 위치·주소의 #·뒤로 가기 복원 무시)
function toStart() {
  if (Number.isFinite(DEV_P)) return;
  stepAnim = null;
  window.scrollTo({ top: 0, behavior: "instant" });
  readScroll();
  current = target;
  introIn = reduceMotion ? 1 : 0;
}

async function init() {
  history.scrollRestoration = "manual";
  if (location.hash && !Number.isFinite(DEV_P)) history.replaceState(null, "", location.pathname + location.search);
  toStart();
  window.addEventListener("load", toStart, { once: true });
  // 뒤로 가기 등으로 페이지가 그대로 복원돼도 첫 장면으로
  window.addEventListener("pageshow", (e) => { if (e.persisted) toStart(); });
  fillTimes();
  setupDownload();
  setupMusic();
  readScroll();
  current = target;
  resize();
  window.addEventListener("scroll", readScroll, { passive: true });
  window.addEventListener("resize", () => { resize(); readScroll(); });
  document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
  start();
  if (!renderer) return;
  try { await document.fonts.load(`800 40px ${FONT}`); } catch (e) { /* 기본 글꼴 사용 */ }
  const [city, icon] = await Promise.all([loadCity(), loadImage("assets/icons/dux-icon-256.png")]);
  const built = await buildCity(city, scene, { fontFamily: FONT, mobile: isMobile, patchFog, icon });
  world = Object.assign(built, { city });
  paths = { w1: sampler(city.route.w1), w2: sampler(city.route.w2), w3: sampler(city.route.w3) };
  // 400번 버스: busAlt 의 마지막 점은 내려서 걷기 시작하는 곳
  const R = city.route, w3Start = R.w3.slice(0, 2);
  const busFlat = R.busAlt && R.busAlt.length >= 6 ? R.busAlt.slice(0, -2) : [w3Start[0] - 128, w3Start[1] - 5.6, w3Start[0] - 4, w3Start[1] - 5.6];
  paths.bus = busPath(busFlat);
  world.bus = createBusRide(scene, { fontFamily: FONT, patchFog });
  setupAlight(w3Start);
  setupLabels();
  setupNav();
  setupPhoneMap();
  if (citySource === "osm") root.classList.add("src-osm");
  root.classList.add("is-ready");
  const qp = DEV_P;
  if (Number.isFinite(qp)) {
    const jump = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({ top: clamp(qp) * max, behavior: "instant" });
      readScroll();
      current = target;
      introIn = 1;
    };
    jump();
    setTimeout(jump, 300);
    setTimeout(jump, 1200);
  }
}
init();
