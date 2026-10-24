/**
 * DUX — 캔버스로 그리는 거리 텍스처
 * 외벽 아틀라스(8칸 × 8층), 1층 상가, 한글 간판, 노면, 버스정보안내기(BIS) 화면, 빛 번짐
 */
import { CanvasTexture, SRGBColorSpace, RepeatWrapping } from "../../vendor/three.min.js";

export const ATLAS = 8; // 외벽 아틀라스 한 변의 칸 수 (가로 = 창 칸, 세로 = 층)

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, repeat = true) {
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function noise(g, w, h, amount, r) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/* ---------- 외벽: 주거(다세대), 상업, 아파트 ---------- */
export function facadeTextures(kind, seed) {
  const S = 128;
  const N = ATLAS;
  const r = rng(seed);
  const [cd, d] = canvas(S * N, S * N);
  const [ce, e] = canvas(S * N, S * N);
  e.fillStyle = "#000";
  e.fillRect(0, 0, S * N, S * N);

  // 바탕 (밝은 회색 계열, 건물마다 정점 색으로 물들임)
  d.fillStyle = kind === "com" ? "#b9bcbd" : kind === "apt" ? "#e2e0da" : "#d9d2c6";
  d.fillRect(0, 0, S * N, S * N);
  // 주거 외벽의 칸별 창 배치 (3D 창턱·발코니를 같은 자리에 붙이려고 내보냄)
  //  layout[층][칸] = { w: 0 창 없음 | 1 창 하나 | 2 창 둘, balc: 발코니 난간 }
  const layout = Array.from({ length: N }, () => Array.from({ length: N }, () => ({ w: 0, balc: false })));

  for (let fy = 0; fy < N; fy++) {
    for (let bx = 0; bx < N; bx++) {
      const x = bx * S, y = (N - 1 - fy) * S; // 아래층이 v=0
      if (kind === "res") {
        // 타일/벽돌 줄눈
        d.strokeStyle = "rgba(60,50,40,0.18)";
        d.lineWidth = 1;
        for (let k = 6; k < S; k += 9) { d.beginPath(); d.moveTo(x, y + k); d.lineTo(x + S, y + k); d.stroke(); }
        const roll = r();
        if (roll < 0.12) continue; // 창 없는 벽
        const twin = roll > 0.72;
        layout[fy][bx].w = twin ? 2 : 1;
        const ww = twin ? 34 : 62, wh = 52, wy = y + 30;
        const xs = twin ? [x + 20, x + 74] : [x + 33];
        xs.forEach((wx) => {
          d.fillStyle = "#e9e7e2"; d.fillRect(wx - 4, wy - 4, ww + 8, wh + 8); // 창틀
          const gl = d.createLinearGradient(wx, wy, wx + ww, wy + wh);
          gl.addColorStop(0, "#3d4650"); gl.addColorStop(1, "#1f252c");
          d.fillStyle = gl; d.fillRect(wx, wy, ww, wh);
          d.fillStyle = "#e9e7e2"; d.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); // 미닫이 창살
          if (r() < 0.3) { // 방범창
            d.strokeStyle = "rgba(40,40,40,0.8)"; d.lineWidth = 2;
            for (let k = wx + 6; k < wx + ww; k += 8) { d.beginPath(); d.moveTo(k, wy); d.lineTo(k, wy + wh); d.stroke(); }
          }
          if (r() < 0.2) { // 불 켜진 창 (새벽이라 드문드문)
            const warm = r() < 0.75;
            const grd = e.createLinearGradient(wx, wy, wx, wy + wh);
            grd.addColorStop(0, warm ? `hsl(${30 + r() * 10},70%,${44 + r() * 10}%)` : `hsl(210,30%,${58 + r() * 8}%)`);
            grd.addColorStop(1, warm ? `hsl(${28 + r() * 8},60%,${24 + r() * 8}%)` : `hsl(215,25%,${34 + r() * 8}%)`);
            e.fillStyle = grd;
            e.fillRect(wx, wy, ww, wh);
            if (r() < 0.6) { e.fillStyle = "rgba(0,0,0,0.6)"; e.fillRect(wx + (r() < 0.5 ? 0 : ww * 0.5), wy, ww * (0.3 + r() * 0.2), wh); } // 커튼
            e.fillStyle = "rgba(0,0,0,0.5)"; e.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); // 창살 그림자
          }
        });
        if (r() < 0.22) { // 발코니 난간
          layout[fy][bx].balc = true;
          d.fillStyle = "rgba(230,230,228,0.95)";
          d.fillRect(x + 8, y + 88, S - 16, 6);
          d.fillStyle = "rgba(230,230,228,0.75)";
          for (let k = x + 12; k < x + S - 8; k += 7) d.fillRect(k, y + 94, 2, 22);
        }
      } else if (kind === "com") {
        // 커튼월 유리 + 멀리언
        const gl = d.createLinearGradient(x, y, x + S, y + S);
        gl.addColorStop(0, "#4b5c66"); gl.addColorStop(1, "#27333b");
        d.fillStyle = gl; d.fillRect(x + 4, y + 16, S - 8, S - 32);
        d.fillStyle = "#9aa0a3";
        d.fillRect(x, y, S, 16); d.fillRect(x, y + S - 16, S, 16); d.fillRect(x + S / 2 - 2, y + 16, 4, S - 32);
        if (r() < 0.22) {
          e.fillStyle = `hsl(${40 + r() * 160},25%,${66 + r() * 14}%)`;
          e.fillRect(x + 4, y + 16, S - 8, S - 32);
        }
      } else {
        // 아파트: 발코니 띠 + 확장 창
        d.fillStyle = "#f1efe9"; d.fillRect(x, y + S - 34, S, 34);
        d.fillStyle = "#c9c6bf"; d.fillRect(x, y + S - 36, S, 3);
        const gl = d.createLinearGradient(x, y, x, y + S);
        gl.addColorStop(0, "#56636e"); gl.addColorStop(1, "#2a333b");
        d.fillStyle = gl; d.fillRect(x + 8, y + 18, S - 16, S - 58);
        d.fillStyle = "#f1efe9"; d.fillRect(x + S / 2 - 2, y + 18, 4, S - 58);
        if (r() < 0.32) {
          e.fillStyle = `hsl(${30 + r() * 15},85%,${60 + r() * 15}%)`;
          e.fillRect(x + 8, y + 18, S - 16, S - 58);
        }
      }
    }
  }
  noise(d, S * N, S * N, 16, r);
  return { map: tex(cd), emissive: tex(ce), layout };
}

