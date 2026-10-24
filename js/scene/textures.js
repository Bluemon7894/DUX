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
  return { map: tex(cd), emissive: tex(ce) };
}

/* ---------- 1층 상가 (4×2 변형) ---------- */
export const SHOP_VARIANTS = 8; // 0~3 셔터, 4 편의점, 5 카페, 6 약국, 7 셔터 반쯤
export function shopTextures(seed) {
  const W = 256, H = 256;
  const r = rng(seed);
  const [cd, d] = canvas(W * 4, H * 2);
  const [ce, e] = canvas(W * 4, H * 2);
  e.fillStyle = "#000"; e.fillRect(0, 0, W * 4, H * 2);
  for (let i = 0; i < SHOP_VARIANTS; i++) {
    const x = (i % 4) * W, y = Math.floor(i / 4) * H;
    d.fillStyle = "#4a4640"; d.fillRect(x, y, W, H);
    d.fillStyle = "#2b2824"; d.fillRect(x, y, W, 26); // 상단 인방
    if (i <= 3 || i === 7) {
      // 셔터 (가로 골)
      const top = i === 7 ? 120 : 30;
      const base = 120 + Math.floor(r() * 50);
      for (let k = top; k < H - 6; k += 6) {
        d.fillStyle = `rgb(${base},${base},${base + 4})`; d.fillRect(x + 10, y + k, W - 20, 4);
        d.fillStyle = `rgb(${base - 40},${base - 40},${base - 36})`; d.fillRect(x + 10, y + k + 4, W - 20, 2);
      }
      if (i === 7) { // 반쯤 열린 셔터 아래 빛
        d.fillStyle = "#1a1a1a"; d.fillRect(x + 10, y + 30, W - 20, 90);
        e.fillStyle = "rgba(255,226,170,0.9)"; e.fillRect(x + 10, y + H - 40, W - 20, 34);
      }
      d.fillStyle = "rgba(0,0,0,0.25)"; d.fillRect(x + 10, y + H - 6, W - 20, 6);
    } else {
      // 유리 진열창
      d.fillStyle = "#1d2328"; d.fillRect(x + 10, y + 30, W - 20, H - 36);
      d.fillStyle = "#6b6f70";
      d.fillRect(x + W / 2 - 3, y + 30, 6, H - 36);
      const glow = i === 4 ? "#f4f8ff" : i === 5 ? "#ffcf8a" : "#e9fff4";
      e.fillStyle = glow; e.fillRect(x + 10, y + 30, W - 20, H - 36);
      // 진열대·실루엣
      e.fillStyle = "rgba(0,0,0,0.35)";
      for (let k = 0; k < 4; k++) e.fillRect(x + 20 + k * 58, y + 80, 40, H - 90);
      e.fillStyle = i === 4 ? "rgba(40,120,220,0.9)" : i === 6 ? "rgba(30,160,90,0.9)" : "rgba(120,70,30,0.8)";
      e.fillRect(x + 10, y + 30, W - 20, 10);
    }
  }
  noise(d, W * 4, H * 2, 10, r);
  const map = tex(cd, false), emissive = tex(ce, false);
  return { map, emissive };
}

/* ---------- 한글 간판 아틀라스 ---------- */
const HSIGNS = [
  ["약국", "#1f8a4c", "#ffffff"], ["24시 편의점", "#ffffff", "#1d4fa8"], ["치킨", "#d4291c", "#fff3c4"], ["분식", "#f2c230", "#3a1f05"],
  ["부동산", "#ffffff", "#c22a2a"], ["세탁소", "#2a6fd1", "#ffffff"], ["미용실", "#e9e4dc", "#5a2a6a"], ["카페", "#2a2420", "#f2d9a6"],
  ["수학학원", "#0f3d8a", "#ffe45c"], ["내과의원", "#ffffff", "#1b6e4a"], ["치과", "#ffffff", "#1f5fb0"], ["한의원", "#5a2618", "#f6e3c2"],
  ["안경", "#111111", "#ffffff"], ["꽃집", "#f7eee6", "#c23b6a"], ["정육점", "#b81d24", "#ffffff"], ["반찬가게", "#f5e6c8", "#7a3d10"],
  ["철물점", "#f2c230", "#111111"], ["인쇄", "#ffffff", "#333333"], ["떡집", "#ffffff", "#8a1f3a"], ["국밥", "#1a1a1a", "#ffcc33"],
  ["빵집", "#f4e3c3", "#6a3b12"], ["휴대폰", "#e3002b", "#ffffff"], ["피아노학원", "#ffffff", "#6a2aa8"], ["태권도", "#1d3f9e", "#ffffff"],
  ["마트", "#e8f2e4", "#1f7a3a"], ["호프", "#2b1a0e", "#f5b83d"], ["스터디카페", "#0e0e0e", "#e8e8e8"], ["순대국", "#f7f0e2", "#a32020"],
  ["새솔 시립도서관", "#1c2a24", "#e6d7b0"], ["노래연습장", "#2a0f3a", "#ff7ad9"], ["PC방", "#0b1a33", "#4fd1ff"], ["헬스", "#111111", "#ff5533"]
];
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
  HSIGNS.forEach(([text, bg, fg], i) => {
    const x = (i % 4) * W, y = Math.floor(i / 4) * H;
    g.fillStyle = bg; g.fillRect(x + 2, y + 2, W - 4, H - 4);
    g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(x + 2, y + H - 8, W - 4, 6);
    g.fillStyle = fg;
    const size = text.length > 6 ? 30 : 40;
    g.font = `800 ${size}px ${fontFamily}`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, x + W / 2, y + H / 2 + 1, W - 24);
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
