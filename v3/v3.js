/**
 * DUX v3 — 스크롤로 비행하는 안개 도시
 *
 * 화면 전체는 하나의 3D 도시 지도입니다. 스크롤 진행률 p(0~1)에 따라
 *  - 카메라가 출발지 → 정류장 → (지연) → 대안 경로 → 도착지로 날아가고
 *  - 지도 위 경로가 그려지고, 흐려지고, 다시 그려지며
 *  - 장(.ch)마다 사선 패널·원형 렌즈·글자 초점 같은 연출이 진행됩니다.
 * 모든 내용은 스크롤만으로 전달되고, 마지막 장에서 APK QR과 다운로드 버튼이 나옵니다.
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, FogExp2, HemisphereLight, DirectionalLight,
  PlaneGeometry, BoxGeometry, CylinderGeometry, RingGeometry, TubeGeometry,
  MeshLambertMaterial, MeshBasicMaterial, SpriteMaterial, Sprite, Mesh, InstancedMesh, Object3D,
  Vector3, CatmullRomCurve3, CanvasTexture, SRGBColorSpace, RepeatWrapping, AdditiveBlending, DoubleSide
} from "./vendor/three.min.js";

const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isMobile = window.matchMedia("(max-width: 760px)").matches || (navigator.hardwareConcurrency || 8) <= 4;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);

/* ==========================================================================
   지도 데이터 (도로 격자 100m, 좌표 단위 m)
   ========================================================================== */
const HALF = 2400;
const PITCH = 100;
const ORIGIN = [-1500, 1300];
const STOP = [-1100, 900];
const TRANSFER = [100, 300];
const DEST = [1400, -1200];
const ROUTE_HEAD = [ORIGIN, [-1500, 900], STOP];                                           // 도보
const ROUTE_TAIL = [STOP, [-700, 900], [-700, 300], TRANSFER, [100, -500], [900, -500], [900, -1200], DEST]; // 402번 → 지하철
const ROUTE_ALT = [STOP, [-1100, 600], [-300, 600], [-300, -200], [600, -200], [600, -900], [1400, -900], DEST]; // 대안
const CBD = [900, -1900];
const riverZ = (x) => 160 + 320 * Math.sin(x / 700 + 0.6);

const COL = {
  haze: new Color("#d9cba9"),
  ground: "#c8b893",
  road: "#e4d7b8",
  avenue: "#ecdfc2",
  park: "#b7b07f",
  river: "#a39474",
  bld: new Color("#2c261b"),
  gold: new Color("#e2a93a"),
  goldHi: new Color("#fff0c4")
};

/* 경로 → 부드러운 3D 곡선 (모서리 둥글게) */
function routeCurve(pts, y = 4) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    if (i === 0 || i === pts.length - 1) { out.push(new Vector3(x, y, z)); continue; }
    const [px, pz] = pts[i - 1];
    const [nx, nz] = pts[i + 1];
    const r = 38;
    const d1 = Math.hypot(x - px, z - pz), d2 = Math.hypot(nx - x, nz - z);
    out.push(new Vector3(x - ((x - px) / d1) * r, y, z - ((z - pz) / d1) * r));
    out.push(new Vector3(x + ((nx - x) / d2) * r, y, z + ((nz - z) / d2) * r));
  }
  // 직선 구간 촘촘히
  const dense = [];
  for (let i = 0; i < out.length - 1; i++) {
    const a = out[i], b = out[i + 1];
    const n = Math.max(1, Math.round(a.distanceTo(b) / 70));
    for (let k = 0; k < n; k++) dense.push(a.clone().lerp(b, k / n));
  }
  dense.push(out[out.length - 1]);
  return new CatmullRomCurve3(dense, false, "centripetal");
}

function distToPolyline(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

/* ==========================================================================
   3D 장면
   ========================================================================== */
const canvas = $("#scene");
let renderer;
try {
  renderer = new WebGLRenderer({ canvas, antialias: !isMobile, powerPreference: "high-performance" });
} catch (e) {
  root.classList.add("no-webgl");
}

const scene = new Scene();
scene.background = COL.haze.clone();
scene.fog = new FogExp2(COL.haze.clone(), 0.0004);
const camera = new PerspectiveCamera(50, 1, 5, 14000);

const SUN_POS = new Vector3(-780, 520, -5600);

function makeTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function radialTex(stops) {
  return makeTexture(256, 256, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    stops.forEach(([o, c]) => grd.addColorStop(o, c));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, w);
  });
}

