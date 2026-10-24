/**
 * DUX — 거리 배치 데이터(city-gen.js 또는 data/city.json)를 3D 장면으로 세웁니다.
 * 같은 재질은 한 덩어리로 합치고, 반복 소품은 인스턴싱해서 그리기 호출 수를 줄입니다.
 */
import {
  BufferGeometry, Float32BufferAttribute, Mesh, InstancedMesh, Object3D, Group, Color,
  BoxGeometry, CylinderGeometry, IcosahedronGeometry, PlaneGeometry,
  MeshLambertMaterial, MeshBasicMaterial, PointsMaterial, LineBasicMaterial, Points, LineSegments,
  ShapeUtils, Vector2, AdditiveBlending, DoubleSide
} from "../../vendor/three.min.js";
import {
  ATLAS, facadeTextures, shopTextures, SHOP_VARIANTS, signTextures, SIGN_COUNT, LIBRARY_SIGN, VSIGN_COUNT,
  asphaltTexture, pavingTexture, bisCanvas, glowTexture, flowTexture, labelTexture, adTexture, noParkingTexture
} from "./textures.js";
import { rng } from "./city-gen.js";
import { createFleet, bodyColor } from "./cars.js";

/* ---------- 지오메트리 누적기 ---------- */
class Acc {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, u, v, col) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.uv.push(u, v);
    this.c.push(col ? col.r : 1, col ? col.g : 1, col ? col.b : 1);
  }
  // a,b,c,d: 반시계 순서의 네 꼭짓점 [x,y,z], uvs: [[u,v] x4]
  quad(a, b, c, d, nrm, uvs, col) {
    const s = this.count;
    [a, b, c, d].forEach((q, k) => this.vert(q[0], q[1], q[2], nrm[0], nrm[1], nrm[2], uvs[k][0], uvs[k][1], col));
    this.i.push(s, s + 1, s + 2, s, s + 2, s + 3);
  }
  build() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    g.setAttribute("color", new Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

const toPts = (flat) => { const o = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };
/* 점 (x, z) 가 폴리라인들 중 하나와 d 보다 가까운지 */
function nearLines(lines, x, z, d) {
  return lines.some((pts) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
      const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2));
      if (Math.hypot(x - ax - vx * t, z - az - vz * t) < d) return true;
    }
    return false;
  });
}
/* 색이 다른 여러 지오메트리를 정점 색 하나로 합침 (소품용) */
function mergeColored(parts) {
  const p = [], n = [], c = [];
  parts.forEach(([g, col]) => {
    const gi = g.index ? g.toNonIndexed() : g;
    const P = gi.attributes.position.array, N = gi.attributes.normal.array;
    for (let i = 0; i < P.length; i += 3) { p.push(P[i], P[i + 1], P[i + 2]); n.push(N[i], N[i + 1], N[i + 2]); c.push(col.r, col.g, col.b); }
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(p, 3));
  g.setAttribute("normal", new Float32BufferAttribute(n, 3));
  g.setAttribute("color", new Float32BufferAttribute(c, 3));
  g.computeBoundingSphere();
  return g;
}
function signedArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length]; a += x1 * z2 - x2 * z1; } return a / 2; }

/* 위(+y)를 향하는 삼각형 하나 (감김 방향 자동 보정) */
function triUp(acc, A, B, C, uvScale, col) {
  const cy = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
  if (cy < 0) [B, C] = [C, B];
  const uv = (q) => (uvScale ? [q[0] / uvScale, q[2] / uvScale] : [0, 0]);
  acc.quad(A, B, C, A, [0, 1, 0], [uv(A), uv(B), uv(C), uv(A)], col);
}

/* 폴리라인 → 띠 (y 고정) */
function strip(acc, pts, width, y, uvScale, col, offset = 0) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const dx = x2 - x1, dz = z2 - z1, L = Math.hypot(dx, dz);
    if (L < 0.01) continue;
    const nx = -dz / L, nz = dx / L;
    const h = width / 2;
    const o1 = offset + h, o2 = offset - h;
    const A = [x1 + nx * o2, y, z1 + nz * o2], B = [x2 + nx * o2, y, z2 + nz * o2];
    const C = [x2 + nx * o1, y, z2 + nz * o1], D = [x1 + nx * o1, y, z1 + nz * o1];
    const uv = (q) => [q[0] / uvScale, q[2] / uvScale];
    acc.quad(A, D, C, B, [0, 1, 0], [uv(A), uv(D), uv(C), uv(B)], col);
  }
}
function disc(acc, x, z, r, y, uvScale, col) {
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
    const P = [x, y, z], Q = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], S = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r];
    const uv = (q) => [q[0] / uvScale, q[2] / uvScale];
    acc.quad(P, Q, S, P, [0, 1, 0], [uv(P), uv(Q), uv(S), uv(P)], col);
  }
}

/* 거리 기준 재표본화 */
export function resample(flat, step) {
  const pts = toPts(flat);
  const out = [pts[0]];
  const dist = [0];
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
    const L = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) { out.push([x1 + ((x2 - x1) * k) / n, z1 + ((z2 - z1) * k) / n]); dist.push(acc + (L * k) / n); }
    acc += L;
  }
  return { pts: out, dist, length: acc };
}