/* ---------- 빌라 이름판 (4 × 2 아틀라스): 돌판에 금색 글자 / 스테인리스에 검은 글자 ---------- */
export const VILLA_NAMES = ["행복빌라", "청솔하우스", "그린빌", "해오름빌라", "다온하우스", "미소빌", "한빛빌라", "새솔맨션"];
export function villaPlateTexture(fontFamily) {
  const W = 256, H = 64;
  const [c, g] = canvas(W * 4, H * 2);
  VILLA_NAMES.forEach((name, i) => {
    const x = (i % 4) * W, y = Math.floor(i / 4) * H;
    const stone = i % 2 === 0;
    const grd = g.createLinearGradient(x, y, x, y + H);
    if (stone) { grd.addColorStop(0, "#3a3733"); grd.addColorStop(1, "#24221f"); }
    else { grd.addColorStop(0, "#d9dcdf"); grd.addColorStop(0.5, "#b7bbbf"); grd.addColorStop(1, "#cfd2d5"); }
    g.fillStyle = grd; g.fillRect(x, y, W, H);
    g.strokeStyle = stone ? "rgba(217,181,106,0.7)" : "rgba(60,60,60,0.5)"; g.lineWidth = 3;
    g.strokeRect(x + 5, y + 5, W - 10, H - 10);
    g.fillStyle = stone ? "#d9b56a" : "#26282a";
    g.font = `800 34px ${fontFamily}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(name, x + W / 2, y + H / 2 + 2, W - 30);
  });
  const t = tex(c, false);
  // i 번째 이름의 uv 사각형 [u0, v0, u1, v1]
  const cell = (i) => {
    const cx = i % 4, cy = Math.floor(i / 4);
    return [cx / 4 + 0.003, 1 - (cy + 1) / 2 + 0.006, (cx + 1) / 4 - 0.003, 1 - cy / 2 - 0.006];
  };
  return { texture: t, count: VILLA_NAMES.length, cell };
}

/* ---------- 1층 가게 (밤 9시) ----------
 * 진열창 너머로 보이는 가게 안을 원근감 있게 그림. 문 연 가게는 같은 그림을 발광 맵에도 그려 안이 환하게 보이고,
 * 닫은 가게는 셔터. 유리창 틀·문·셔터 상자 같은 입체 부품은 city-build.js 에서 따로 붙임.
 */
export const SHOP_LOOKS = ["conv", "warm", "butcher", "cafe", "mart", "phone", "cool", "study", "shutter", "shutter2", "half", "lobby"];
const LOOK = {
  conv: { wall: "#eef2f4", side: "#dde3e7", ceil: "#f7f9fa", floor: "#c9cfd3", light: "#ffffff" },
  warm: { wall: "#e8c99a", side: "#d7b07c", ceil: "#efdcbc", floor: "#8a6a4a", light: "#fff1cf" },
  butcher: { wall: "#f1e6e4", side: "#e5d3d0", ceil: "#f3e9e7", floor: "#b9aaa6", light: "#ff8f8f" },
  cafe: { wall: "#7a5a40", side: "#6a4c35", ceil: "#4a372a", floor: "#5a4232", light: "#ffd08a" },
  mart: { wall: "#f1f3ec", side: "#e2e6dc", ceil: "#fafbf7", floor: "#cfd3c9", light: "#ffffff" },
  phone: { wall: "#fbfbfc", side: "#eceef1", ceil: "#ffffff", floor: "#d9dce0", light: "#ffffff" },
  cool: { wall: "#e7eeec", side: "#d6dfdc", ceil: "#f2f6f5", floor: "#b9c2bf", light: "#f4fffb" },
  study: { wall: "#e9edf1", side: "#dbe1e7", ceil: "#f5f7f9", floor: "#9aa3ab", light: "#f2f7ff" },
  lobby: { wall: "#d9c3a0", side: "#c8ad86", ceil: "#eadbc2", floor: "#7b6248", light: "#ffe2b0" }
};
function drawInterior(g, x, y, W, H, look, r) {
  const L = LOOK[look];
  const bx0 = x + W * 0.16, bx1 = x + W * 0.84, by0 = y + H * 0.2, by1 = y + H * 0.7; // 뒷벽
  const poly = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill(); };
  g.fillStyle = L.wall; g.fillRect(x, y, W, H);
  poly([[x, y], [x + W, y], [bx1, by0], [bx0, by0]], L.ceil);                 // 천장
  poly([[x, y + H], [x + W, y + H], [bx1, by1], [bx0, by1]], L.floor);         // 바닥
  poly([[x, y], [bx0, by0], [bx0, by1], [x, y + H]], L.side);                 // 옆벽
  poly([[x + W, y], [bx1, by0], [bx1, by1], [x + W, y + H]], L.side);
  // 천장 조명 (원근 따라 줄지어)
  g.fillStyle = L.light;
  for (let k = 0; k < 3; k++) {
    const t = k / 3, ly = y + (by0 - y) * (0.25 + t * 0.6), lw = W * (0.5 - t * 0.28);
    g.fillRect(x + W / 2 - lw / 2, ly, lw, 3 + (1 - t) * 3);
  }
  const R = (a, b) => a + (b - a) * r();
  const people = (n, yy, s) => { // 앉은 사람 실루엣
    g.fillStyle = "rgba(40,32,28,0.85)";
    for (let k = 0; k < n; k++) { const px = R(bx0 - 40, bx1 + 40); g.beginPath(); g.arc(px, yy - s * 1.4, s * 0.55, 0, Math.PI * 2); g.fill(); g.fillRect(px - s * 0.7, yy - s * 0.9, s * 1.4, s * 1.2); }
  };
  if (look === "conv" || look === "mart") {
    // 뒷벽 냉장고 + 가운데 진열대 + 계산대
    g.fillStyle = "#cfe9f2"; g.fillRect(bx0 + 6, by0 + 10, (bx1 - bx0) - 12, by1 - by0 - 14);
    for (let k = bx0 + 8; k < bx1 - 8; k += 14) { g.fillStyle = `hsl(${R(0, 360)},60%,${R(45, 65)}%)`; for (let j = by0 + 16; j < by1 - 10; j += 12) g.fillRect(k, j, 8, 7); }
    for (let row = 0; row < 3; row++) {
      const yy = by1 + 8 + row * 18, x0 = x + W * (0.22 - row * 0.05), x1 = x + W * (0.62 + row * 0.04);
      g.fillStyle = "#b9c0c4"; g.fillRect(x0, yy - 26, x1 - x0, 30);
      for (let k = x0 + 4; k < x1 - 6; k += 9) { g.fillStyle = look === "mart" ? `hsl(${[10, 30, 50, 100, 0][Math.floor(r() * 5)]},75%,${R(45, 60)}%)` : `hsl(${R(0, 360)},55%,${R(40, 65)}%)`; g.fillRect(k, yy - 24, 6, 9); g.fillRect(k, yy - 12, 6, 9); }
    }
    g.fillStyle = "#8a9196"; g.fillRect(x + W * 0.74, y + H * 0.62, W * 0.2, H * 0.3);   // 계산대
    if (look === "mart") for (let k = 0; k < 5; k++) { g.fillStyle = "#a8743c"; g.fillRect(x + 20 + k * 92, y + H - 46, 80, 40); for (let j = 0; j < 8; j++) { g.fillStyle = ["#e8572a", "#f2a531", "#7cb342", "#d63a3a"][k % 4]; g.beginPath(); g.arc(x + 30 + k * 92 + j * 9, y + H - 40, 5, 0, Math.PI * 2); g.fill(); } }
  } else if (look === "warm") {
    g.fillStyle = "#2b2420"; g.fillRect(bx0 + 30, by0 + 8, bx1 - bx0 - 60, 34);                                      // 메뉴판
    g.fillStyle = "#ffd36a"; for (let k = 0; k < 5; k++) g.fillRect(bx0 + 40 + k * ((bx1 - bx0 - 80) / 5), by0 + 16, (bx1 - bx0 - 120) / 5, 4);
    for (let k = 0; k < 4; k++) { const tx = x + 50 + k * 115; g.fillStyle = "#6b4a2e"; g.fillRect(tx, y + H * 0.72, 80, 10); g.fillStyle = "#4a3322"; g.fillRect(tx + 8, y + H * 0.76, 6, 30); g.fillRect(tx + 66, y + H * 0.76, 6, 30); }
    people(5, y + H * 0.72, 11);
    g.fillStyle = "#ffe7b0"; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + 70 + k * 120, y + 30, 9, 0, Math.PI * 2); g.fill(); }
  } else if (look === "butcher") {
    g.strokeStyle = "rgba(160,140,140,0.5)"; g.lineWidth = 1;                                                         // 흰 타일
    for (let k = by0; k < by1; k += 10) { g.beginPath(); g.moveTo(bx0, k); g.lineTo(bx1, k); g.stroke(); }
    g.fillStyle = "#d9d9d9"; g.fillRect(x + W * 0.1, y + H * 0.56, W * 0.8, H * 0.36);                               // 진열 냉장고
    g.fillStyle = "#ff4b4b"; g.fillRect(x + W * 0.12, y + H * 0.6, W * 0.76, H * 0.22);                              // 붉은 조명 아래 고기
    g.fillStyle = "#a3161d"; for (let k = 0; k < 9; k++) { g.beginPath(); g.ellipse(x + W * 0.16 + k * W * 0.08, y + H * 0.72, 16, 9, 0.3, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#f3f0ef"; for (let k = 0; k < 9; k++) g.fillRect(x + W * 0.15 + k * W * 0.08, y + H * 0.74, 10, 3);
    g.fillStyle = "#ff3030"; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + 80 + k * 115, y + 34, 10, 0, Math.PI * 2); g.fill(); }
  } else if (look === "cafe" || look === "lobby") {
    for (let k = bx0 + 6; k < bx1 - 6; k += 18) { g.fillStyle = look === "lobby" ? `hsl(${R(0, 360)},40%,${R(30, 55)}%)` : "#c9b79a"; g.fillRect(k, by0 + 12, 12, look === "lobby" ? by1 - by0 - 20 : 8); }
    if (look === "cafe") { g.fillStyle = "#3a2a1f"; g.fillRect(x + W * 0.55, y + H * 0.58, W * 0.36, H * 0.34); g.fillStyle = "#c7cbd0"; g.fillRect(x + W * 0.62, y + H * 0.5, 40, 22); }
    g.fillStyle = "#3f6b3a"; for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + 30 + k * 26, y + H - 40, 16, 0, Math.PI * 2); g.fill(); }
    for (let k = 0; k < 3; k++) { const tx = x + 60 + k * 110; g.fillStyle = "#5a3d28"; g.fillRect(tx, y + H * 0.74, 70, 8); }
    people(look === "cafe" ? 4 : 3, y + H * 0.74, 10);
    g.fillStyle = "#ffcf7a"; for (let k = 0; k < 5; k++) { const lx = x + 50 + k * 100; g.fillRect(lx, y, 2, 30); g.beginPath(); g.arc(lx + 1, y + 34, 9, 0, Math.PI); g.fill(); }
  } else if (look === "phone") {
    const grd = g.createLinearGradient(bx0, 0, bx1, 0); grd.addColorStop(0, "#5b2cff"); grd.addColorStop(0.5, "#ff3d7f"); grd.addColorStop(1, "#ffb02e");
    g.fillStyle = grd; g.fillRect(bx0 + 20, by0 + 10, bx1 - bx0 - 40, by1 - by0 - 20);                                 // 큰 광고 포스터
    g.fillStyle = "#e3002b"; g.fillRect(bx0, by0 - 6, bx1 - bx0, 8);
    for (let k = 0; k < 3; k++) { const tx = x + 50 + k * 150; g.fillStyle = "#d9dde2"; g.fillRect(tx, y + H * 0.74, 110, 14); g.fillStyle = "#1c1f24"; for (let j = 0; j < 4; j++) g.fillRect(tx + 8 + j * 26, y + H * 0.74 - 14, 12, 18); }
  } else if (look === "cool") {
    g.fillStyle = "#bfe0ea"; for (let k = 0; k < 4; k++) g.fillRect(bx0 + 14 + k * ((bx1 - bx0 - 28) / 4), by0 + 14, (bx1 - bx0) / 4 - 22, by1 - by0 - 40); // 거울·진열장
    g.fillStyle = "#9aa6a3"; g.fillRect(x + W * 0.2, y + H * 0.66, W * 0.6, H * 0.08);
    people(2, y + H * 0.72, 11);
  } else if (look === "study") {
    for (let row = 0; row < 3; row++) {                                                                                // 칸막이 책상 줄
      const yy = y + H * (0.5 + row * 0.15), x0 = x + W * (0.12 - row * 0.05), x1 = x + W * (0.88 + row * 0.05);
      g.fillStyle = "#c3cad1"; g.fillRect(x0, yy, x1 - x0, 8);
      for (let k = x0; k < x1; k += 46 + row * 8) { g.fillStyle = "#8e979f"; g.fillRect(k, yy - 22 - row * 4, 4, 22 + row * 4); g.fillStyle = "#fffbe6"; g.fillRect(k + 14, yy - 6, 10, 4); }
    }
    people(6, y + H * 0.66, 9);
  }
}
function drawShutter(d, e, x, y, W, H, look, r) {
  d.fillStyle = "#3a3936"; d.fillRect(x, y, W, H);
  const base = look === "shutter2" ? 96 : 128 + Math.floor(r() * 30);
  const tint = look === "shutter2" ? [0, 6, 14] : [0, 0, 4];
  if (look === "half") { // 반쯤 내린 셔터 아래로 가게 안 불빛
    drawInterior(d, x, y, W, H, "warm", r);
    drawInterior(e, x, y, W, H, "warm", r);
    e.fillStyle = "rgba(0,0,0,0.35)"; e.fillRect(x, y, W, H);
  }
  for (let k = 0; k < (look === "half" ? H * 0.5 : H); k += 7) {
    d.fillStyle = `rgb(${base + tint[0]},${base + tint[1]},${base + tint[2]})`; d.fillRect(x, y + k, W, 5);
    d.fillStyle = `rgb(${base - 45},${base - 45},${base - 40})`; d.fillRect(x, y + k + 5, W, 2);
    if (look === "half") { e.fillStyle = "#000"; e.fillRect(x, y + k, W, 7); }
  }
  if (look !== "half") {
    d.fillStyle = "rgba(255,255,255,0.08)"; d.fillRect(x + W * 0.1, y + H * 0.35, W * 0.18, H * 0.12);     // 붙여 둔 안내문
    d.fillStyle = "rgba(0,0,0,0.25)"; d.fillRect(x, y + H - 8, W, 8);
  }
}
export function shopTextures(seed) {
  const W = 512, H = 256, COLS = 4, ROWS = 3;
  const r = rng(seed);
  const [cd, d] = canvas(W * COLS, H * ROWS);
  const [ce, e] = canvas(W * COLS, H * ROWS);
  e.fillStyle = "#000"; e.fillRect(0, 0, ce.width, ce.height);
  SHOP_LOOKS.forEach((look, i) => {
    const x = (i % COLS) * W, y = Math.floor(i / COLS) * H;
    if (look.startsWith("shutter") || look === "half") { drawShutter(d, e, x, y, W, H, look, r); return; }
    const s = r() * 1e9;
    drawInterior(d, x, y, W, H, look, rng(s));
    drawInterior(e, x, y, W, H, look, rng(s));   // 문 연 가게: 같은 그림이 스스로 빛남
    e.fillStyle = "rgba(0,0,0,0.12)"; e.fillRect(x, y, W, H);
    // 유리 반사 (낮 맵에만)
    d.fillStyle = "rgba(255,255,255,0.07)";
    d.beginPath(); d.moveTo(x + W * 0.1, y + H); d.lineTo(x + W * 0.35, y); d.lineTo(x + W * 0.45, y); d.lineTo(x + W * 0.2, y + H); d.closePath(); d.fill();
  });
  noise(d, W * COLS, H * ROWS, 8, r);
  // look 이름 → uv 사각형 [u0, v0, u1, v1]
  const cell = (look) => {
    const i = Math.max(0, SHOP_LOOKS.indexOf(look)), c = i % COLS, rw = Math.floor(i / COLS);
    return [c / COLS + 0.002, 1 - (rw + 1) / ROWS + 0.004, (c + 1) / COLS - 0.002, 1 - rw / ROWS - 0.004];
  };
  return { map: tex(cd, false), emissive: tex(ce, false), cell };
}

/* ---------- 거리 가게 목록 (밤 9시 기준) ----------
 * sign: 간판 글자(HSIGNS 이름), look: 진열창 속 모습, open: 문 열었을 확률,
 * out: 가게 앞 소품(tables 플라스틱 탁자 · xbanner 배너), awning: 차양 색
 */
export const SHOPS = [
  { sign: "24시 편의점", look: "conv", open: 1, out: "xbanner", banner: "1+1 행사", w: 3 },
  { sign: "치킨", look: "warm", open: 1, out: "tables", w: 3 },
  { sign: "호프", look: "warm", open: 1, out: "tables", w: 2 },
  { sign: "정육점", look: "butcher", open: 0.95, w: 2 },
  { sign: "카페", look: "cafe", open: 0.9, awning: "#3b2a20", w: 2 },
  { sign: "분식", look: "warm", open: 0.8, out: "xbanner", banner: "오늘의 메뉴", w: 2 },
  { sign: "국밥", look: "warm", open: 0.95, out: "xbanner", banner: "24시 영업", w: 2 },
  { sign: "순대국", look: "warm", open: 0.85, out: "xbanner", banner: "포장 할인", w: 1 },
  { sign: "마트", look: "mart", open: 1, out: "xbanner", banner: "배달 가능", w: 2 },
  { sign: "휴대폰", look: "phone", open: 0.85, out: "xbanner", banner: "개통 이벤트", w: 2 },
  { sign: "미용실", look: "cool", open: 0.6, out: "xbanner", banner: "커트 9900원", w: 2 },
  { sign: "빵집", look: "cafe", open: 0.6, awning: "#b8682e", w: 1 },
  { sign: "꽃집", look: "cool", open: 0.4, awning: "#2f6b3a", w: 1 },
  { sign: "반찬가게", look: "warm", open: 0.5, awning: "#9c3626", w: 1 },
  { sign: "약국", look: "cool", open: 0.4, w: 1 },
  { sign: "안경", look: "cool", open: 0.55, w: 1 },
  { sign: "세탁소", look: "cool", open: 0.35, w: 1 },
  { sign: "부동산", look: "cool", open: 0.2, w: 1 },
  { sign: "떡집", look: "warm", open: 0.15, w: 1 },
  { sign: "철물점", look: "warm", open: 0.2, w: 1 },
  { sign: "스터디카페", look: "study", open: 1, w: 1 }
];

/* ---------- 가게 앞 X배너 (세로 글씨, 8칸 × 128px 폭) ---------- */
export const BANNERS = [
  ["1+1 행사", "#ffd400", "#d4161b"], ["개통 이벤트", "#e3002b", "#ffffff"], ["커트 9900원", "#262626", "#ffd400"], ["오늘의 메뉴", "#2f8a4a", "#ffffff"],
  ["배달 가능", "#1d4fa8", "#ffffff"], ["신규 오픈", "#d4161b", "#ffffff"], ["포장 할인", "#f28c28", "#ffffff"], ["24시 영업", "#111111", "#4fd1ff"]
];
export function bannerTexture(fontFamily) {
  const W = 128, H = 512;
  const [c, g] = canvas(W * BANNERS.length, H);
  BANNERS.forEach(([text, bg, fg], i) => {
    const x = i * W;
    g.fillStyle = bg; g.fillRect(x, 0, W, H);
    g.fillStyle = fg; g.fillRect(x, 0, W, 10); g.fillRect(x, H - 10, W, 10);
    g.font = `900 58px ${fontFamily}`; g.textAlign = "center"; g.textBaseline = "middle";
    const chars = [...text.replace(/ /g, "")];
    const step = Math.min(78, 440 / chars.length);
    chars.forEach((ch, k) => g.fillText(ch, x + W / 2, H / 2 - ((chars.length - 1) * step) / 2 + k * step));
  });
  const cell = (i) => [i / BANNERS.length + 0.004, 0.004, (i + 1) / BANNERS.length - 0.004, 0.996];
  return { texture: tex(c, false), cell, index: (name) => Math.max(0, BANNERS.findIndex((b) => b[0] === name)) };
}

/* ---------- 2·3층 유리창 글씨 (학원 · 스터디카페 · PC방 …) ---------- */
export const UPPER = [
  ["스터디카페 24H", "#ffe14d", 0.95], ["수학 전문 학원", "#ffffff", 0.8], ["영어학원", "#a6e6ff", 0.7], ["PC방", "#4fd1ff", 1],
  ["필라테스", "#ffb3c8", 0.55], ["치과", "#a8d8ff", 0.1], ["노래연습장", "#ff7ad9", 1], ["당구장", "#8dff9c", 0.9],
  ["태권도", "#ff6a5f", 0.5], ["피부과", "#ffd1e0", 0.1], ["독서실", "#fff2a8", 0.9], ["보컬 학원", "#d9b3ff", 0.6]
];
export function upperLetteringTexture(fontFamily) {
  const W = 1024, H = 128;
  const [c, g] = canvas(W, H * UPPER.length);
  g.clearRect(0, 0, c.width, c.height);
  UPPER.forEach(([text, col], i) => {
    const y = i * H;
    g.font = `900 92px ${fontFamily}`; g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 10; g.strokeStyle = "rgba(0,0,0,0.55)"; g.strokeText(text, W / 2, y + H / 2 + 4, W - 60);
    g.fillStyle = col; g.fillText(text, W / 2, y + H / 2 + 4, W - 60);
  });
  const t = tex(c, false);
  const cell = (i) => [0.004, 1 - (i + 1) / UPPER.length + 0.002, 0.996, 1 - i / UPPER.length - 0.002];
  return { texture: t, cell, count: UPPER.length };
}

/* ---------- 한글 간판 아틀라스 ---------- */
// [간판 글자, 바탕, 글자색, 작은 글씨(있으면 아래 줄에)]
const HSIGNS = [
  ["약국", "#1f8a4c", "#ffffff", "PHARMACY"], ["24시 편의점", "#ffffff", "#1d4fa8", "24 HOURS"], ["치킨", "#d4291c", "#fff3c4", "후라이드 · 양념 · 배달"], ["분식", "#f2c230", "#3a1f05", "떡볶이 · 김밥 · 순대"],
  ["부동산", "#ffffff", "#c22a2a", "공인중개사사무소"], ["세탁소", "#2a6fd1", "#ffffff", "수선 · 드라이"], ["미용실", "#e9e4dc", "#5a2a6a", "HAIR"], ["카페", "#2a2420", "#f2d9a6", "COFFEE & DESSERT"],
  ["수학학원", "#0f3d8a", "#ffe45c"], ["내과의원", "#ffffff", "#1b6e4a"], ["치과", "#ffffff", "#1f5fb0"], ["한의원", "#5a2618", "#f6e3c2"],
  ["안경", "#111111", "#ffffff", "콘택트렌즈"], ["꽃집", "#f7eee6", "#c23b6a", "FLOWER"], ["정육점", "#b81d24", "#ffffff", "한우 · 한돈 전문"], ["반찬가게", "#f5e6c8", "#7a3d10", "매일 만드는 반찬"],
  ["철물점", "#f2c230", "#111111", "열쇠 · 공구"], ["인쇄", "#ffffff", "#333333", "현수막 · 명함"], ["떡집", "#ffffff", "#8a1f3a", "방앗간"], ["국밥", "#1a1a1a", "#ffcc33", "24시 영업"],
  ["빵집", "#f4e3c3", "#6a3b12", "BAKERY"], ["휴대폰", "#e3002b", "#ffffff", "개통 · 번호이동"], ["피아노학원", "#ffffff", "#6a2aa8"], ["태권도", "#1d3f9e", "#ffffff"],
  ["마트", "#e8f2e4", "#1f7a3a", "과일 · 채소 · 생필품"], ["호프", "#2b1a0e", "#f5b83d", "생맥주 · 치킨"], ["스터디카페", "#0e0e0e", "#e8e8e8", "24H 무인"], ["순대국", "#f7f0e2", "#a32020", "머리고기 · 수육"],
  ["새솔 시립도서관", "#1c2a24", "#e6d7b0"], ["노래연습장", "#2a0f3a", "#ff7ad9"], ["PC방", "#0b1a33", "#4fd1ff"], ["헬스", "#111111", "#ff5533"]
];
export const SIGN_NAMES = HSIGNS.map((s) => s[0]);
const VSIGNS = [
  ["치과", "#ffffff", "#1f5fb0"], ["내과", "#ffffff", "#1b6e4a"], ["노래방", "#3a0f4a", "#ffd23d"], ["PC방", "#0b1a33", "#4fd1ff"],
  ["학원", "#0f3d8a", "#ffffff"], ["당구장", "#145a32", "#ffffff"], ["헬스", "#111111", "#ff5533"], ["태권도", "#c4161c", "#ffffff"]
];
export const SIGN_COUNT = HSIGNS.length;
export const LIBRARY_SIGN = 28;
export const VSIGN_COUNT = VSIGNS.length;

export function signTextures(fontFamily) {
  const W = 256, H = 64;
  const [c, g] = canvas(W * 4, H * 8 + 512);
  g.fillStyle = "#000"; g.fillRect(0, 0, c.width, c.height);
  HSIGNS.forEach(([text, bg, fg, sub], i) => {
    const x = (i % 4) * W, y = Math.floor(i / 4) * H;
    g.fillStyle = bg; g.fillRect(x + 2, y + 2, W - 4, H - 4);
    g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x + 2, y + H - 8, W - 4, 6);
    g.fillStyle = fg;
    g.textAlign = "center"; g.textBaseline = "middle";
    if (sub) { // 큰 상호 + 아래 작은 글씨
      g.font = `800 ${text.length > 6 ? 26 : 32}px ${fontFamily}`;
      g.fillText(text, x + W / 2, y + 24, W - 24);
      g.globalAlpha = 0.85; g.font = `700 13px ${fontFamily}`;
      g.fillText(sub, x + W / 2, y + 50, W - 30);
      g.globalAlpha = 1;
    } else {
      g.font = `800 ${text.length > 6 ? 30 : 40}px ${fontFamily}`;
      g.fillText(text, x + W / 2, y + H / 2 + 1, W - 24);
    }
  });
  // 세로 돌출 간판 (아래쪽 512px, 8개 × 128px 폭)
  VSIGNS.forEach(([text, bg, fg], i) => {
    const x = i * 128, y = H * 8;
    g.fillStyle = bg; g.fillRect(x + 4, y + 4, 120, 504);
    g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(x + 12, y + 12, 104, 488);
    g.fillStyle = fg;
    g.font = `800 64px ${fontFamily}`;
    g.textAlign = "center"; g.textBaseline = "middle";
    const chars = [...text];
    const step = Math.min(100, 440 / chars.length);
    chars.forEach((ch, k) => g.fillText(ch, x + 64, y + 256 - ((chars.length - 1) * step) / 2 + k * step));
  });
  const t = tex(c, false);
  return { map: t, rows: 8, cols: 4, vTop: (H * 8) / c.height };
}

/* ---------- 노면 ---------- */
export function asphaltTexture(seed, light = false) {
  const r = rng(seed);
  const [c, g] = canvas(256, 256);
  g.fillStyle = light ? "#5c5a57" : "#3a3a3b";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2200; i++) {
    const v = (light ? 70 : 50) + r() * 40;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
  }
  if (light) { // 골목 시멘트 이음매
    g.strokeStyle = "rgba(30,30,30,0.35)"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  }
  noise(g, 256, 256, 14, r);
  return tex(c);
}

export function pavingTexture(seed) {
  const r = rng(seed);
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#77716a"; g.fillRect(0, 0, 256, 256);
  const s = 32;
  for (let y = 0; y < 256; y += s) {
    for (let x = 0; x < 256; x += s) {
      const v = 120 + r() * 30;
      const red = r() < 0.18;
      g.fillStyle = red ? `rgb(${v + 25},${v - 30},${v - 40})` : `rgb(${v},${v - 4},${v - 10})`;
      g.fillRect(x + 1, y + 1, s - 2, s - 2);
    }
  }
  noise(g, 256, 256, 12, r);
  return tex(c);
}

/* ---------- 버스정보안내기(BIS) 화면 ---------- */
export function bisCanvas(fontFamily) {
  const [c, g] = canvas(512, 256);
  const t = tex(c, false);
  const draw = (delayed) => {
    g.fillStyle = "#050505"; g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#1b1b1b"; g.fillRect(0, 0, 512, 44);
    g.font = `700 24px ${fontFamily}`; g.textBaseline = "middle"; g.textAlign = "left";
    g.fillStyle = "#e9e9e9"; g.fillText("버스 도착 정보", 18, 23);
    const rows = delayed
      ? [["402", "9분 지연", "#ffb000"], ["400", "4분 후", "#7dff8a"], ["7016", "12분 후", "#7dff8a"]]
      : [["402", "3분 후", "#7dff8a"], ["400", "4분 후", "#7dff8a"], ["7016", "12분 후", "#7dff8a"]];
    rows.forEach(([no, st, col], i) => {
      const y = 82 + i * 62;
      g.font = `800 40px ${fontFamily}`;
      g.fillStyle = "#ffcc33"; g.textAlign = "left"; g.fillText(no, 22, y);
      g.fillStyle = col; g.textAlign = "right"; g.fillText(st, 490, y);
    });
    t.needsUpdate = true;
  };
  draw(false);
  return { texture: t, draw };
}

/* ---------- 버스 안 정류장 안내 화면 (비율 0.72 : 0.2) ---------- */
export function busScreenCanvas(fontFamily, stopName) {
  const [c, g] = canvas(720, 200);
  const t = tex(c, false);
  const draw = (arriving) => {
    g.fillStyle = "#05080f"; g.fillRect(0, 0, 720, 200);
    g.fillStyle = "#0f1a2e"; g.fillRect(0, 0, 720, 54);
    g.textBaseline = "middle";
    // 노선 번호
    g.fillStyle = "#2f6fd0"; g.beginPath(); g.roundRect(18, 10, 92, 34, 8); g.fill();
    g.fillStyle = "#ffffff"; g.font = `800 26px ${fontFamily}`; g.textAlign = "center"; g.fillText("400", 64, 28);
    g.textAlign = "left"; g.font = `700 24px ${fontFamily}`;
    g.fillStyle = arriving ? "#ff6a3d" : "#ffb000";
    g.fillText(arriving ? "이번 정류장" : "다음 정류장", 128, 28);
    if (arriving) { g.fillStyle = "#ff3b2a"; g.beginPath(); g.arc(690, 27, 9, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#f4f6fa"; g.font = `800 70px ${fontFamily}`;
    g.fillText(stopName, 22, 128, 676);
    t.needsUpdate = true;
  };
  draw(false);
  return { texture: t, draw };
}

/* ---------- 주차금지 표지판 (둥근 판, 바깥은 투명) ---------- */
export function noParkingTexture(fontFamily) {
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  g.fillStyle = "#f7f5ef"; g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
  g.strokeStyle = "#d4161b"; g.lineWidth = 22; g.beginPath(); g.arc(128, 128, 109, 0, Math.PI * 2); g.stroke();
  g.fillStyle = "#d4161b"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `900 64px ${fontFamily}`;
  g.fillText("주차", 128, 98, 170);
  g.fillText("금지", 128, 164, 170);
  return tex(c, false);
}

/* ---------- 작은 안내판 (엘리베이터, 지하철 등) ---------- */
export function labelTexture(text, bg, fg, fontFamily, w = 512, h = 128) {
  const [c, g] = canvas(w, h);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `800 ${Math.round(h * 0.5)}px ${fontFamily}`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, w / 2, h / 2 + 2, w - 30);
  return tex(c, false);
}

/* ---------- 버스정류장 세로 광고 (패널 비율 1.3 : 2.1 에 맞춤) ---------- */
export function adTexture(fontFamily, icon) {
  const [c, g] = canvas(520, 840);
  const grd = g.createLinearGradient(0, 0, 0, 840);
  grd.addColorStop(0, "#14120d"); grd.addColorStop(1, "#0b0a08");
  g.fillStyle = grd; g.fillRect(0, 0, 520, 840);
  g.strokeStyle = "rgba(230,181,74,0.6)"; g.lineWidth = 6; g.strokeRect(18, 18, 484, 804);
  if (icon) {
    g.save();
    g.beginPath(); g.roundRect(130, 110, 260, 260, 58); g.clip();
    g.drawImage(icon, 130, 110, 260, 260);
    g.restore();
  }
  g.textAlign = "center"; g.textBaseline = "alphabetic";
  g.fillStyle = "#e6b54a"; g.font = `800 88px ${fontFamily}`;
  g.fillText("DUX", 260, 500);
  g.fillStyle = "#f1e8d4"; g.font = `700 42px ${fontFamily}`;
  g.fillText("오늘의 나에게", 260, 590);
  g.fillText("맞는 길", 260, 642);
  g.fillStyle = "rgba(241,232,212,0.7)"; g.font = `600 28px ${fontFamily}`;
  g.fillText("말하면 조건대로 길을 찾아요", 260, 730);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ---------- 빛 번짐 (가로등, 별, 전조등) ---------- */
export function glowTexture(inner = "rgba(255,240,210,1)", mid = "rgba(255,200,120,0.35)") {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, mid);
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return tex(c, false);
}

/* ---------- 경로(AR) 흐름 무늬 ---------- */
export function flowTexture() {
  const [c, g] = canvas(256, 32);
  const grd = g.createLinearGradient(0, 0, 256, 0);
  grd.addColorStop(0, "rgba(230,175,60,0.85)");
  grd.addColorStop(0.6, "rgba(240,190,80,0.95)");
  grd.addColorStop(0.82, "rgba(255,246,214,1)");
  grd.addColorStop(1, "rgba(230,175,60,0.85)");
  g.fillStyle = grd; g.fillRect(0, 0, 256, 32);
  // 가장자리 부드럽게
  const edge = g.createLinearGradient(0, 0, 0, 32);
  edge.addColorStop(0, "rgba(0,0,0,1)"); edge.addColorStop(0.22, "rgba(0,0,0,0)");
  edge.addColorStop(0.78, "rgba(0,0,0,0)"); edge.addColorStop(1, "rgba(0,0,0,1)");
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = edge; g.fillRect(0, 0, 256, 32);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  return t;
}