let routeMats = {};
let routeMeshes = {};
let dotSprite, busRing, beams = [];
let curves = {};

function buildScene() {
  // 빛: 낮게 뜬 해에서 오는 따뜻한 빛
  scene.add(new HemisphereLight("#f4e6c4", "#3b3222", 0.95));
  const sun = new DirectionalLight("#ffd88a", 1.5);
  sun.position.copy(SUN_POS).normalize();
  scene.add(sun);

  // 해 + 번짐 (안개에 영향받지 않음)
  const sunCore = new Sprite(new SpriteMaterial({
    map: radialTex([[0, "rgba(255,250,232,1)"], [0.28, "rgba(255,236,190,0.95)"], [0.55, "rgba(246,206,130,0.35)"], [1, "rgba(240,190,110,0)"]]),
    fog: false, depthWrite: false, transparent: true
  }));
  sunCore.position.copy(SUN_POS);
  sunCore.scale.set(900, 900, 1);
  const sunHalo = new Sprite(new SpriteMaterial({
    map: radialTex([[0, "rgba(255,230,170,0.55)"], [0.4, "rgba(240,205,140,0.18)"], [1, "rgba(230,200,140,0)"]]),
    fog: false, depthWrite: false, transparent: true
  }));
  sunHalo.position.copy(SUN_POS);
  sunHalo.scale.set(5200, 5200, 1);
  scene.add(sunHalo, sunCore);

  // 지면: 도로·강·공원이 그려진 지도 텍스처
  const texSize = isMobile ? 1024 : 2048;
  const k = texSize / (HALF * 2);
  const parkSet = new Set();
  const mapTex = makeTexture(texSize, texSize, (g, s) => {
    g.fillStyle = COL.ground;
    g.fillRect(0, 0, s, s);
    const toPx = (x, z) => [(x + HALF) * k, (z + HALF) * k];
    // 공원
    g.fillStyle = COL.park;
    for (let i = -24; i < 24; i++) {
      for (let j = -24; j < 24; j++) {
        const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
        if (h - Math.floor(h) < 0.05) {
          parkSet.add(i + "," + j);
          const [px, pz] = toPx(i * PITCH + 11, j * PITCH + 11);
          g.fillRect(px, pz, 78 * k, 78 * k);
        }
      }
    }
    // 강
    g.strokeStyle = COL.river;
    g.lineWidth = 150 * k;
    g.lineCap = "round";
    g.beginPath();
    for (let x = -HALF; x <= HALF; x += 40) {
      const [px, pz] = toPx(x, riverZ(x));
      x === -HALF ? g.moveTo(px, pz) : g.lineTo(px, pz);
    }
    g.stroke();
    // 도로
    for (let i = -24; i <= 24; i++) {
      const avenue = i % 5 === 0;
      g.strokeStyle = avenue ? COL.avenue : COL.road;
      g.lineWidth = (avenue ? 34 : 20) * k;
      const p = (i * PITCH + HALF) * k;
      g.beginPath(); g.moveTo(p, 0); g.lineTo(p, s); g.stroke();
      g.beginPath(); g.moveTo(0, p); g.lineTo(s, p); g.stroke();
    }
  });
  mapTex.anisotropy = 4;
  const ground = new Mesh(new PlaneGeometry(HALF * 2, HALF * 2), new MeshLambertMaterial({ map: mapTex }));
  ground.rotation.x = -Math.PI / 2;
  const horizon = new Mesh(new PlaneGeometry(40000, 40000), new MeshLambertMaterial({ color: COL.ground }));
  horizon.rotation.x = -Math.PI / 2;
  horizon.position.y = -0.6;
  scene.add(horizon, ground);

  // 건물: 블록마다 1~4동, 도심(CBD)일수록 높게, 경로 근처는 낮게
  let seed = 1789;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const boxes = [];
  for (let i = -24; i < 24; i++) {
    for (let j = -24; j < 24; j++) {
      if (parkSet.has(i + "," + j)) continue;
      const x0 = i * PITCH + 12, z0 = j * PITCH + 12, size = PITCH - 24;
      const cx = x0 + size / 2, cz = z0 + size / 2;
      if (Math.abs(cz - riverZ(cx)) < 120) continue;
      const dRoute = Math.min(distToPolyline(cx, cz, ROUTE_TAIL), distToPolyline(cx, cz, ROUTE_ALT), distToPolyline(cx, cz, ROUTE_HEAD));
      const dCbd = Math.hypot(cx - CBD[0], cz - CBD[1]);
      const cap = 70 + dRoute * 0.55;
      const peak = 40 + 380 * Math.exp(-Math.pow(dCbd / 900, 2));
      const split = isMobile ? (rand() < 0.6 ? 1 : 2) : (rand() < 0.35 ? 1 : rand() < 0.6 ? 2 : 4);
      const cells = split === 1 ? [[0, 0, 1, 1]] : split === 2 ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
      for (const [u, v, w, d] of cells) {
        const inset = 3 + rand() * 6;
        const bw = size * w - inset * 2, bd = size * d - inset * 2;
        let h = 14 + Math.pow(rand(), 2.1) * peak;
        if (dCbd < 700 && rand() < 0.18) h *= 1.7;
        h = Math.min(h, cap);
        boxes.push([x0 + size * u + inset + bw / 2, z0 + size * v + inset + bd / 2, bw, bd, h, 0.75 + rand() * 0.5]);
      }
    }
  }
  const geo = new BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const city = new InstancedMesh(geo, new MeshLambertMaterial({ color: "#ffffff" }), boxes.length);
  const dummy = new Object3D();
  const tint = new Color();
  boxes.forEach(([x, z, w, d, h, shade], n) => {
    dummy.position.set(x, 0, z);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    city.setMatrixAt(n, dummy.matrix);
    city.setColorAt(n, tint.copy(COL.bld).multiplyScalar(shade));
  });
  scene.add(city);

  // 경로: 흐르는 빛 텍스처를 입힌 관
  const flowTex = makeTexture(256, 8, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, "#c98f22");
    grd.addColorStop(0.55, "#e2a93a");
    grd.addColorStop(0.8, "#fff3cf");
    grd.addColorStop(1, "#c98f22");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  flowTex.wrapS = RepeatWrapping;

  curves = { head: routeCurve(ROUTE_HEAD), tail: routeCurve(ROUTE_TAIL), alt: routeCurve(ROUTE_ALT) };
  const makeRoute = (name, curve, color) => {
    const len = curve.getLength();
    const segs = Math.ceil(len / 10);
    const tex = flowTex.clone();
    tex.repeat.set(len / 160, 1);
    tex.needsUpdate = true;
    const mat = new MeshBasicMaterial({ color, map: tex, fog: false, transparent: true });
    const core = new Mesh(new TubeGeometry(curve, segs, 3.4, 6, false), mat);
    const glowMat = new MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, fog: false });
    const glow = new Mesh(new TubeGeometry(curve, segs, 11, 8, false), glowMat);
    core.geometry.setDrawRange(0, 0);
    glow.geometry.setDrawRange(0, 0);
    scene.add(glow, core);
    routeMats[name] = { mat, glowMat, tex };
    routeMeshes[name] = { core, glow, segs };
  };
  makeRoute("head", curves.head, COL.gold);
  makeRoute("tail", curves.tail, COL.gold);
  makeRoute("alt", curves.alt, COL.goldHi);

  // 출발지·도착지 빛기둥
  const beamTex = makeTexture(4, 128, (g, w, h) => {
    const grd = g.createLinearGradient(0, h, 0, 0);
    grd.addColorStop(0, "rgba(255,230,170,0.9)");
    grd.addColorStop(1, "rgba(255,230,170,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  [ORIGIN, DEST].forEach(([x, z], i) => {
    const beam = new Mesh(new CylinderGeometry(2.2, 2.2, 700, 12, 1, true), new MeshBasicMaterial({
      map: beamTex, color: "#f2c46a", transparent: true, blending: AdditiveBlending, depthWrite: false, fog: false, side: DoubleSide, opacity: 0.7
    }));
    beam.position.set(x, 350, z);
    const ring = new Mesh(new RingGeometry(20, 26, 48), new MeshBasicMaterial({ color: i ? COL.goldHi : COL.gold, fog: false, side: DoubleSide, transparent: true }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 3, z);
    scene.add(beam, ring);
    beams.push(beam);
  });

  // 지연 표시 링 (402번 정류장 앞)
  const busP = curves.tail.getPointAt(0.04);
  busRing = new Mesh(new RingGeometry(16, 22, 48), new MeshBasicMaterial({ color: "#1d1912", transparent: true, opacity: 0, side: DoubleSide, fog: false }));
  busRing.rotation.x = -Math.PI / 2;
  busRing.position.set(busP.x, 5, busP.z);
  scene.add(busRing);

  // 현재 위치
  dotSprite = new Sprite(new SpriteMaterial({
    map: radialTex([[0, "rgba(255,255,255,1)"], [0.2, "rgba(255,243,207,1)"], [0.45, "rgba(226,169,58,0.55)"], [1, "rgba(226,169,58,0)"]]),
    fog: false, depthWrite: false, transparent: true
  }));
  dotSprite.scale.set(70, 70, 1);
  scene.add(dotSprite);
}

/* ==========================================================================
   카메라 경로: 키프레임 + 경로 추적 구간
   ========================================================================== */
const V = (x, y, z) => new Vector3(x, y, z);
let camKeys = [];
let camPosCurve, camLookCurve;

function followKeys(curve, p0, p1, n, back, up, side) {
  const keys = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const P = curve.getPointAt(f);
    const T = curve.getTangentAt(f);
    const S = V(T.z, 0, -T.x).normalize();
    const pos = P.clone().addScaledVector(T, -back).add(V(0, up, 0)).addScaledVector(S, side);
    const look = curve.getPointAt(Math.min(1, f + 0.08)).add(V(0, 10, 0));
    keys.push({ p: lerp(p0, p1, f), pos, look, fog: 0.00125 });
  }
  return keys;
}

