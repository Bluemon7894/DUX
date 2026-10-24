/**
 * DUX — 400번 버스 안 (통로에 서서 가는 승객 시점)
 * 실내(좌석·기둥·손잡이·창틀·문·하차벨·단말기·정류장 안내 화면)와 바깥 차체(cars.js 버스)를 한 몸으로 움직입니다.
 * 로컬 좌표는 cars.js 와 같음: x = 폭(+ 가 진행 방향 왼쪽), y = 위, z = 길이(앞 = +z). 문은 오른쪽(-x)에 있음.
 */
import {
  BufferGeometry, Float32BufferAttribute, Group, Mesh, InstancedMesh, Object3D, Color,
  CylinderGeometry, SphereGeometry, PlaneGeometry, MeshBasicMaterial, DoubleSide
} from "../../vendor/three.min.js";
import { createFleet } from "./cars.js";
import { busScreenCanvas } from "./textures.js";

const W = 1.2;                    // 실내 반폭 (바깥 차체 1.25)
const F = 0.42;                   // 바닥
const TOP = 2.86;                 // 천장
const WIN0 = 1.3, WIN1 = 2.55;    // 옆 창 아래 · 위
const L0 = -5.45, L1 = 5.45;      // 실내 뒤 · 앞 끝
const MID = [-0.4, 0.9];          // 가운데 문
const FRONT = [4.15, 5.25];       // 앞문
const RAISE = -2.45;              // 이보다 뒤는 바닥이 한 단 높음
const RAIL_Y = 2.52;              // 천장 손잡이 봉

export const CAM = { x: -0.12, y: 2.04, z: -0.95 };   // 서 있는 승객 눈 위치
export const DOOR = { x: -1.25, z: (MID[0] + MID[1]) / 2 };

const C = (hex) => new Color(hex);
const FLOOR = C("#55575a"), YELLOW = C("#e3b81f"), WALL = C("#cfcac0"), PANEL = C("#dcd8cf"), CEIL = C("#eceae4");
const FRAME = C("#26282b"), DASH = C("#1d1f22"), SEAT = C("#2e3a5c"), SHELL = C("#555d6a"), METAL = C("#6d7178");
const GOLD = C("#d9a83a"), ARCH = C("#8e8a83"), STRAP = C("#2b2c2e"), HANDLE = C("#ead08a"), DARK = C("#141518");
const LIGHT = C("#fff6e4"), GREEN = C("#3ad07a"), WHITE_GLASS = new Color(1, 1, 1);

// 면 밝기를 법선으로 미리 구워 둠: 천장 조명과 창빛을 받는 실내 (위는 밝고 아래는 어둡게)
const shade = (n) => Math.min(1, Math.max(0.3, 0.66 + 0.24 * n[1] + 0.1 * Math.max(0, -n[2]) - 0.04 * Math.abs(n[0])));

