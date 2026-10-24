/**
 * DUX — 차량 (세단, SUV, 해치백, 택시, 1톤 트럭, 시내버스)
 * 옆면 실루엣을 폭만큼 뽑아내 차체를 만들고, 창·바퀴·등화·번호판을 부품으로 얹습니다.
 * 로컬 좌표: x = 폭, y = 위, z = 길이 (앞 = +z)
 */
import {
  BufferGeometry, Float32BufferAttribute, InstancedMesh, Object3D, Color,
  CylinderGeometry, MeshLambertMaterial, MeshBasicMaterial, ShapeUtils, Vector2
} from "../../vendor/three.min.js";

class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; }
  tri(a, b, c, n, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] < 0) [b, c] = [c, b];
    [a, b, c].forEach((q) => { this.p.push(...q); this.n.push(...n); this.c.push(col.r, col.g, col.b); });
  }
  quad(a, b, c, d, n, col) { this.tri(a, b, c, n, col); this.tri(a, c, d, n, col); }
  box(cx, cy, cz, sx, sy, sz, col) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], col);
    this.quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], col);
    this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], col);
  }
  // 옆면 실루엣 [[z, y], ...] 을 폭 w 만큼 뽑아냄
  extrude(profile, w, col) {
    let area = 0;
    for (let i = 0; i < profile.length; i++) { const [z1, y1] = profile[i], [z2, y2] = profile[(i + 1) % profile.length]; area += z1 * y2 - z2 * y1; }
    const ccw = area > 0;
    const h = w / 2;
    const tris = ShapeUtils.triangulateShape(profile.map(([z, y]) => new Vector2(z, y)), []);
    tris.forEach(([a, b, c]) => {
      const P = (i, x) => [x, profile[i][1], profile[i][0]];
      this.tri(P(a, h), P(b, h), P(c, h), [1, 0, 0], col);
      this.tri(P(a, -h), P(b, -h), P(c, -h), [-1, 0, 0], col);
    });
    for (let i = 0; i < profile.length; i++) {
      const [z1, y1] = profile[i], [z2, y2] = profile[(i + 1) % profile.length];
      const dz = z2 - z1, dy = y2 - y1, L = Math.hypot(dz, dy) || 1;
      let ny = -dz / L, nz = dy / L;
      if (!ccw) { ny = -ny; nz = -nz; }
      this.quad([-h, y1, z1], [h, y1, z1], [h, y2, z2], [-h, y2, z2], [0, ny, nz], col);
    }
  }
  build() {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.n, 3));
    g.setAttribute("color", new Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const WHITE = new Color(1, 1, 1);
const C = (hex) => new Color(hex);

function wheels(geoAcc, list, r, w) {
  // 타이어 + 휠 캡을 원통으로
  list.forEach(([x, z]) => {
    const side = Math.sign(x);
    const tire = new CylinderGeometry(r, r, w, 14);
    tire.rotateZ(Math.PI / 2);
    tire.translate(x, r, z);
    const hub = new CylinderGeometry(r * 0.62, r * 0.62, 0.02, 10);
    hub.rotateZ(Math.PI / 2);
    hub.translate(x + side * (w / 2 + 0.005), r, z);
    [[tire, C("#151515")], [hub, C("#9a9da1")]].forEach(([g, col]) => {
      const gi = g.toNonIndexed();
      const p = gi.attributes.position.array, n = gi.attributes.normal.array;
      for (let i = 0; i < p.length; i += 3) { geoAcc.p.push(p[i], p[i + 1], p[i + 2]); geoAcc.n.push(n[i], n[i + 1], n[i + 2]); geoAcc.c.push(col.r, col.g, col.b); }
    });
  });
}

function lights(acc, L, front, rear, y, wx, extra) {
  const head = C("#fff6e0"), tail = C("#e0261b");
  [-1, 1].forEach((s) => {
    acc.box(s * wx, y, front, 0.4, 0.1, 0.05, head);
    acc.box(s * (wx + 0.03), y + 0.03, rear, 0.36, 0.11, 0.05, tail);
  });
  if (extra) extra(acc);
}

function trim(acc, front, rear, y, w) {
  const dark = C("#1b1c1e"), plate = C("#e8e8e2");
  acc.box(0, y - 0.16, front + 0.01, w * 0.5, 0.16, 0.04, dark);   // 그릴
  acc.box(0, y - 0.2, front + 0.03, 0.52, 0.12, 0.02, plate);       // 번호판
  acc.box(0, y - 0.2, rear - 0.03, 0.52, 0.12, 0.02, plate);
  acc.box(0, 0.36, front - 0.05, w * 0.98, 0.12, 0.1, dark);         // 범퍼 하단
  acc.box(0, 0.36, rear + 0.05, w * 0.98, 0.12, 0.1, dark);
}

const TYPES = {
  sedan: () => {
    const body = new Geo(), glass = new Geo(), lit = new Geo(), wh = new Geo(), tr = new Geo();
    body.extrude([[-2.3, 0.3], [2.3, 0.3], [2.36, 0.5], [2.32, 0.74], [2.1, 0.86], [0.95, 0.95], [-1.55, 0.96], [-2.2, 0.92], [-2.34, 0.72], [-2.36, 0.5]], 1.8, WHITE);
    body.extrude([[0.3, 1.35], [-0.92, 1.37], [-0.94, 1.42], [0.26, 1.4]], 1.5, WHITE);
    [-1, 1].forEach((s) => body.box(s * 0.98, 1.0, 0.82, 0.14, 0.1, 0.22, WHITE));
    glass.extrude([[0.95, 0.94], [0.3, 1.36], [-0.94, 1.38], [-1.56, 0.95]], 1.56, C("#ffffff"));
    lights(lit, 4.6, 2.33, -2.34, 0.73, 0.62);
    trim(tr, 2.34, -2.35, 0.74, 1.8);
    wheels(wh, [[0.8, 1.38], [-0.8, 1.38], [0.8, -1.38], [-0.8, -1.38]], 0.32, 0.22);
    return { body, glass, lit, wh, tr, half: 2.35 };
  },
  suv: () => {
    const body = new Geo(), glass = new Geo(), lit = new Geo(), wh = new Geo(), tr = new Geo();
    body.extrude([[-2.35, 0.42], [2.35, 0.42], [2.4, 0.62], [2.37, 0.92], [2.15, 1.06], [1.05, 1.12], [-2.25, 1.13], [-2.38, 0.95], [-2.4, 0.62]], 1.9, WHITE);
    body.extrude([[0.45, 1.64], [-2.06, 1.66], [-2.08, 1.72], [0.4, 1.7]], 1.64, WHITE);
    [-1, 1].forEach((s) => { body.box(s * 1.03, 1.18, 0.9, 0.14, 0.12, 0.24, WHITE); body.box(s * 0.72, 1.76, -0.8, 0.05, 0.05, 2.2, C("#333333")); });
    glass.extrude([[1.05, 1.11], [0.42, 1.65], [-2.07, 1.67], [-2.26, 1.12]], 1.7, C("#ffffff"));
    lights(lit, 4.7, 2.38, -2.39, 0.9, 0.66);
    trim(tr, 2.39, -2.4, 0.92, 1.9);
    wheels(wh, [[0.85, 1.45], [-0.85, 1.45], [0.85, -1.45], [-0.85, -1.45]], 0.37, 0.25);
    return { body, glass, lit, wh, tr, half: 2.4 };
  },
  hatch: () => {
    const body = new Geo(), glass = new Geo(), lit = new Geo(), wh = new Geo(), tr = new Geo();
    body.extrude([[-1.95, 0.3], [1.95, 0.3], [2.0, 0.5], [1.96, 0.72], [1.75, 0.84], [0.8, 0.93], [-1.85, 0.96], [-1.98, 0.75], [-2.0, 0.5]], 1.72, WHITE);
    body.extrude([[0.18, 1.36], [-1.58, 1.4], [-1.6, 1.45], [0.14, 1.41]], 1.44, WHITE);
    [-1, 1].forEach((s) => body.box(s * 0.94, 0.98, 0.68, 0.13, 0.1, 0.2, WHITE));
    glass.extrude([[0.8, 0.92], [0.16, 1.37], [-1.6, 1.41], [-1.86, 0.95]], 1.5, C("#ffffff"));
    lights(lit, 3.9, 1.97, -1.99, 0.72, 0.58);
    trim(tr, 1.98, -2.0, 0.72, 1.72);
    wheels(wh, [[0.76, 1.25], [-0.76, 1.25], [0.76, -1.25], [-0.76, -1.25]], 0.3, 0.2);
    return { body, glass, lit, wh, tr, half: 2.0 };
  },
  taxi: () => {
    const t = TYPES.sedan();
    t.lit.box(0, 1.53, -0.3, 0.6, 0.18, 0.26, C("#fff1c8")); // 지붕 표시등
    return t;
  },
  truck: () => {
    const body = new Geo(), glass = new Geo(), lit = new Geo(), wh = new Geo(), tr = new Geo();
    body.extrude([[0.85, 0.42], [2.45, 0.42], [2.5, 0.62], [2.47, 1.1], [0.85, 1.1]], 1.74, WHITE);
    body.extrude([[2.3, 1.88], [0.85, 1.9], [0.85, 1.98], [2.28, 1.96]], 1.74, WHITE);
    glass.extrude([[2.47, 1.1], [2.3, 1.89], [0.86, 1.91], [0.86, 1.1]], 1.7, C("#ffffff"));
    const deck = C("#55585b"), rail = C("#a7abaf");
    tr.box(0, 0.78, -0.85, 1.76, 0.12, 3.4, deck);                           // 적재함 바닥
    [-1, 1].forEach((s) => tr.box(s * 0.86, 1.06, -0.85, 0.05, 0.44, 3.4, rail)); // 옆 문짝
    tr.box(0, 1.06, -2.53, 1.76, 0.44, 0.05, rail);
    tr.box(0, 1.25, 0.8, 1.76, 0.82, 0.06, deck);
    tr.box(0, 0.5, -0.85, 1.4, 0.2, 3.2, C("#1b1c1e"));                     // 차대
    trim(tr, 2.48, -2.56, 0.78, 1.74);
    lights(lit, 5.0, 2.47, -2.57, 0.8, 0.64);
    wheels(wh, [[0.8, 1.75], [-0.8, 1.75], [0.78, -1.55], [-0.78, -1.55]], 0.3, 0.2);
    return { body, glass, lit, wh, tr, half: 2.55 };
  },
  bus: () => {
    const body = new Geo(), glass = new Geo(), lit = new Geo(), wh = new Geo(), tr = new Geo();
    body.extrude([[-5.5, 0.32], [5.5, 0.32], [5.56, 0.6], [5.52, 2.95], [5.32, 3.2], [-5.4, 3.2], [-5.52, 3.0], [-5.56, 0.6]], 2.5, WHITE);
    glass.extrude([[5.53, 1.15], [5.38, 2.9], [-5.2, 2.9], [-5.2, 1.32], [4.2, 1.32], [4.2, 1.15]], 2.53, C("#ffffff"));
    tr.box(0, 3.24, 0, 2.2, 0.1, 8, C("#d7d9db"));
    tr.box(0, 2.6, 5.58, 1.6, 0.26, 0.04, C("#111111"));
    lights(lit, 11, 5.56, -5.57, 0.9, 0.95, (a) => a.box(0, 2.6, 5.6, 1.4, 0.18, 0.02, C("#ff9d2a"))); // 행선지 표시
    trim(tr, 5.57, -5.58, 0.9, 2.5);
    wheels(wh, [[1.12, 3.6], [-1.12, 3.6], [1.12, -3.0], [-1.12, -3.0]], 0.5, 0.3);
    return { body, glass, lit, wh, tr, half: 5.6 };
  }
};

/* 차종별 부품 지오메트리 (한 번만 만듦) */
const cache = {};
function kit(type) {
  if (!cache[type]) {
    const t = TYPES[type]();
    cache[type] = { body: t.body.build(), glass: t.glass.build(), lit: t.lit.build(), wh: t.wh.build(), tr: t.tr.build(), half: t.half };
  }
  return cache[type];
}

export const BODY_COLORS = ["#ecece9", "#ecece9", "#ecece9", "#16171a", "#16171a", "#a9adb1", "#6a6e73", "#2a3550", "#6e1c22", "#d9d4c6"];
export function bodyColor(type, r) {
  if (type === "taxi") return "#d9772b";
  if (type === "truck") return r < 0.6 ? "#2c5fa8" : "#e6e6e3";
  if (type === "bus") return r < 0.5 ? "#2f6fd0" : "#3e9d5a";
  return BODY_COLORS[Math.floor(r * BODY_COLORS.length)];
}

/**
 * 차량 묶음을 장면에 추가
 * items: [{ type, x, z, ang, color }]   반환: { set(i, x, z, ang), commit(), setNight(n), meshes }
 */
export function createFleet(scene, items, patchFog) {
  const mats = {
    body: new MeshLambertMaterial({ color: "#ffffff" }),
    glass: new MeshLambertMaterial({ color: "#20262c", emissive: "#000000" }),
    busGlass: new MeshLambertMaterial({ color: "#22262a", emissive: "#ffe0ae", emissiveIntensity: 0.5 }),
    lit: new MeshBasicMaterial({ vertexColors: true }),
    wh: new MeshLambertMaterial({ vertexColors: true }),
    tr: new MeshLambertMaterial({ vertexColors: true })
  };
  const groups = {};
  items.forEach((it, i) => { (groups[it.type] = groups[it.type] || []).push(i); });
  const dummy = new Object3D();
  const slots = new Array(items.length);
  const meshes = [];
  Object.entries(groups).forEach(([type, idxs]) => {
    const k = kit(type);
    const parts = ["body", "glass", "lit", "wh", "tr"].map((part) => {
      const mat = part === "glass" && type === "bus" ? mats.busGlass : mats[part];
      const m = new InstancedMesh(k[part], mat, idxs.length);
      scene.add(m);
      meshes.push(m);
      return m;
    });
    idxs.forEach((itemIdx, j) => {
      slots[itemIdx] = { parts, j, half: k.half };
      parts[0].setColorAt(j, new Color(items[itemIdx].color));
    });
  });
  const set = (i, x, z, ang) => {
    const s = slots[i];
    dummy.position.set(x, 0, z);
    dummy.rotation.set(0, ang, 0);
    dummy.updateMatrix();
    s.parts.forEach((m) => m.setMatrixAt(s.j, dummy.matrix));
  };
  items.forEach((it, i) => set(i, it.x, it.z, it.ang));
  const commit = () => meshes.forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  commit();
  if (patchFog) Object.values(mats).forEach(patchFog);
  return {
    set, commit, meshes,
    half: (i) => slots[i].half,
    setNight(n) {
      mats.lit.color.setScalar(0.55 + 0.45 * n);
      mats.busGlass.emissiveIntensity = 0.15 + 0.6 * n;
    }
  };
}