function buildCameraPath() {
  camKeys = [
    { p: 0.0, pos: V(-300, 1650, 2900), look: V(-100, 0, -800), fog: 0.00028 },
    { p: 0.07, pos: V(-900, 1150, 2500), look: V(-1150, 0, 900), fog: 0.00034 },
    { p: 0.15, pos: V(-1850, 300, 1850), look: V(-1500, 0, 1300), fog: 0.00062 },
    { p: 0.23, pos: V(-1960, 230, 1560), look: V(-1450, 20, 1250), fog: 0.00068 },
    { p: 0.31, pos: V(-2150, 950, 2350), look: V(-250, 0, -50), fog: 0.00042 },
    { p: 0.37, pos: V(-1720, 380, 1680), look: V(-1500, 0, 1250), fog: 0.0006 },
    ...followKeys(curves.head, 0.4, 0.51, 4, 320, 270, 90),
    { p: 0.565, pos: V(-1420, 330, 1200), look: V(-950, 0, 870), fog: 0.00085 },
    { p: 0.61, pos: V(-1560, 520, 1300), look: V(-800, 0, 700), fog: 0.0007 },
    ...followKeys(curves.alt, 0.66, 0.8, 8, 380, 320, -110),
    { p: 0.86, pos: V(700, 1000, -100), look: V(1300, 0, -1150), fog: 0.00045 },
    { p: 0.915, pos: V(1650, 330, -850), look: V(1400, 0, -1220), fog: 0.0006 },
    { p: 0.965, pos: V(1800, 900, -600), look: V(300, 280, -3800), fog: 0.00036 },
    { p: 1.0, pos: V(1900, 1250, -400), look: V(-300, 260, -4200), fog: 0.0003 }
  ];
  camPosCurve = new CatmullRomCurve3(camKeys.map((k) => k.pos), false, "centripetal");
  camLookCurve = new CatmullRomCurve3(camKeys.map((k) => k.look), false, "centripetal");
}