class Geo {
  // flat: 조명·화면처럼 스스로 빛나는 부품은 밝기를 굽지 않음
  constructor(flat = false) { this.p = []; this.n = []; this.c = []; this.flat = flat; }
  tri(a, b, c, n, col, k) {
    if (this.flat) k = 1;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    if ((uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0) [b, c] = [c, b];
    [a, b, c].forEach((q) => { this.p.push(...q); this.n.push(...n); this.c.push(col.r * k, col.g * k, col.b * k); });
  }
  quad(a, b, c, d, n, col, k = shade(n)) { this.tri(a, b, c, n, col, k); this.tri(a, c, d, n, col, k); }
  // tilt: x축 기준 기울기(라디안). 음수면 윗부분이 뒤(-z)로 젖혀짐
  box(cx, cy, cz, sx, sy, sz, col, tilt = 0) {
    const ct = Math.cos(tilt), st = Math.sin(tilt);
    const rot = ([x, y, z]) => [x, y * ct - z * st, y * st + z * ct];
    const h = [sx / 2, sy / 2, sz / 2];
    for (let ax = 0; ax < 3; ax++) for (const s of [-1, 1]) {
      const [u, w] = [0, 1, 2].filter((i) => i !== ax);
      const pt = (a, b) => {
        const q = [0, 0, 0]; q[ax] = s * h[ax]; q[u] = a * h[u]; q[w] = b * h[w];
        const r = rot(q);
        return [cx + r[0], cy + r[1], cz + r[2]];
      };
      const nrm = [0, 0, 0]; nrm[ax] = s;
      this.quad(pt(-1, -1), pt(1, -1), pt(1, 1), pt(-1, 1), rot(nrm), col);
    }
  }
  // 원통(기둥·봉): 법선별 밝기 + 카메라 쪽(-z)으로 금속 반사
  mesh(g, col) {
    const gi = g.toNonIndexed();
    const p = gi.attributes.position.array, n = gi.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) {
      const nn = [n[i], n[i + 1], n[i + 2]];
      const k = Math.min(1.25, shade(nn) + 0.45 * Math.pow(Math.max(0, -nn[2] * 0.8 + nn[0] * 0.3), 5));
      this.p.push(p[i], p[i + 1], p[i + 2]); this.n.push(...nn); this.c.push(col.r * k, col.g * k, col.b * k);
    }
  }
  pole(x, z, y0 = F, y1 = TOP, r = 0.019, col = GOLD) { const g = new CylinderGeometry(r, r, y1 - y0, 10, 1, true); g.translate(x, (y0 + y1) / 2, z); this.mesh(g, col); }
  rodZ(x, y, z0, z1, r = 0.018, col = GOLD) { const g = new CylinderGeometry(r, r, z1 - z0, 10, 1, true); g.rotateX(Math.PI / 2); g.translate(x, y, (z0 + z1) / 2); this.mesh(g, col); }
  ball(x, y, z, r, col) { const g = new SphereGeometry(r, 12, 8); g.translate(x, y, z); this.mesh(g, col); }
  build() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

/* ---------- 실내 ---------- */
function shell(g, glow, glass, frost) {
  const mid0 = MID[0], mid1 = MID[1], fr0 = FRONT[0], fr1 = FRONT[1];
  // 바닥 · 문턱 노란 띠 · 뒤쪽 높은 바닥
  g.box(0, F - 0.03, 0, W * 2, 0.06, L1 - L0, FLOOR);
  g.box(-W + 0.1, F + 0.003, (mid0 + mid1) / 2, 0.16, 0.006, mid1 - mid0, YELLOW);
  g.box(-W + 0.1, F + 0.003, (fr0 + fr1) / 2, 0.16, 0.006, fr1 - fr0, YELLOW);
  g.box(0, F + 0.15, (L0 + RAISE) / 2, W * 2, 0.3, RAISE - L0, FLOOR);
  g.box(0, F + 0.303, RAISE - 0.03, W * 2, 0.006, 0.06, YELLOW);

  // 옆벽(창 아래) · 창턱: 왼쪽은 통째로, 오른쪽은 문 자리를 비움
  const segs = { 1: [[L0, L1]], [-1]: [[L0, mid0], [mid1, fr0], [fr1, L1]] };
  [1, -1].forEach((s) => segs[s].forEach(([a, b]) => {
    g.box(s * W, (F + WIN0) / 2, (a + b) / 2, 0.06, WIN0 - F, b - a, WALL);
    g.box(s * (W - 0.05), WIN0, (a + b) / 2, 0.1, 0.05, b - a, FRAME);
    glass.box(s * (W + 0.01), (WIN0 + WIN1) / 2, (a + b) / 2, 0.005, WIN1 - WIN0, b - a, WHITE_GLASS);
  }));
  // 창 기둥 · 문 기둥
  [-4.75, -3.45, -2.15, -0.85, 0.45, 1.75, 3.05, 4.35].forEach((z) => g.box(W - 0.02, (WIN0 + WIN1) / 2, z, 0.07, WIN1 - WIN0, 0.11, FRAME));
  [-4.75, -3.45, -2.15, 2.2, 3.45].forEach((z) => g.box(-W + 0.02, (WIN0 + WIN1) / 2, z, 0.07, WIN1 - WIN0, 0.11, FRAME));
  [mid0, mid1, fr0, fr1].forEach((z) => g.box(-W + 0.02, (F + WIN1) / 2, z, 0.09, WIN1 - F, 0.1, FRAME));
  [L0 + 0.06, L1 - 0.06].forEach((z) => [1, -1].forEach((s) => g.box(s * (W - 0.03), (F + WIN1) / 2, z, 0.1, WIN1 - F, 0.12, FRAME)));
  // 창 윗선 · 비스듬한 윗판 · 천장
  [1, -1].forEach((s) => {
    g.box(s * (W - 0.03), WIN1 + 0.035, 0, 0.08, 0.07, L1 - L0, FRAME);
    const yA = WIN1 + 0.07, xB = 0.78;
    const nx = -s * 0.24, ny = -0.42, l = Math.hypot(nx, ny);
    g.quad([s * W, yA, L0], [s * W, yA, L1], [s * xB, TOP, L1], [s * xB, TOP, L0], [nx / l, ny / l, 0], PANEL, 0.8);
  });
  g.quad([-0.78, TOP, L0], [0.78, TOP, L0], [0.78, TOP, L1], [-0.78, TOP, L1], [0, -1, 0], CEIL, 0.92);
  [-0.6, 0.6].forEach((x) => glow.box(x, TOP - 0.018, -0.1, 0.12, 0.03, 9.9, LIGHT));
  // 뒷벽(작은 뒤창)
  g.box(0, (F + 1.7) / 2, L0, W * 2, 1.7 - F, 0.06, WALL);
  g.box(0, (2.45 + TOP) / 2, L0, W * 2, TOP - 2.45, 0.06, PANEL);

  // 앞: 운전석 쪽 계기판, 앞문 쪽 낮은 벽, 앞유리 틀, 행선지 표시 뒷면을 가리는 윗판
  g.box(0.5, (F + 1.15) / 2, 5.2, 1.4, 1.15 - F, 0.5, DASH);
  g.box(-0.7, (F + 1.0) / 2, 5.42, 1.0, 1.0 - F, 0.06, DASH);
  g.box(0, 2.66, 5.38, W * 2, 0.4, 0.12, FRAME);
  [1, -1].forEach((s) => g.box(s * (W - 0.05), 1.8, 5.38, 0.1, 1.3, 0.12, FRAME));
  g.box(0.5, 1.15, 5.42, 1.4, 0.05, 0.1, FRAME);
  glass.box(0, 1.8, 5.43, W * 2, 1.3, 0.005, WHITE_GLASS);
  // 운전석 칸막이(반투명) · 운전석 · 운전자 실루엣
  frost.box((0.2 + W) / 2, (F + 1.95) / 2, 4.0, W - 0.2, 1.95 - F, 0.01, WHITE_GLASS);
  g.box((0.2 + W) / 2, 1.95, 4.0, W - 0.2, 0.04, 0.04, GOLD);
  g.pole(0.2, 4.0);
  g.box(0.7, F + 0.45, 4.7, 0.5, 0.1, 0.5, SEAT);
  g.box(0.7, F + 0.95, 4.45, 0.5, 0.8, 0.1, SEAT, -0.1);
  g.box(0.7, F + 1.25, 4.55, 0.46, 0.24, 0.26, DARK);
  g.ball(0.7, F + 1.5, 4.56, 0.11, DARK);

  // 바퀴 덮개
  [[3.6, 1], [3.6, -1], [-3.0, 1], [-3.0, -1]].forEach(([z, s]) => g.box(s * (0.95 + W) / 2, (F + 1.05) / 2, z, W - 0.95, 1.05 - F, 1.15, ARCH));
}

function seat(g, x, z, base, aisle) {
  const y = F + base;
  if (base > 0.31) g.box(x, F + base / 2, z, 0.46, base, 0.62, ARCH);
  g.box(x, y + 0.2, z, 0.08, 0.4, 0.08, METAL);
  g.box(x, y + 0.43, z, 0.44, 0.09, 0.44, SEAT);
  g.box(x, y + 0.82, z - 0.21, 0.44, 0.7, 0.06, SEAT, -0.13);
  g.box(x, y + 0.82, z - 0.25, 0.42, 0.68, 0.03, SHELL, -0.13);
  if (aisle) g.box(x + aisle * 0.12, y + 1.19, z - 0.27, 0.2, 0.035, 0.035, GOLD);
}

function seats(g) {
  const rowsL = [[3.55, 0.45], [2.7, 0], [1.92, 0], [1.14, 0], [0.36, 0], [-0.42, 0], [-1.2, 0], [-1.98, 0], [-2.9, 0.3], [-3.68, 0.3], [-4.46, 0.3]];
  rowsL.forEach(([z, b]) => { seat(g, 0.93, z, b, 0); seat(g, 0.47, z, b, -1); });
  const rowsR = [[3.5, 0.45], [2.7, 0], [1.92, 0], [-1.2, 0], [-1.98, 0], [-2.9, 0.3], [-3.68, 0.3], [-4.46, 0.3]];
  rowsR.forEach(([z, b]) => seat(g, -0.93, z, b, 1));
  [0.93, 0.47, 0, -0.47, -0.93].forEach((x) => seat(g, x, -5.1, 0.3, 0));
}

function poles(g, glow, bell) {
  const left = [3.2, 1.6, 0.0, -1.6, -3.2].map((z) => [0.24, z]);
  const right = [[-0.72, 2.4], [-0.72, MID[1] + 0.06], [-0.72, MID[0] - 0.06], [-0.72, -2.0], [-0.72, -3.3], [-0.5, 4.05]];
  [...left, ...right].forEach(([x, z]) => {
    g.pole(x, z);
    bell.box(x, 1.45, z - 0.028, 0.05, 0.075, 0.03, WHITE_GLASS);
  });
  // 천장 손잡이 봉 + 받침
  [-0.45, 0.45].forEach((x) => {
    g.rodZ(x, RAIL_Y, -4.9, 4.0);
    for (let z = -4.5; z <= 3.8; z += 1.55) g.pole(x, z, RAIL_Y, TOP, 0.012);
  });
  // 교통카드 단말기: 앞문(승차) · 가운데 문(하차)
  [[-0.5, 4.05 - 0.07], [-0.82, MID[1] + 0.06], [-0.82, MID[0] - 0.06]].forEach(([x, z]) => {
    g.box(x, 1.3, z, 0.11, 0.17, 0.1, DARK);
    glow.box(x, 1.32, z - 0.052, 0.075, 0.09, 0.004, GREEN);
  });
  // 창 기둥에도 하차벨
  [-2.15, 2.2].forEach((z) => bell.box(-W + 0.08, 1.55, z, 0.03, 0.075, 0.05, WHITE_GLASS));
  [-0.85, 1.75].forEach((z) => bell.box(W - 0.08, 1.55, z, 0.03, 0.075, 0.05, WHITE_GLASS));
}

// 문짝 하나 (로컬: x = 두께, y = 위, z = 폭)
function doorLeaf(w, h, solidMat, glassMat) {
  const g = new Geo(), gl = new Geo();
  [-1, 1].forEach((s) => {
    g.box(0, 0, s * (w / 2 - 0.03), 0.05, h, 0.06, FRAME);
    g.box(0, s * (h / 2 - 0.03), 0, 0.05, 0.06, w, FRAME);
  });
  g.box(0, -h / 2 + 0.55, 0, 0.05, 0.05, w, FRAME);
  g.box(0.03, 0.05, 0, 0.03, 0.03, w * 0.7, GOLD);
  gl.box(0, 0, 0, 0.01, h, w, WHITE_GLASS);
  const leaf = new Group();
  leaf.add(new Mesh(g.build(), solidMat), new Mesh(gl.build(), glassMat));
  return leaf;
}

/* ---------- 손잡이 끈 (인스턴스) ---------- */
function strapGeometry() {
  const g = new Geo();
  g.box(0, -0.12, 0, 0.028, 0.24, 0.01, STRAP);
  g.box(0, -0.245, 0, 0.07, 0.014, 0.014, HANDLE);
  [-1, 1].forEach((s) => g.box(s * 0.042, -0.275, 0, 0.014, 0.068, 0.014, HANDLE));
  g.box(0, -0.31, 0, 0.098, 0.018, 0.018, HANDLE);
  return g.build();
}

export function createBusRide(scene, { fontFamily, patchFog, stopName = "도서관 입구" }) {
  const solidMat = new MeshBasicMaterial({ vertexColors: true, fog: false });
  const glowMat = new MeshBasicMaterial({ vertexColors: true, fog: false });
  const bellMat = new MeshBasicMaterial({ color: "#6e1712", fog: false });
  const glassMat = new MeshBasicMaterial({ color: "#a8bfcc", transparent: true, opacity: 0.07, depthWrite: false, side: DoubleSide, fog: false });
  const doorGlassMat = new MeshBasicMaterial({ color: "#b4c8d2", transparent: true, opacity: 0.13, depthWrite: false, side: DoubleSide, fog: false });
  const frostMat = new MeshBasicMaterial({ color: "#dfe6ea", transparent: true, opacity: 0.6, depthWrite: false, side: DoubleSide, fog: false });

  const inside = new Group();
  const g = new Geo(), glow = new Geo(true), glass = new Geo(), frost = new Geo(), bell = new Geo();
  shell(g, glow, glass, frost);
  seats(g);
  poles(g, glow, bell);
  inside.add(new Mesh(g.build(), solidMat), new Mesh(glow.build(), glowMat), new Mesh(bell.build(), bellMat),
    new Mesh(glass.build(), glassMat), new Mesh(frost.build(), frostMat));

  // 정류장 안내 화면 (천장에 매달림, 뒤쪽 승객을 향함)
  const screen = busScreenCanvas(fontFamily, stopName);
  const sc = new Geo();
  sc.box(0, 2.6, 1.78, 0.78, 0.26, 0.05, DARK);
  sc.box(0, 2.78, 1.78, 0.05, 0.12, 0.04, FRAME);
  inside.add(new Mesh(sc.build(), solidMat));
  const screenMesh = new Mesh(new PlaneGeometry(0.72, 0.2), new MeshBasicMaterial({ map: screen.texture, fog: false }));
  screenMesh.position.set(0, 2.6, 1.753);
  screenMesh.rotation.y = Math.PI;
  inside.add(screenMesh);

  // 문: [닫힌 중심 z, 열릴 때 미끄러지는 방향]
  const leaves = [];
  [[MID, 0.65], [FRONT, 0.55]].forEach(([[a, b], w]) => {
    [[a + w / 2, -1], [b - w / 2, 1]].forEach(([z0, dir]) => {
      const leaf = doorLeaf(w, WIN1 - F - 0.02, solidMat, doorGlassMat);
      leaf.position.set(-W + 0.01, (F + WIN1) / 2, z0);
      inside.add(leaf);
      leaves.push({ leaf, z0, dir, w, front: a === FRONT[0] });
    });
  });

  // 손잡이 끈: 카메라 바로 앞뒤는 비워 둠 (너무 가까워 화면을 가리지 않게)
  const straps = [];
  [-0.45, 0.45].forEach((x) => {
    for (let z = -4.6; z <= 3.75; z += 0.55) {
      if (z > CAM.z - 0.6 && z < CAM.z + 1.1) continue;
      straps.push({ x, z, ph: straps.length * 1.37 });
    }
  });
  const strapMesh = new InstancedMesh(strapGeometry(), solidMat, straps.length);
  strapMesh.frustumCulled = false;
  inside.add(strapMesh);
  inside.traverse((o) => { o.frustumCulled = false; });
  inside.visible = false;
  scene.add(inside);

  // 바깥 차체: 거리의 다른 버스와 같은 모델 (파란 간선버스)
  const outside = createFleet(scene, [{ type: "bus", x: 1e5, z: 1e5, ang: 0, color: "#2f6fd0" }], patchFog);
  outside.meshes.forEach((m) => { m.frustumCulled = false; });

  const dummy = new Object3D();
  const DAY = new Color(0.93, 0.93, 0.92), NIGHT = new Color(1.0, 0.93, 0.8);
  const motion = { speed: 0, accel: 0 };
  let last = null, swing = 0, swingV = 0, arrivingDrawn = false;

  const toWorld = (pose, lx, lz) => [
    pose.x + lz * Math.cos(pose.yaw) + lx * Math.sin(pose.yaw),
    pose.z + lz * Math.sin(pose.yaw) - lx * Math.cos(pose.yaw)
  ];

  /**
   * pose: { x, z, yaw, show, inside, doors(0~1), arriving }
   */
  function update(pose, time, dt, tod) {
    const ang = Math.PI / 2 - pose.yaw;
    if (pose.show) outside.set(0, pose.x, pose.z, ang); else outside.set(0, 1e5, 1e5, 0);
    outside.commit();
    outside.setNight(tod.night || 0);
    inside.visible = !!(pose.show && pose.inside);

    // 속도 · 가속도 (스크롤로 움직이므로 부드럽게 걸러 씀)
    if (last && dt > 0) {
      const v = Math.hypot(pose.x - last.x, pose.z - last.z) / dt;
      const k = 1 - Math.exp(-dt * 5);
      const prev = motion.speed;
      motion.speed += (Math.min(v, 30) - motion.speed) * k;
      motion.accel += ((motion.speed - prev) / dt - motion.accel) * k;
    }
    last = { x: pose.x, z: pose.z };
    if (!inside.visible) { swing = swingV = 0; return; }

    inside.position.set(pose.x, 0, pose.z);
    inside.rotation.y = ang;
    const n = tod.night || 0;
    solidMat.color.copy(DAY).lerp(NIGHT, n);
    bellMat.color.set(pose.arriving ? "#ff3b2a" : "#6e1712");
    if (pose.arriving !== arrivingDrawn) { arrivingDrawn = pose.arriving; screen.draw(pose.arriving); }

    leaves.forEach((L) => {
      const f = L.front ? 0 : pose.doors;
      L.leaf.position.z = L.z0 + L.dir * f * (L.w - 0.05);
      L.leaf.position.x = -W + 0.01 - 0.07 * Math.min(1, f * 4);
    });

    // 손잡이 끈: 가속하면 뒤로, 감속하면 앞으로 흔들리는 진자
    const eq = Math.max(-0.5, Math.min(0.5, Math.atan(motion.accel / 9.8)));
    const step = Math.min(dt, 0.05);
    swingV += (-(swing - eq) * 26 - swingV * 3.2) * step;
    swing += swingV * step;
    const wob = 0.02 + Math.min(1, motion.speed / 12) * 0.05;
    straps.forEach((s, i) => {
      dummy.position.set(s.x, RAIL_Y, s.z);
      dummy.rotation.set(swing + Math.sin(time * 2.3 + s.ph) * wob, 0, Math.sin(time * 1.7 + s.ph * 1.3) * wob * 0.6);
      dummy.updateMatrix();
      strapMesh.setMatrixAt(i, dummy.matrix);
    });
    strapMesh.instanceMatrix.needsUpdate = true;
  }

  return { CAM, DOOR, toWorld, motion, update };
}
