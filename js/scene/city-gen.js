/**
 * DUX — 서울 주거지 거리 배치 생성기
 *
 * 출력 형식은 tools/osm_to_city.py 가 OpenStreetMap 데이터로 만드는 data/city.json 과 같습니다.
 *   roads:     { k: "main" | "sec" | "alley", w: 차도 폭, sw: 보도 폭, pts: [x, z, x, z, ...] }
 *   buildings: { pts: [x, z, ...], h, floors, k: "res" | "com" | "apt" | "civic", front?: 변 번호, shop?: bool, sign? }
 *   parks:     { pts: [...] }
 *   route:     걷는 경로와 장소 (home, w1, stop, busA·sub2·wEnd(처음 추천), w2, elevator, subAlt·busAlt(대안), w3, dest)
 * 좌표: x = 동쪽(m), z = 남쪽(m), 대로 중심선이 z = 0
 */

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function generateCity() {
  const r = rng(20261024);
  const R = (a, b) => a + (b - a) * r();
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const city = { source: "procedural", roads: [], buildings: [], parks: [], lots: [], pois: {}, route: null };

  const X0 = -560, X1 = 820;          // 동네 범위 (대로는 x = 820 에서 T자로 끝남)
  const MAIN_W = 20, MAIN_SW = 4;      // 왕복 4차선 + 보도
  const EDGE = MAIN_W / 2 + MAIN_SW;   // 대로 보도 바깥선 (14m)

  city.roads.push({ k: "main", w: MAIN_W, sw: MAIN_SW, pts: [X0 - 260, 0, X1, 0] });
  // 이면도로 (2차선)
  const secs = [
    { x: -150, side: -1, len: 560 },
    { x: 320, side: 1, len: 540 },
    { x: 560, side: -1, len: 480 },
    { x: X1 + 6, side: 0, len: 0 } // 대로 끝 교차 도로
  ];
  secs.forEach((s) => {
    if (s.side === 0) city.roads.push({ k: "sec", w: 10, sw: 3, pts: [s.x, -420, s.x, 420] });
    else city.roads.push({ k: "sec", w: 9, sw: 2.5, pts: [s.x, s.side * (MAIN_W / 2), s.x, s.side * (MAIN_W / 2 + s.len)] });
  });

  /* ---------- 골목 (동서 방향, 약간 비스듬) ---------- */
  const mkLine = (z0) => ({ z0: z0 + R(-3, 3), slope: R(-0.014, 0.014), w: R(4.2, 6) });
  const zAt = (L, x) => L.z0 + L.slope * (x - 100);
  const northLines = [-64, -116, -170, -226, -280, -336, -392, -450, -508].map(mkLine);
  const southLines = [64, 118, 172, 228, 286, 342, 398, 456].map(mkLine);
  northLines[1].slope = 0.004; // 집 앞 골목은 거의 곧게
  northLines[1].w = 6.4;       // 길가에 차를 세워도 가운데로 걸어갈 수 있는 폭
  northLines.forEach((L) => city.roads.push({ k: "alley", w: L.w, sw: 0, pts: [X0, zAt(L, X0), X1 - 2, zAt(L, X1 - 2)] }));
  southLines.forEach((L) => city.roads.push({ k: "alley", w: L.w, sw: 0, pts: [X0, zAt(L, X0), 314, zAt(L, 314)] }));

  /* ---------- 블록 → 필지 → 건물 ---------- */
  function boundaries(xa, xb, secXs, spacing) {
    const out = [{ x: xa, hw: 0 }];
    let x = xa + R(spacing[0], spacing[1]) * 0.6;
    while (x < xb - 18) {
      const nearSec = secXs.find((s) => Math.abs(s - x) < 24);
      if (nearSec === undefined) out.push({ x, hw: R(1.8, 2.5), alley: true });
      x += R(spacing[0], spacing[1]);
    }
    secXs.forEach((s) => { if (s > xa && s < xb) out.push({ x: s, hw: 4.5 + 2.5 }); });
    out.push({ x: xb, hw: 0 });
    return out.sort((a, b) => a.x - b.x);
  }

  function addBuilding(quad, opts) {
    city.buildings.push(Object.assign({ pts: quad.flat() }, opts));
  }

  // 필지 한 줄: front 쪽 선(fz)과 back 쪽 선(bz)을 x 에 대한 함수로 받음
  function parcelRow(xa, xb, fz, bz, kind, frontDir) {
    let x = xa;
    while (x < xb - 6) {
      let w = kind === "com" ? R(12, 22) : R(9, 15);
      if (xb - (x + w) < 7) w = xb - x;
      const x0 = x, x1 = x + w;
      x = x1;
      if (r() < 0.05 && kind === "res") { city.lots.push({ pts: [x0, fz(x0), x1, fz(x1), x1, bz(x1), x0, bz(x0)] }); continue; }
      const gap = R(0.5, 1.1);
      const set = kind === "com" ? R(0.2, 0.6) : R(0.4, 2.2);
      const back = 0.7;
      const ax = x0 + gap, bx = x1 - gap;
      const fzA = fz(ax) + frontDir * -set, fzB = fz(bx) + frontDir * -set; // frontDir: 앞이 +z 쪽이면 1
      const bzA = bz(ax) + frontDir * back, bzB = bz(bx) + frontDir * back;
      const quad = [[ax, fzA], [bx, fzB], [bx, bzB], [ax, bzA]];
      if (kind === "com") {
        const floors = pick([4, 4, 5, 5, 6, 6, 7, 8, 9, 10]);
        addBuilding(quad, { k: "com", floors, h: 4.2 + (floors - 1) * 3.4 + 0.8, front: 0, shop: true });
      } else {
        const floors = pick([3, 4, 4, 4, 5, 5, 5, 6]);
        const shop = r() < 0.14;
        addBuilding(quad, { k: "res", floors, h: floors * 2.9 + 0.7, front: 0, shop });
      }
    }
  }

  function residentialRows(lines, side, xa, xb, secXs, frontageLine) {
    // side: -1 북쪽, +1 남쪽.  frontageLine 은 대로 쪽 첫 줄(상가) 경계
    const all = [frontageLine, ...lines];
    for (let i = 0; i < all.length - 1; i++) {
      const A = all[i], B = all[i + 1];             // A 가 대로 쪽
      const spacing = i === 0 ? [70, 120] : [36, 62];
      const bs = boundaries(xa, xb, secXs, spacing);
      for (let j = 0; j < bs.length - 1; j++) {
        const L = bs[j], Rb = bs[j + 1];
        const bx0 = L.x + L.hw, bx1 = Rb.x - Rb.hw;
        if (bx1 - bx0 < 14) continue;
        const inA = (x) => (A.isEdge ? A.z : zAt(A, x)) + side * (A.isEdge ? 0 : A.w / 2);
        const inB = (x) => zAt(B, x) - side * (B.w / 2);
        // 세로 골목 (대로 쪽 줄은 대로까지 이어짐)
        if (L.alley) {
          const zA = i === 0 ? side * (MAIN_W / 2) : zAt(A, L.x);
          city.roads.push({ k: "alley", w: L.hw * 2, sw: 0, pts: [L.x, zA, L.x, zAt(B, L.x)] });
        }
        if (park && i === park.row && j === park.col && side === -1) {
          city.parks.push({ pts: [bx0, inA(bx0), bx1, inA(bx1), bx1, inB(bx1), bx0, inB(bx0)] });
          continue;
        }
        if (i === 0) {
          // 대로변 상가 + 뒤쪽 주택
          const depth = 24;
          const mid = (x) => inA(x) + side * depth;
          parcelRow(bx0, bx1, inA, mid, "com", -side);
          parcelRow(bx0, bx1, inB, mid, "res", side);
        } else {
          const mid = (x) => (inA(x) + inB(x)) / 2;
          parcelRow(bx0, bx1, inA, mid, "res", -side);
          parcelRow(bx0, bx1, inB, mid, "res", side);
        }
      }
    }
  }
  const park = { row: 3, col: 6 };
  residentialRows(northLines, -1, X0, X1 - 8, [-150, 560], { isEdge: true, z: -EDGE, w: 0 });
  residentialRows(southLines, 1, X0, 314, [], { isEdge: true, z: EDGE, w: 0 });

  /* ---------- 남동쪽: 대로변 상가 + 아파트 단지 ---------- */
  {
    const fz = () => EDGE, bz = () => EDGE + 24;
    parcelRow(326, X1 - 8, fz, bz, "com", -1);
    for (let row = 0; row < 7; row++) {
      const z = 66 + row * 62;
      for (let x = 352; x < X1 - 40; x += R(78, 92)) {
        const floors = Math.floor(R(15, 26));
        const len = R(48, 60), dep = 13;
        addBuilding([[x, z], [x + len, z], [x + len, z + dep], [x, z + dep]], { k: "apt", floors, h: floors * 2.8 + 2 });
      }
    }
  }

  /* ---------- 대로 끝: T자 교차로 너머 건물 (해가 반쯤 걸리는 실루엣) ---------- */
  addBuilding([[X1 + 16, -46], [X1 + 16, 52], [X1 + 64, 52], [X1 + 64, -46]], { k: "com", floors: 6, h: 4.2 + 5 * 3.4 + 0.8, front: 0, shop: true });
  addBuilding([[X1 + 16, -130], [X1 + 16, -56], [X1 + 60, -56], [X1 + 60, -130]], { k: "com", floors: 9, h: 4.2 + 8 * 3.4 + 0.8, front: 0, shop: true });
  addBuilding([[X1 + 16, 62], [X1 + 16, 140], [X1 + 58, 140], [X1 + 58, 62]], { k: "com", floors: 8, h: 4.2 + 7 * 3.4 + 0.8, front: 0, shop: true });
  for (let k = 0; k < 6; k++) { // 멀리 보이는 고층
    const x = X1 + 120 + k * 70, z = R(-160, 160), s = R(22, 30), floors = Math.floor(R(20, 32));
    addBuilding([[x, z], [x + s, z], [x + s, z + s], [x, z + s]], { k: "apt", floors, h: floors * 2.8 });
  }

  /* ---------- 걷는 경로 ---------- */
  const home = northLines[1];
  const hx = -262;
  const SW_N = -12.6, SW_S = 12.9;
  const xw = -150 - 4.5 - 1.25;   // 이면도로 서쪽 보도 중심
  const xc = -161;                 // 대로 횡단보도
  const route = {
    home: [hx, zAt(home, hx)],
    w1: [hx, zAt(home, hx), xw, zAt(home, xw), xw, SW_N, xc, SW_N, xc, SW_S, -79, SW_S],
    stop: [-64, 11.2],
    // 처음 추천: 도보 → 402번 버스 → 2호선 환승 → 도보
    busA: [-62, 7.4, 120, 7.4, 300, 7.4],
    sub2: [300, 4, 556, 4],
    wEnd: [556, 12.9, 596, 12.6],
    w2: [-79, SW_S, -66, 13.3, 36, 13.3],
    elevator: [44, 12.2],
    subAlt: [44, 12.2, 58, 4, 300, 4],          // 대안: 지하철 2정거장 (휴대폰 지도 표시용)
    busAlt: [300, 7.4, 428, 7.4, 432, 13],      // 대안: 400번 버스
    w3: [432, 13.0, 584, 13.0, 596, 12.6],      // 도서관 앞 횡단보도 옆 보도에서 끝 (차도로 내려서지 않음)
    dest: [612, 14]
  };
  city.route = route;
  city.pois = {
    crosswalks: [
      { x: xc, z0: -MAIN_W / 2, z1: MAIN_W / 2, axis: "z" },           // 대로 횡단
      { x: 320 - 9, z0: -MAIN_W / 2, z1: MAIN_W / 2, axis: "z" },
      { z: SW_N, x0: -154.5, x1: -145.5, axis: "x" },                   // 이면도로 입구
      { x: 560 + 9, z0: -MAIN_W / 2, z1: MAIN_W / 2, axis: "z" },
      { x: 596, z0: -MAIN_W / 2, z1: MAIN_W / 2, axis: "z" }                // 도착 지점 앞
    ],
    stop: { x: -64, z: 11.2 },
    bis: { x: -72.5, z: 10.7 },
    elevator: { x: 44, z: 12.2 },
    library: { x: 612, z: 14 }
  };

  // 도서관: 도착지 앞 건물 표시
  let lib = null, best = Infinity;
  city.buildings.forEach((b) => {
    if (b.k !== "com") return;
    const cx = (b.pts[0] + b.pts[2]) / 2, cz = (b.pts[1] + b.pts[3]) / 2;
    const d = Math.hypot(cx - 616, cz - 18);
    if (cz > 0 && d < best) { best = d; lib = b; }
  });
  if (lib) { lib.k = "civic"; lib.floors = 5; lib.h = 4.2 + 4 * 3.4 + 0.8; lib.sign = "library"; }

  // 경로 위에 놓인 건물 제거 (보도·골목을 막지 않도록)
  const blocked = (b) => {
    const xs = [], zs = [];
    for (let i = 0; i < b.pts.length; i += 2) { xs.push(b.pts[i]); zs.push(b.pts[i + 1]); }
    const minx = Math.min(...xs) - 0.5, maxx = Math.max(...xs) + 0.5, minz = Math.min(...zs) - 0.5, maxz = Math.max(...zs) + 0.5;
    const hit = (pts) => {
      for (let i = 0; i < pts.length - 2; i += 2) {
        for (let t = 0; t <= 1; t += 0.05) {
          const x = pts[i] + (pts[i + 2] - pts[i]) * t, z = pts[i + 1] + (pts[i + 3] - pts[i + 1]) * t;
          if (x > minx && x < maxx && z > minz && z < maxz) return true;
        }
      }
      return false;
    };
    return hit(route.w1) || hit(route.w2) || hit(route.w3);
  };
  city.buildings = city.buildings.filter((b) => !blocked(b));
  return city;
}