const tmpPos = new Vector3(), tmpLook = new Vector3();
function placeCamera(p) {
  const n = camKeys.length;
  let i = 0;
  while (i < n - 2 && p > camKeys[i + 1].p) i++;
  const a = camKeys[i], b = camKeys[i + 1];
  const local = clamp((p - a.p) / (b.p - a.p));
  const u = (i + local) / (n - 1);
  camPosCurve.getPoint(u, tmpPos);
  camLookCurve.getPoint(u, tmpLook);
  camera.position.copy(tmpPos);
  camera.lookAt(tmpLook);
  scene.fog.density = lerp(a.fog, b.fog, local);
}

/* ==========================================================================
   지도 상태 (경로 그리기 · 지연 · 대안 · 현재 위치)
   ========================================================================== */
function setDraw(name, f) {
  const m = routeMeshes[name];
  if (!m) return;
  const segs = Math.floor(clamp(f) * m.segs);
  m.core.geometry.setDrawRange(0, segs * 6 * 6);
  m.glow.geometry.setDrawRange(0, segs * 8 * 6);
}

function updateMap(p, time) {
  setDraw("head", smooth(0.26, 0.3, p));
  setDraw("tail", smooth(0.295, 0.355, p));
  setDraw("alt", smooth(0.645, 0.71, p));

  const dim = smooth(0.555, 0.59, p);
  routeMats.tail.mat.opacity = lerp(1, 0.16, dim);
  routeMats.tail.glowMat.opacity = lerp(0.22, 0.02, dim);

  const ringOn = smooth(0.535, 0.555, p) * (1 - smooth(0.64, 0.67, p));
  const k = (time * 0.7) % 1;
  busRing.material.opacity = ringOn * (1 - k) * 0.9;
  busRing.scale.setScalar(1 + k * 3.2);

  let dp;
  if (p < 0.4) dp = curves.head.getPointAt(0);
  else if (p < 0.66) dp = curves.head.getPointAt(smooth(0.4, 0.51, p));
  else dp = curves.alt.getPointAt(smooth(0.67, 0.8, p));
  dotSprite.position.set(dp.x, 14, dp.z);
  dotSprite.material.opacity = smooth(0.12, 0.18, p);

  const flow = reduceMotion ? 0 : time * 0.12;
  routeMats.head.tex.offset.x = -flow;
  routeMats.tail.tex.offset.x = -flow;
  routeMats.alt.tex.offset.x = -flow * 1.4;
  beams.forEach((b, i) => { b.material.opacity = i ? 0.45 + 0.45 * smooth(0.86, 0.92, p) : 0.6; });
}