/* ========================================================================== */
export async function buildCity(city, scene, { fontFamily, mobile, patchFog, icon }) {
  const r = rng(77);
  const R = (a, b) => a + (b - a) * r();
  const tmp = new Color();
  const out = { mats: {}, update: () => {}, setBis: () => {} };
  city.pois = Object.assign({ crosswalks: [], stop: { x: 0, z: 11 }, bis: { x: -8, z: 10.6 }, elevator: { x: 60, z: 12 } }, city.pois || {});
  const lit = []; // 밤/새벽에 밝기가 바뀌는 재질 { mat, night, dawn }

  /* ---------- 노면 ---------- */
  const asphalt = new Acc(), alleyAcc = new Acc(), paving = new Acc(), marks = new Acc(), marksY = new Acc(), marksB = new Acc(), green = new Acc(), lots = new Acc();
  const mainRoads = city.roads.filter((rd) => rd.k !== "alley");
  city.roads.forEach((rd) => {
    const pts = toPts(rd.pts);
    if (rd.sw > 0) {
      strip(paving, pts, rd.w + rd.sw * 2, 0.012, 3);
      pts.slice(1, -1).forEach(([x, z]) => disc(paving, x, z, rd.w / 2 + rd.sw, 0.012, 3));
    }
    if (rd.k === "alley") {
      strip(alleyAcc, pts, rd.w, 0.016, 5);
      pts.slice(1, -1).forEach(([x, z]) => disc(alleyAcc, x, z, rd.w / 2, 0.016, 5));
    } else {
      strip(asphalt, pts, rd.w, 0.02, 6);
      pts.slice(1, -1).forEach(([x, z]) => disc(asphalt, x, z, rd.w / 2, 0.02, 6));
    }
  });
  // 횡단보도: { x, z, dx, dz, w } (dx,dz = 도로 방향, w = 차도 폭). 축 정렬 형식도 받음
  const crosses = (city.pois.crosswalks || []).map((c) =>
    c.axis === "z" ? { x: c.x, z: (c.z0 + c.z1) / 2, dx: 1, dz: 0, w: c.z1 - c.z0 }
      : c.axis === "x" ? { x: (c.x0 + c.x1) / 2, z: c.z, dx: 0, dz: 1, w: c.x1 - c.x0 } : c);
  const nearCross = (x, z, pad) => crosses.some((c) => {
    const rx = x - c.x, rz = z - c.z;
    return Math.abs(rx * c.dx + rz * c.dz) < pad && Math.abs(-rx * c.dz + rz * c.dx) < c.w / 2 + 1.2;
  });
  const procedural = city.source === "procedural";
  const nearSecMouth = (x) => procedural && mainRoads.some((rd) => rd.k === "sec" && Math.abs(rd.pts[0] - x) < rd.w / 2 + 4);
  // 폴리라인을 따라 일정 간격으로 점 찍기: fn(x, z, 방향 dx, dz, 법선 nx, nz)
  const along = (pts, start, step, fn) => {
    let s = start, base = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.01) continue;
      const dx = (x2 - x1) / L, dz = (z2 - z1) / L;
      while (s < base + L) {
        const t = s - base;
        fn(x1 + dx * t, z1 + dz * t, dx, dz, -dz, dx);
        s += typeof step === "function" ? step() : step;
      }
      base += L;
    }
  };
  // 차선
  mainRoads.forEach((rd) => {
    const pts = toPts(rd.pts);
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[i + 1];
      const L = Math.hypot(x2 - x1, z2 - z1), dx = (x2 - x1) / L, dz = (z2 - z1) / L;
      const lane = (off, w, dash, gap, acc) => {
        for (let s = 0; s < L; s += dash + gap) {
          const a = s, b = Math.min(L, s + dash);
          const xa = x1 + dx * a, za = z1 + dz * a, xb = x1 + dx * b, zb = z1 + dz * b;
          const mx = (xa + xb) / 2, mz = (za + zb) / 2;
          if (nearCross(mx, mz + 0, 5) || (rd.k === "main" && nearSecMouth(mx))) continue;
          strip(acc, [[xa, za], [xb, zb]], w, 0.03, 1, null, off);
        }
      };
      if (rd.k === "main") {
        lane(0.18, 0.14, 3, 0, marksY); lane(-0.18, 0.14, 3, 0, marksY);   // 중앙 황색 복선
        lane(3.4, 0.14, 3, 5, marks); lane(-3.4, 0.14, 3, 5, marks);        // 차로 점선
        lane(6.7, 0.18, 5, 3, marksB); lane(-6.7, 0.18, 5, 3, marksB);      // 버스전용차로 청색
        lane(9.6, 0.14, 4, 0, marks); lane(-9.6, 0.14, 4, 0, marks);        // 가장자리
      } else {
        lane(0, 0.14, 3, 0, marksY);
      }
    }
  });
  // 횡단보도
  crosses.forEach((c) => {
    const nx = -c.dz, nz = c.dx;
    for (let s = -c.w / 2 + 0.4; s < c.w / 2 - 0.3; s += 1.0) {
      const cx = c.x + nx * s, cz = c.z + nz * s;
      strip(marks, [[cx - c.dx * 2.1, cz - c.dz * 2.1], [cx + c.dx * 2.1, cz + c.dz * 2.1]], 0.5, 0.032, 1);
    }
  });
  city.parks.forEach((pk) => { const p = toPts(pk.pts); fillPoly(green, p, 0.014, 4); });
  city.lots.forEach((lt) => { const p = toPts(lt.pts); fillPoly(lots, p, 0.018, 5); });

  function fillPoly(acc, pts, y, uvScale) {
    const ccw = signedArea(pts) < 0 ? pts : pts.slice().reverse();
    const contour = ccw.map(([x, z]) => new Vector2(x, z));
    const tris = ShapeUtils.triangulateShape(contour, []);
    tris.forEach(([a, b, c]) => triUp(acc, [ccw[a][0], y, ccw[a][1]], [ccw[b][0], y, ccw[b][1]], [ccw[c][0], y, ccw[c][1]], uvScale));
  }

  const asphaltMat = new MeshLambertMaterial({ map: asphaltTexture(3), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  const alleyMat = new MeshLambertMaterial({ map: asphaltTexture(9, true), polygonOffset: true, polygonOffsetFactor: -0.5, polygonOffsetUnits: -1 });
  const pavingMat = new MeshLambertMaterial({ map: pavingTexture(5) });
  const markMat = (color) => new MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const groundMat = new MeshLambertMaterial({ color: "#4a4743" });
  const ground = new Mesh(new PlaneGeometry(6000, 6000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  [[paving, pavingMat], [alleyAcc, alleyMat], [asphalt, asphaltMat], [lots, new MeshLambertMaterial({ color: "#3b3a38", polygonOffset: true, polygonOffsetFactor: -0.6, polygonOffsetUnits: -1 })],
   [green, new MeshLambertMaterial({ color: "#3d4a2c", polygonOffset: true, polygonOffsetFactor: -0.4 })],
   [marks, markMat("#d9d6cf")], [marksY, markMat("#d9a521")], [marksB, markMat("#2a5fc2")]]
    .forEach(([acc, mat]) => { if (acc.count) scene.add(new Mesh(acc.build(), mat)); });

  /* ---------- 건물 ---------- */
  const facade = { res: facadeTextures("res", 11), com: facadeTextures("com", 23), apt: facadeTextures("apt", 37) };
  const wallAcc = { res: new Acc(), com: new Acc(), apt: new Acc() };
  const roofAcc = new Acc();
  const shopAcc = new Acc();
  const signAcc = new Acc();
  const darkAcc = new Acc(); // 간판 몸체, 상가 차양 등 어두운 덩어리
  const acSpots = [], tankSpots = [];
  const signs = signTextures(fontFamily);
  const BAY = 3.2;
  const resTints = ["#e8dccb", "#c9a08a", "#b9b2a6", "#ddd6c8", "#a8705a", "#d8cfbd", "#efe8dc", "#9c8f80"];
  const comTints = ["#c7cacb", "#a9b0b3", "#d9d6cf", "#8f9699", "#bfb6a8"];
  const aptTints = ["#efece6", "#e6e1d7", "#f2efe8"];

  const signCell = (idx) => {
    const c = idx % 4, row = Math.floor(idx / 4);
    const top = 1 - (row * 64) / 1024, bot = 1 - ((row + 1) * 64) / 1024;
    return [c / 4 + 0.004, bot + 0.004, (c + 1) / 4 - 0.004, top - 0.004];
  };
  const vsignCell = (idx) => [(idx * 128) / 1024 + 0.003, 0.004, ((idx + 1) * 128) / 1024 - 0.003, 0.5 - 0.004];

  city.buildings.forEach((b, bi) => {
    let pts = toPts(b.pts);
    const kind = b.k === "civic" ? "com" : b.k;
    const accW = wallAcc[kind] || wallAcc.res;
    const tint = tmp.set(pick(kind === "res" ? resTints : kind === "apt" ? aptTints : comTints)).multiplyScalar(R(0.88, 1.08)).clone();
    // 바깥쪽을 향하도록 정렬 (x-z 평면에서 반시계)
    let flip = signedArea(pts) > 0;
    let front = b.front;
    if (flip) { pts = pts.slice().reverse(); if (front !== undefined) front = (pts.length - 2 - front + pts.length) % pts.length; }
    const h = b.h;
    const floorH = kind === "apt" ? 2.8 : kind === "com" ? 3.4 : 2.9;
    const uOff = Math.floor(R(0, ATLAS)), vOff = Math.floor(R(0, ATLAS));
    let per = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length];
      const L = Math.hypot(x2 - x1, z2 - z1);
      if (L < 0.05) continue;
      const nx = -(z2 - z1) / L, nz = (x2 - x1) / L; // 바깥 법선 (꼭짓점을 시계 방향으로 맞춘 뒤의 왼쪽 법선)
      const u0 = (per / BAY + uOff) / ATLAS, u1 = ((per + L) / BAY + uOff) / ATLAS;
      const v0 = vOff / ATLAS, v1 = (h / floorH + vOff) / ATLAS;
      accW.quad([x1, 0, z1], [x2, 0, z2], [x2, h, z2], [x1, h, z1], [nx, 0, nz], [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], tint);
      per += L;

      const isFront = i === front;
      // 1층 상가 + 간판
      if (isFront && b.shop) {
        const gh = kind === "com" ? 4.2 : 3.0;
        const segs = b.sign === "library" ? 1 : Math.max(1, Math.round(L / R(6, 9)));
        for (let s = 0; s < segs; s++) {
          const t0 = s / segs, t1 = (s + 1) / segs;
          const ax = x1 + (x2 - x1) * t0 + nx * 0.06, az = z1 + (z2 - z1) * t0 + nz * 0.06;
          const bx = x1 + (x2 - x1) * t1 + nx * 0.06, bz = z1 + (z2 - z1) * t1 + nz * 0.06;
          const variant = b.sign === "library" ? 5 : chooseShop();
          const cu = (variant % 4) / 4, cv = 1 - (Math.floor(variant / 4) + 1) / 2;
          shopAcc.quad([ax, 0, az], [bx, 0, bz], [bx, gh, bz], [ax, gh, az], [nx, 0, nz], [[cu + 0.004, cv + 0.004], [cu + 0.246, cv + 0.004], [cu + 0.246, cv + 0.496], [cu + 0.004, cv + 0.496]]);
          // 간판 박스
          const inset = (L / segs) * 0.06;
          const sx = ax + ((bx - ax) / (L / segs)) * inset, sz = az + ((bz - az) / (L / segs)) * inset;
          const ex = bx - ((bx - ax) / (L / segs)) * inset, ez = bz - ((bz - az) / (L / segs)) * inset;
          const y0 = gh + 0.05, y1 = gh + (kind === "com" ? 1.15 : 0.9), d = 0.32;
          let sIdx = Math.floor(r() * SIGN_COUNT);
          if (sIdx === LIBRARY_SIGN) sIdx = 0;
          const cell = signCell(b.sign === "library" ? LIBRARY_SIGN : sIdx);
          signAcc.quad([sx + nx * d, y0, sz + nz * d], [ex + nx * d, y0, ez + nz * d], [ex + nx * d, y1, ez + nz * d], [sx + nx * d, y1, sz + nz * d], [nx, 0, nz],
            [[cell[0], cell[1]], [cell[2], cell[1]], [cell[2], cell[3]], [cell[0], cell[3]]]);
          darkAcc.quad([sx, y1, sz], [ex, y1, ez], [ex + nx * d, y1, ez + nz * d], [sx + nx * d, y1, sz + nz * d], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
          darkAcc.quad([sx + nx * d, y0, sz + nz * d], [ex + nx * d, y0, ez + nz * d], [ex, y0, ez], [sx, y0, sz], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
        }
        // 상업 건물 모서리 세로 돌출 간판
        if (kind === "com" && b.floors >= 4 && r() < 0.7) {
          const cell = vsignCell(Math.floor(r() * VSIGN_COUNT));
          const t = r() < 0.5 ? 0.04 : 0.96;
          const px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t;
          const tx = (x2 - x1) / L, tz = (z2 - z1) / L;
          const y0 = 5.6, y1 = Math.min(h - 1.5, y0 + R(3, 5.5)), off0 = 0.2, off1 = 1.0;
          const A = [px + nx * off0, y0, pz + nz * off0], B = [px + nx * off1, y0, pz + nz * off1], C = [px + nx * off1, y1, pz + nz * off1], D = [px + nx * off0, y1, pz + nz * off0];
          signAcc.quad(A, B, C, D, [tx, 0, tz], [[cell[0], cell[1]], [cell[2], cell[1]], [cell[2], cell[3]], [cell[0], cell[3]]]);
          signAcc.quad(B, A, D, C, [-tx, 0, -tz], [[cell[0], cell[1]], [cell[2], cell[1]], [cell[2], cell[3]], [cell[0], cell[3]]]);
        }
      }
      // 에어컨 실외기 (주거 건물, 정면 제외)
      if (kind === "res" && !isFront && L > 3) {
        for (let f = 1; f < b.floors; f++) {
          for (let s = 1.2; s < L - 1; s += BAY) {
            if (r() > 0.16) continue;
            const t = s / L;
            acSpots.push([x1 + (x2 - x1) * t + nx * 0.2, f * floorH + 0.25, z1 + (z2 - z1) * t + nz * 0.2, Math.atan2(nx, nz)]);
          }
        }
      }
    }
    // 지붕
    const contour = pts.map(([x, z]) => new Vector2(x, z));
    const tris = ShapeUtils.triangulateShape(contour, []);
    const roofCol = tmp.set(kind === "res" ? (r() < 0.55 ? "#5f7a5c" : "#7a756c") : "#6b6863").clone();
    tris.forEach(([a, bb, c]) => triUp(roofAcc, [pts[a][0], h, pts[a][1]], [pts[bb][0], h, pts[bb][1]], [pts[c][0], h, pts[c][1]], 0, roofCol));
    if (kind === "res" && r() < 0.4) {
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      tankSpots.push([cx + R(-1.5, 1.5), h, cz + R(-1.5, 1.5)]);
    }
  });
  function pick(arr) { return arr[Math.floor(r() * arr.length)]; }
  function chooseShop() {
    const x = r();
    if (x < 0.62) return Math.floor(r() * 4);   // 새벽: 대부분 셔터
    if (x < 0.7) return 7;
    if (x < 0.76) return 4;                     // 24시간 편의점
    return 5 + Math.floor(r() * 2);
  }

  const wallMats = {};
  ["res", "com", "apt"].forEach((k) => {
    const mat = new MeshLambertMaterial({ map: facade[k].map, emissiveMap: facade[k].emissive, emissive: "#ffffff", emissiveIntensity: 1, vertexColors: true });
    wallMats[k] = mat;
    lit.push({ mat, night: k === "com" ? 0.7 : 1.0, dawn: 0.12 });
    if (wallAcc[k].count) scene.add(new Mesh(wallAcc[k].build(), mat));
  });
  scene.add(new Mesh(roofAcc.build(), new MeshLambertMaterial({ vertexColors: true })));
  const shopTex = shopTextures(5);
  const shopMat = new MeshLambertMaterial({ map: shopTex.map, emissiveMap: shopTex.emissive, emissive: "#ffffff", emissiveIntensity: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  lit.push({ mat: shopMat, night: 1.0, dawn: 0.55 });
  if (shopAcc.count) scene.add(new Mesh(shopAcc.build(), shopMat));
  const signMat = new MeshLambertMaterial({ map: signs.map, emissiveMap: signs.map, emissive: "#ffffff", emissiveIntensity: 1.2, side: DoubleSide });
  lit.push({ mat: signMat, night: 1.15, dawn: 0.35 });
  if (signAcc.count) scene.add(new Mesh(signAcc.build(), signMat));
  const darkMat = new MeshLambertMaterial({ color: "#26241f", side: DoubleSide });
  if (darkAcc.count) scene.add(new Mesh(darkAcc.build(), darkMat));

  /* ---------- 인스턴스 소품 ---------- */
  const dummy = new Object3D();
  function instanced(geo, mat, spots, set) {
    if (!spots.length) return null;
    const m = new InstancedMesh(geo, mat, spots.length);
    spots.forEach((s, i) => { set(dummy, s, i); dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix); });
    m.instanceMatrix.needsUpdate = true;
    scene.add(m);
    return m;
  }
  // 실외기
  instanced(new BoxGeometry(0.85, 0.62, 0.34), new MeshLambertMaterial({ color: "#cfcac0" }), acSpots, (d, s) => {
    d.position.set(s[0], s[1], s[2]); d.rotation.set(0, s[3], 0); d.scale.set(1, 1, 1);
  });
  // 옥상 물탱크
  instanced(new CylinderGeometry(0.9, 0.9, 1.7, 12), new MeshLambertMaterial({ color: "#3d6fa8" }), tankSpots, (d, s) => {
    d.position.set(s[0], s[1] + 0.85, s[2]); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
  });

  /* 대로·이면도로 보도: 가로수, 가로등 */
  const trees = [], lamps = [], lampGlow = [], pools = [];
  const P = city.pois;
  const avoid = (x, z) => nearCross(x, z, 7) || (P.stop && Math.hypot(x - P.stop.x, z - P.stop.z) < 12) || (P.elevator && Math.hypot(x - P.elevator.x, z - P.elevator.z) < 7);
  const mainLines = mainRoads.filter((rd) => rd.k === "main").map((rd) => toPts(rd.pts));
  const nearMain = (x, z, d) => nearLines(mainLines, x, z, d);
  mainRoads.forEach((rd) => {
    const pts = toPts(rd.pts);
    const curb = rd.w / 2 + 0.85;
    for (const side of [1, -1]) {
      along(pts, R(2, 9), rd.k === "main" ? 8.5 : 11, (cx, cz, dx, dz, nx, nz) => {
        const x = cx + nx * curb * side, z = cz + nz * curb * side;
        if (avoid(x, z) || (rd.k === "main" && nearSecMouth(x))) return;
        if (rd.k === "main" || r() < 0.5) trees.push([x, z, R(0.85, 1.2), r()]);
      });
      if (rd.k !== "main") continue;
      along(pts, side > 0 ? 6 : 22, 32, (cx, cz, dx, dz, nx, nz) => {
        const o = rd.w / 2 + 0.45;
        const x = cx + nx * o * side, z = cz + nz * o * side;
        if (nearCross(x, z, 3)) return;
        lamps.push([x, z, Math.atan2(-nx * side, -nz * side)]);
        const hx = x - nx * side * 2.1, hz = z - nz * side * 2.1;
        lampGlow.push(hx, 8.7, hz);
        pools.push([hx, hz, 13]);
      });
    }
  });
  // 은행나무 (10월 말, 노랗게 물든 잎)
  const trunk = new CylinderGeometry(0.14, 0.2, 3.4, 6); trunk.translate(0, 1.7, 0);
  instanced(trunk, new MeshLambertMaterial({ color: "#2e2720" }), trees, (d, s) => { d.position.set(s[0], 0, s[1]); d.rotation.set(0, s[3] * 6, 0); d.scale.set(1, s[2], 1); });
  const crown = canopyGeometry();
  const crownMesh = instanced(crown, new MeshLambertMaterial({ color: "#ffffff" }), trees, (d, s) => { d.position.set(s[0], 0, s[1]); d.rotation.set(0, s[3] * 6, 0); d.scale.set(s[2], s[2], s[2]); });
  if (crownMesh) trees.forEach((s, i) => crownMesh.setColorAt(i, tmp.set(s[3] < 0.15 ? "#8a8a3a" : "#d6a431").multiplyScalar(0.8 + s[3] * 0.35)));
  // 가로등
  const lampGeo = mergeBoxes([[0, 4.6, 0, 0.22, 9.2, 0.22], [0, 9.1, 1.05, 0.14, 0.14, 2.2], [0, 8.95, 2.1, 0.5, 0.22, 0.8]]);
  instanced(lampGeo, new MeshLambertMaterial({ color: "#3a3c3d" }), lamps, (d, s) => { d.position.set(s[0], 0, s[1]); d.rotation.set(0, s[2], 0); d.scale.set(1, 1, 1); });

  /* 골목: 전신주 + 전선, 주차 차량 */
  const poles = [], wires = [], secLights = [], parked = [], noParking = [], cones = [];
  const rp = rng(4242); // 골목 소품 전용 (다른 배치의 무작위 순서를 바꾸지 않도록)
  const homeLine = city.route && city.route.w1 ? toPts(city.route.w1.slice(0, 4)) : null; // 집 앞 골목 (걷기 첫 구간)
  city.roads.forEach((rd) => {
    if (rd.k === "main") return;
    const pts = toPts(rd.pts);
    let L = 0;
    for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    if (L < 18) return;
    const side = r() < 0.5 ? 1 : -1;
    const off = rd.k === "alley" ? rd.w / 2 - 0.3 : rd.w / 2 + 0.4;
    let prev = null;
    along(pts, R(4, 12), () => R(25, 34), (cx, cz, dx, dz, nx, nz) => {
      const x = cx + nx * off * side, z = cz + nz * off * side;
      if (rd.k === "alley" && nearMain(x, z, 16)) { prev = null; return; }
      poles.push([x, z, Math.atan2(dx, dz), r()]);
      if (r() < 0.45) { secLights.push(x - nx * side * 0.6, 6.4, z - nz * side * 0.6); pools.push([x - nx * side * 1.2, z - nz * side * 1.2, 7]); }
      if (prev) {
        [[-0.75, 9.55, 0.9], [0, 9.55, 0.8], [0.75, 9.55, 0.95], [0.2, 7.4, 0.6], [-0.2, 7.3, 0.7]].forEach(([lat, y, sag]) => {
          catenary(wires, [prev[0] - lat * prev[2], y, prev[1] - lat * prev[3]], [x - lat * nx, y, z - lat * nz], sag);
        });
        if (r() < 0.35) catenary(wires, [x, 7.4, z], [x - nx * side * (rd.w + 1.2), R(5.5, 7.5), z - nz * side * (rd.w + 1.2)], 0.4);
      }
      prev = [x, z, nx, nz];
    });
    if (rd.k === "alley") {
      // 골목 양쪽 가장자리에 차를 길 방향(세로)으로 종종 세워 둠. 전봇대 바로 옆은 비우고,
      // 빈 자리에는 가끔 주차금지 표지판이나 고깔 (걷는 길과 겹치는 차는 아래에서 빠짐)
      const pOff = rd.w / 2 - 1.0, eOff = rd.w / 2 - 0.35;
      along(pts, R(3, 8), () => R(5.6, 7.5), (cx, cz, dx, dz, nx, nz) => {
        const home = homeLine && nearLines([homeLine], cx, cz, 4); // 첫 장면에 오래 보이는 집 앞 골목은 조금 더 빽빽하게
        const s = rp() < 0.6 ? -side : side;
        const x = cx + nx * pOff * s, z = cz + nz * pOff * s;
        if (nearMain(x, z, 17)) return;
        const byPole = poles.some((q) => Math.hypot(q[0] - x, q[1] - z) < 3.2);
        if (r() < (home ? 0.7 : 0.55) && !byPole) { parked.push([x, z, Math.atan2(dx, dz) + (r() < 0.5 ? 0 : Math.PI), r()]); return; }
        const ex = cx + nx * eOff * s, ez = cz + nz * eOff * s, q = rp();
        if (q < (home ? 0.45 : 0.16)) noParking.push([ex, ez, Math.atan2(-nx * s - 0.8, -nz * s)]); // 골목 안쪽, 서쪽에서 오는 쪽을 보게
        else if (q < (home ? 0.75 : 0.26)) { cones.push([ex - dx * 0.6, ez - dz * 0.6]); cones.push([ex + dx * 0.6, ez + dz * 0.6]); }
      });
    }
  });
  city.lots.forEach((lt) => {
    const p = toPts(lt.pts);
    const cx = p.reduce((s, q) => s + q[0], 0) / p.length, cz = p.reduce((s, q) => s + q[1], 0) / p.length;
    for (let k = -1; k <= 1; k++) if (r() < 0.7) parked.push([cx + k * 2.7, cz, Math.PI / 2, r()]);
  });
  function catenary(arr, a, b, sag) {
    const n = 8;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const p = (t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
      arr.push(...p(t0), ...p(t1));
    }
  }
  const poleGeo = mergeBoxes([[0, 5.25, 0, 0.3, 10.5, 0.3], [0, 9.55, 0, 1.9, 0.14, 0.14], [0, 7.4, 0, 0.9, 0.1, 0.1]]);
  instanced(poleGeo, new MeshLambertMaterial({ color: "#8d8a84" }), poles, (d, s) => { d.position.set(s[0], 0, s[1]); d.rotation.set(0, s[2], 0); d.scale.set(1, 1, 1); });
  const trans = poles.filter((p) => p[3] < 0.22);
  instanced(new CylinderGeometry(0.32, 0.32, 1.1, 10), new MeshLambertMaterial({ color: "#6f716f" }), trans, (d, s) => { d.position.set(s[0] + 0.35, 8.2, s[1]); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });
  if (wires.length) {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(wires, 3));
    scene.add(new LineSegments(g, new LineBasicMaterial({ color: "#0d0c0b" })));
  }
  // 주차 차량 (골목마다 세단·SUV·경차·1톤 트럭이 섞여 있음)
  // 걷는 경로를 가로막는 차는 빼냄: 차체(길이 4.6m · 폭 1.9m)가 경로 중심선에서 0.6m 안으로 들어오면 제외
  const walkLines = ["w1", "w2", "w3"].filter((k) => city.route && city.route[k]).map((k) => toPts(city.route[k]));
  const blocksWalk = ([x, z, ang]) => {
    // 차체 위를 0.5m 간격 격자로 훑어서, 경로가 격자 사이로 빠져나가지 않게
    const fx = Math.sin(ang), fz = Math.cos(ang);
    for (let t = -2.3; t <= 2.31; t += 0.46) for (const w of [-0.95, -0.32, 0.32, 0.95]) {
      if (nearLines(walkLines, x + fx * t + fz * w, z + fz * t - fx * w, 0.6)) return true;
    }
    return false;
  };
  const parkedOk = parked.filter((s) => !blocksWalk(s));
  const parkType = (q) => (q < 0.36 ? "sedan" : q < 0.6 ? "suv" : q < 0.8 ? "hatch" : q < 0.94 ? "truck" : "taxi");
  const parkedFleet = parkedOk.length ? createFleet(scene, parkedOk.map((s) => {
    const type = parkType(s[3]);
    return { type, x: s[0], z: s[1], ang: s[2], color: bodyColor(type, (s[3] * 7.31) % 1) };
  }), patchFog) : null;

  // 주차금지 표지판 (고무 받침 + 기둥 + 둥근 판) · 고깔: 집 앞 골목 가장자리에 세워 둔 것
  const C = (hex) => new Color(hex);
  const standGeo = mergeColored([
    [new CylinderGeometry(0.2, 0.25, 0.08, 14).translate(0, 0.04, 0), C("#1d1d1f")],
    [new CylinderGeometry(0.024, 0.024, 0.92, 8).translate(0, 0.54, 0), C("#9a9da1")]
  ]);
  const standMat = new MeshBasicMaterial({ vertexColors: true, color: "#9c9c9c" });
  instanced(standGeo, standMat, noParking, (d, s) => { d.position.set(s[0], 0, s[1]); d.rotation.set(0, s[2], 0); d.scale.set(1, 1, 1); });
  const npTex = noParkingTexture(fontFamily);
  const npMat = new MeshLambertMaterial({ map: npTex, emissiveMap: npTex, emissive: "#ffffff", emissiveIntensity: 0.5, alphaTest: 0.5, side: DoubleSide });
  lit.push({ mat: npMat, night: 0.6, dawn: 0.15 });
  instanced(new PlaneGeometry(0.52, 0.52).translate(0, 1.2, 0.03), npMat, noParking, (d, s) => { d.position.set(s[0], 0, s[1]); d.rotation.set(0, s[2], 0); d.scale.set(1, 1, 1); });
  const coneGeo = mergeColored([
    [new BoxGeometry(0.38, 0.04, 0.38).translate(0, 0.02, 0), C("#222222")],
    [new CylinderGeometry(0.105, 0.16, 0.3, 14).translate(0, 0.19, 0), C("#ff5f12")],
    [new CylinderGeometry(0.075, 0.105, 0.16, 14).translate(0, 0.42, 0), C("#f4f4f2")],
    [new CylinderGeometry(0.03, 0.075, 0.2, 14).translate(0, 0.6, 0), C("#ff5f12")]
  ]);
  instanced(coneGeo, new MeshBasicMaterial({ vertexColors: true, color: "#b4b4b4" }), cones, (d, s) => { d.position.set(s[0], 0, s[1]); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); });

  // 달리는 차: 가장 긴 대로를 따라 우측 통행
  const polyLen = (pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
  const lane = mainLines.length ? resample(mainLines.slice().sort((a, b) => polyLen(b) - polyLen(a))[0].flat(), 2) : null;
  const laneAt = (s) => {
    const d = lane.dist;
    let lo = 0, hi = d.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; d[m] <= s ? (lo = m) : (hi = m); }
    const [ax, az] = lane.pts[lo], [bx, bz] = lane.pts[hi];
    const L = Math.hypot(bx - ax, bz - az) || 1, t = (s - d[lo]) / ((d[hi] - d[lo]) || 1);
    return [ax + (bx - ax) * t, az + (bz - az) * t, (bx - ax) / L, (bz - az) / L];
  };
  const movers = [];
  if (lane && lane.length > 60) {
    const mix = ["sedan", "suv", "taxi", "sedan", "hatch", "truck", "suv", "sedan", "taxi", "bus"];
    for (let k = 0; k < (mobile ? 10 : 18); k++) {
      const type = mix[k % mix.length];
      const curb = type === "bus" || type === "truck";
      movers.push({ type, s: R(0, lane.length), off: curb ? 5.1 : [1.8, 5.1][k % 2], dir: k % 4 < 2 ? 1 : -1, v: type === "bus" ? R(7, 9) : R(8, 15), color: bodyColor(type, r()) });
    }
  }
  const moveFleet = movers.length ? createFleet(scene, movers.map((m) => ({ type: m.type, x: 0, z: 0, ang: 0, color: m.color })), patchFog) : null;
  const headPos = new Float32Array(movers.length * 6), tailPos = new Float32Array(movers.length * 6);
  const headGeo = new BufferGeometry(); headGeo.setAttribute("position", new Float32BufferAttribute(headPos, 3));
  const tailGeo = new BufferGeometry(); tailGeo.setAttribute("position", new Float32BufferAttribute(tailPos, 3));
  const glowTex = glowTexture();
  const headMat = new PointsMaterial({ map: glowTex, color: "#fff4dc", size: 2.2, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const tailMat = new PointsMaterial({ map: glowTex, color: "#ff3020", size: 1.6, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const headPts = new Points(headGeo, headMat), tailPts = new Points(tailGeo, tailMat);
  headPts.frustumCulled = tailPts.frustumCulled = false;
  scene.add(headPts, tailPts);

  // 가로등 · 보안등 빛
  const lampMat = new PointsMaterial({ map: glowTex, color: "#ffd59a", size: 7, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const lampG = new BufferGeometry(); lampG.setAttribute("position", new Float32BufferAttribute(lampGlow, 3));
  scene.add(new Points(lampG, lampMat));
  const secMat = new PointsMaterial({ map: glowTex, color: "#e8f0ff", size: 3.2, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const secG = new BufferGeometry(); secG.setAttribute("position", new Float32BufferAttribute(secLights.length ? secLights : [0, -10, 0], 3));
  scene.add(new Points(secG, secMat));
  const poolMat = new MeshBasicMaterial({ map: glowTexture("rgba(255,214,150,0.55)", "rgba(255,190,110,0.18)"), transparent: true, depthWrite: false, blending: AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  const poolGeo = new PlaneGeometry(1, 1); poolGeo.rotateX(-Math.PI / 2);
  instanced(poolGeo, poolMat, pools, (d, s) => { d.position.set(s[0], 0.05, s[1]); d.rotation.set(0, 0, 0); d.scale.set(s[2], 1, s[2]); });

  /* ---------- 버스정류장 · BIS · 엘리베이터 ---------- */
  // 각 시설은 자기 기준(로컬 -z 가 차도 쪽)으로 만들고 ang 만큼 돌려 놓음
  const place = (obj, poi, y = 0) => { const g = new Group(); g.add(obj); g.position.set(poi.x, y, poi.z); g.rotation.y = poi.ang || 0; scene.add(g); return g; };
  const stop = city.pois.stop;
  const stopG = new Group();
  stopG.add(new Mesh(mergeBoxes([
    [-5.6, 1.3, 0.55, 0.12, 2.6, 0.12], [5.6, 1.3, 0.55, 0.12, 2.6, 0.12], [-5.6, 1.3, -0.65, 0.12, 2.6, 0.12], [5.6, 1.3, -0.65, 0.12, 2.6, 0.12],
    [0, 2.65, 0, 11.6, 0.14, 1.7], [0, 0.45, 0.45, 8, 0.08, 0.45], [0, 0.22, 0.45, 8, 0.44, 0.08]
  ]), new MeshLambertMaterial({ color: "#2f3335" })));
  const glass = new Mesh(new PlaneGeometry(11.2, 2.2), new MeshLambertMaterial({ color: "#9fb4c0", transparent: true, opacity: 0.22, side: DoubleSide, depthWrite: false }));
  glass.position.set(0, 1.35, 0.6);
  stopG.add(glass);
  const adTex = adTexture(fontFamily, icon);
  const ad = new Mesh(new PlaneGeometry(1.3, 2.1), new MeshLambertMaterial({ map: adTex, emissiveMap: adTex, emissive: "#ffffff", emissiveIntensity: 1, side: DoubleSide }));
  ad.position.set(5.0, 1.3, 0.55);
  ad.rotation.y = Math.PI / 2;
  lit.push({ mat: ad.material, night: 1.1, dawn: 0.5 });
  stopG.add(ad);
  place(stopG, stop);

  const bisG = new Group();
  bisG.add(new Mesh(mergeBoxes([[0, 1.5, 0, 0.12, 3.0, 0.12], [0, 2.75, 0, 0.14, 0.86, 1.55]]), new MeshLambertMaterial({ color: "#2a2c2d" })));
  const bis = bisCanvas(fontFamily);
  const bisMat = new MeshBasicMaterial({ map: bis.texture, side: DoubleSide });
  const bisScreen = new Mesh(new PlaneGeometry(1.44, 0.72), bisMat);
  bisScreen.position.set(-0.075, 2.75, 0);
  bisScreen.rotation.y = -Math.PI / 2;
  const bisScreen2 = bisScreen.clone(); bisScreen2.position.x = 0.075; bisScreen2.rotation.y = Math.PI / 2;
  bisG.add(bisScreen, bisScreen2);
  place(bisG, city.pois.bis);
  out.setBis = (delayed) => bis.draw(delayed);

  const elG = new Group();
  elG.add(new Mesh(mergeBoxes([[-1.2, 1.6, -1.2, 0.12, 3.2, 0.12], [1.2, 1.6, -1.2, 0.12, 3.2, 0.12], [-1.2, 1.6, 1.2, 0.12, 3.2, 0.12], [1.2, 1.6, 1.2, 0.12, 3.2, 0.12], [0, 3.25, 0, 2.6, 0.18, 2.6]]),
    new MeshLambertMaterial({ color: "#3a3d40" })));
  const elGlass = new Mesh(new BoxGeometry(2.3, 3.0, 2.3), new MeshLambertMaterial({ color: "#bcd0d8", transparent: true, opacity: 0.25, depthWrite: false, emissive: "#f3f6ff", emissiveIntensity: 0.25 }));
  elGlass.position.set(0, 1.55, 0);
  elG.add(elGlass);
  const elSignTex = labelTexture("엘리베이터 · 지하철", "#1d4fa8", "#ffffff", fontFamily, 512, 96);
  const elSign = new Mesh(new PlaneGeometry(2.4, 0.45), new MeshLambertMaterial({ map: elSignTex, emissiveMap: elSignTex, emissive: "#ffffff", emissiveIntensity: 1, side: DoubleSide }));
  elSign.position.set(-1.32, 3.0, 0);
  elSign.rotation.y = -Math.PI / 2;
  lit.push({ mat: elSign.material, night: 1.1, dawn: 0.6 });
  elG.add(elSign);
  place(elG, city.pois.elevator);

  /* ---------- 바닥 AR 경로선 ---------- */
  const flow = flowTexture();
  function ribbon(flat, width, color, y = 0.07) {
    const rs = resample(flat, 0.8);
    const acc = new Acc();
    const n = rs.pts.length;
    for (let i = 0; i < n - 1; i++) {
      const [x1, z1] = rs.pts[i], [x2, z2] = rs.pts[i + 1];
      const L = Math.hypot(x2 - x1, z2 - z1) || 1;
      const nx = -(z2 - z1) / L, nz = (x2 - x1) / L, hw = width / 2;
      const u0 = rs.dist[i] / 3, u1 = rs.dist[i + 1] / 3;
      acc.quad([x1 - nx * hw, y, z1 - nz * hw], [x1 + nx * hw, y, z1 + nz * hw], [x2 + nx * hw, y, z2 + nz * hw], [x2 - nx * hw, y, z2 - nz * hw], [0, 1, 0],
        [[u0, 0], [u0, 1], [u1, 1], [u1, 0]]);
    }
    const t = flow.clone(); t.needsUpdate = true;
    const mat = new MeshBasicMaterial({ map: t, color, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    const mesh = new Mesh(acc.build(), mat);
    mesh.geometry.setDrawRange(0, 0);
    scene.add(mesh);
    return { mesh, mat, tex: t, segs: n - 1, length: rs.length, setProgress(f) { mesh.geometry.setDrawRange(0, Math.floor(Math.max(0, Math.min(1, f)) * (n - 1)) * 6); } };
  }
  const route = city.route;
  out.ribbons = {
    w1: ribbon(route.w1, 0.6, new Color("#e6b54a")),
    busA: ribbon(route.busA, 1.3, new Color("#e6b54a")),
    w2: ribbon(route.w2, 0.6, new Color("#fff0c4")),
    w3: ribbon(route.w3, 0.6, new Color("#e6b54a"))
  };

  /* ---------- 시간대별 갱신 ---------- */
  const carDummy = new Object3D();
  out.update = (time, dt, tod, walker) => {
    // tod: { night: 0~1 } — 밤일수록 창문·간판·가로등이 밝음
    // walker: 걷는 사람(카메라) 위치. 차로 위에 서 있으면 차가 그 앞에서 멈춤
    const n = tod.night;
    lit.forEach((L) => { L.mat.emissiveIntensity = L.dawn + (L.night - L.dawn) * n; });
    lampMat.opacity = Math.min(1, 0.05 + n * 1.1);
    secMat.opacity = Math.min(1, n * 1.1);
    poolMat.opacity = n * 0.9;
    headMat.opacity = 0.3 + n * 0.7;
    tailMat.opacity = 0.35 + n * 0.65;
    elGlass.material.emissiveIntensity = 0.1 + n * 0.5;
    const place = (m, s) => {
      const [cx, cz, dx, dz] = laneAt(s);
      const nx = -dz * m.dir, nz = dx * m.dir; // 진행 방향의 오른쪽
      return { nx, nz, fx: dx * m.dir, fz: dz * m.dir, x: cx + nx * m.off, z: cz + nz * m.off };
    };
    movers.forEach((m, i) => {
      const s = (m.s + m.dir * m.v * dt + lane.length) % lane.length;
      let P = place(m, s);
      if (walker) {
        // 차 앞쪽 8m 안, 같은 차로 폭 안에 사람이 있으면 그 자리에 섬
        const ax = walker.x - P.x, az = walker.z - P.z;
        const ahead = ax * P.fx + az * P.fz, beside = Math.abs(ax * P.nx + az * P.nz);
        if (ahead > 0 && ahead < moveFleet.half(i) + 8 && beside < 2.4) P = place(m, m.s);
        else m.s = s;
      } else m.s = s;
      const { nx, nz, fx, fz, x, z } = P;
      moveFleet.set(i, x, z, Math.atan2(fx, fz));
      const hf = moveFleet.half(i), hw = m.type === "bus" ? 0.95 : 0.62;
      headPos.set([x + fx * hf - nx * hw, 0.75, z + fz * hf - nz * hw, x + fx * hf + nx * hw, 0.75, z + fz * hf + nz * hw], i * 6);
      tailPos.set([x - fx * hf - nx * hw, 0.8, z - fz * hf - nz * hw, x - fx * hf + nx * hw, 0.8, z - fz * hf + nz * hw], i * 6);
    });
    if (moveFleet) { moveFleet.commit(); moveFleet.setNight(n); }
    if (parkedFleet) parkedFleet.setNight(n * 0.2);
    headGeo.attributes.position.needsUpdate = true;
    tailGeo.attributes.position.needsUpdate = true;
    Object.values(out.ribbons).forEach((rb) => { rb.tex.offset.x = -time * 0.5; });
  };

  // 모든 재질에 해를 향한 안개 번짐 적용
  scene.traverse((o) => { if (o.material && patchFog) patchFog(o.material); });
  return out;
}

/* 은행나무 수관: 잎 덩어리 여러 개를 울퉁불퉁하게 겹침 */
function canopyGeometry() {
  const r = rng(404);
  const blobs = [[0, 6.6, 0, 1.25], [0.55, 5.5, 0.35, 1.1], [-0.5, 5.7, -0.3, 1.05], [0.1, 4.6, 0.1, 0.95], [-0.25, 7.5, 0.15, 0.8]];
  const pos = [];
  blobs.forEach(([cx, cy, cz, s]) => {
    const g = new IcosahedronGeometry(s, 1);
    const p = g.attributes.position.array;
    const jitter = new Map();
    for (let i = 0; i < p.length; i += 3) {
      const key = `${p[i].toFixed(3)},${p[i + 1].toFixed(3)},${p[i + 2].toFixed(3)}`;
      if (!jitter.has(key)) jitter.set(key, 0.82 + r() * 0.36);
      const k = jitter.get(key);
      pos.push(cx + p[i] * k, cy + p[i + 1] * k * 1.15, cz + p[i + 2] * k);
    }
  });
  // 같은 위치의 꼭짓점끼리 법선을 평균내어 각진 면 대신 부드러운 잎 덩어리로
  const nrm = new Float32Array(pos.length);
  const acc = new Map();
  for (let i = 0; i < pos.length; i += 9) {
    const ax = pos[i], ay = pos[i + 1], az = pos[i + 2];
    const ux = pos[i + 3] - ax, uy = pos[i + 4] - ay, uz = pos[i + 5] - az;
    const vx = pos[i + 6] - ax, vy = pos[i + 7] - ay, vz = pos[i + 8] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (let k = 0; k < 9; k += 3) {
      const key = `${pos[i + k].toFixed(2)},${pos[i + k + 1].toFixed(2)},${pos[i + k + 2].toFixed(2)}`;
      const a = acc.get(key) || [0, 0, 0];
      a[0] += nx; a[1] += ny; a[2] += nz;
      acc.set(key, a);
    }
  }
  for (let i = 0; i < pos.length; i += 3) {
    const a = acc.get(`${pos[i].toFixed(2)},${pos[i + 1].toFixed(2)},${pos[i + 2].toFixed(2)}`);
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    nrm[i] = a[0] / l; nrm[i + 1] = a[1] / l; nrm[i + 2] = a[2] / l;
  }
  const geo = new BufferGeometry();
  geo.setAttribute("position", new Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  return geo;
}

/* 상자 여러 개를 한 지오메트리로: [cx, cy, cz, sx, sy, sz] */
function mergeBoxes(list) {
  const acc = new Acc();
  list.forEach(([cx, cy, cz, sx, sy, sz]) => {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    acc.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uv);
    acc.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uv);
    acc.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uv);
    acc.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uv);
    acc.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], uv);
    acc.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], uv);
  });
  const g = acc.build();
  g.deleteAttribute("color");
  return g;
}