/* 지도 위 라벨 (3D 좌표 → 화면 좌표) */
const LABELS = {
  origin: { at: [ORIGIN[0], 40, ORIGIN[1]], show: [0.12, 0.52] },
  stop: { at: [STOP[0], 30, STOP[1]], show: [0.4, 0.66] },
  transfer: { at: [TRANSFER[0], 30, TRANSFER[1]], show: [0.37, 0.52] },
  alt: { at: [-300, 30, 600], show: [0.66, 0.78] },
  dest: { at: [DEST[0], 60, DEST[1]], show: [0.37, 0.79] }
};
const labelEls = $$(".lbl").map((el) => ({ el, cfg: LABELS[el.dataset.lbl], v: new Vector3() }));
function updateLabels(p) {
  const w = window.innerWidth, h = window.innerHeight;
  for (const L of labelEls) {
    const [a, b] = L.cfg.show;
    const vis = smooth(a, a + 0.02, p) * (1 - smooth(b - 0.02, b, p));
    L.v.set(...L.cfg.at).project(camera);
    const inFront = L.v.z < 1 && Math.abs(L.v.x) < 1.1 && Math.abs(L.v.y) < 1.1;
    const o = inFront ? vis : 0;
    L.el.style.opacity = o.toFixed(3);
    if (o > 0) L.el.style.transform = `translate3d(${((L.v.x + 1) / 2 * w).toFixed(1)}px, ${((1 - L.v.y) / 2 * h).toFixed(1)}px, 0)`;
  }
}

/* ==========================================================================
   장(章) 연출: 스크롤 진행률 → CSS 변수
   ========================================================================== */
function splitFocus(el) {
  const label = el.textContent.replace(/\s+/g, " ").trim();
  const chars = [];
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        for (const ch of n.textContent) {
          if (ch === " " || ch === "\n") { frag.appendChild(document.createTextNode(ch)); continue; }
          const s = document.createElement("span");
          s.className = "fch";
          s.textContent = ch;
          chars.push(s);
          frag.appendChild(s);
        }
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== "BR") walk(n);
    });
  };
  walk(el);
  el.setAttribute("aria-label", label);
  return chars;
}

const chapters = $$(".ch").map((el) => ({
  el,
  a: Number(el.dataset.a),
  b: Number(el.dataset.b),
  focus: $$(".focus", el).map((f) => splitFocus(f))
}));
const railFill = $("#rail-fill");
const hudTime = $("#hud-time");
const hudName = $("#hud-name");
const typeMsg = $("#type-msg");
const typeText = typeMsg ? typeMsg.dataset.text : "";
const etaB = $("#eta-b");
let introIn = reduceMotion ? 1 : 0;

const HUD = [
  [0.09, "출발 전"], [0.25, "말하기"], [0.37, "맞추기"], [0.53, "도보 이동"],
  [0.63, "상황 변화"], [0.79, "다시 안내"], [0.89, "신뢰"], [0.945, "도착"], [1.1, "다운로드"]
];
function clock(p) {
  // 14:20 출발 → 정류장 14:24 → 대안 이동 → 14:55 도착
  let m = 0;
  if (p > 0.4) m = 4 * smooth(0.4, 0.51, p);
  if (p > 0.67) m = 4 + 31 * smooth(0.67, 0.89, p);
  const t = 20 + Math.round(m);
  return `14:${String(t).padStart(2, "0")}`;
}

function updateChapters(p) {
  for (const c of chapters) {
    const t = (p - c.a) / (c.b - c.a);
    let v;
    if (c.a === 0) v = 1 - smooth(0.55, 1, t);
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

    // 글자 초점 맞추기
    for (const chars of c.focus) {
      const n = chars.length;
      const q = tin * (n + 6);
      chars.forEach((ch, i) => {
        const f = reduceMotion ? 1 : clamp((q - i) / 6);
        ch.style.opacity = (0.12 + 0.88 * f).toFixed(3);
        ch.style.filter = f > 0.99 ? "" : `blur(${((1 - f) * 14).toFixed(1)}px)`;
        ch.style.transform = f > 0.99 ? "" : `translateY(${((1 - f) * 0.12).toFixed(3)}em)`;
      });
    }
  }

  // 말하기: 문장이 한 글자씩 입력됨
  if (typeMsg) {
    const c = chapters[1];
    const t = clamp((p - c.a) / (c.b - c.a));
    const count = Math.floor(clamp((t - 0.18) / 0.5) * typeText.length);
    if (typeMsg.textContent.length !== count) typeMsg.textContent = typeText.slice(0, count);
  }
  // 다시 안내: 31 → 35
  if (etaB) {
    const c = chapters[5];
    const t = clamp((p - c.a) / (c.b - c.a));
    etaB.textContent = String(31 + Math.round(4 * smooth(0.25, 0.55, t)));
  }

  railFill.style.transform = `scaleY(${p.toFixed(4)})`;
  hudTime.textContent = clock(p);
  hudName.textContent = HUD.find(([edge]) => p < edge)[1];
}

/* ==========================================================================
   스크롤 · 렌더 루프
   ========================================================================== */
let target = 0;
let current = 0;
let time = 0;
let last = performance.now();
let running = false;

function readScroll() {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  target = max > 0 ? clamp(window.scrollY / max) : 0;
}

// 모션 감소: 카메라는 장마다 고정된 시점으로만 이동
const STILLS = [0, 0.17, 0.33, 0.45, 0.585, 0.74, 0.85, 0.915, 1];
function cameraP(p) {
  if (!reduceMotion) return p;
  const c = chapters.find((ch) => p >= ch.a && p < ch.b) || chapters[chapters.length - 1];
  return STILLS[chapters.indexOf(c)];
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.6));
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  camera.fov = w / h < 0.8 ? 66 : 50;
  camera.updateProjectionMatrix();
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  if (!introIn || introIn < 1) introIn = Math.min(1, introIn + dt / 1.8);

  current = reduceMotion ? target : current + (target - current) * (1 - Math.pow(0.0009, dt));
  if (Math.abs(target - current) < 0.00005) current = target;

  updateChapters(current);
  if (renderer) {
    placeCamera(cameraP(current));
    updateMap(current, time);
    updateLabels(current);
    renderer.render(scene, camera);
  }
}

function start() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(frame);
}
function stop() { running = false; }

/* ==========================================================================
   다운로드 버튼: 파일이 아직 없으면 안내만 표시
   ========================================================================== */
function setupDownload() {
  const link = $("#apk-link");
  const note = $("#apk-note");
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

/* 키보드로 다른 장의 요소에 초점이 가면 그 장으로 스크롤 */
function setupFocusScroll() {
  const anchors = { "s-download": "c-download" };
  document.addEventListener("focusin", (e) => {
    const ch = e.target.closest && e.target.closest(".ch");
    if (!ch || ch.classList.contains("is-on")) return;
    const id = anchors[ch.id];
    if (id) document.getElementById(id).scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  });
}

/* ==========================================================================
   시작
   ========================================================================== */
if (renderer) {
  buildScene();
  buildCameraPath();
}
setupDownload();
setupFocusScroll();
readScroll();
current = target;
resize();
window.addEventListener("scroll", readScroll, { passive: true });
window.addEventListener("resize", () => { resize(); readScroll(); });
document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
start();
