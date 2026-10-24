/**
 * DUX — 히어로 3D 경로 네트워크 (Canvas 2D 원근 투영, 외부 라이브러리 없음)
 *
 * 장면 흐름 (약 14.5초 반복)
 *  1. 가장 빠른 길(회색 점선, 계단 표시)이 그려짐
 *  2. 사용자 조건에 맞춰 DUX 경로(파란 선)로 부드럽게 변형
 *  3. 이동 점이 정류장까지 이동 → 버스 지연 알림
 *  4. 남은 구간이 조건을 유지한 대안 경로로 변형 → 도착
 *
 * 성능: 화면 밖·탭 비활성·모션 정지 시 렌더 중지, DPR 상한, 저사양 기기 30fps
 */
(function () {
  "use strict";

  const canvas = document.getElementById("hero-canvas");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const stage = canvas.parentElement;
  const reduceMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- 유틸 ---------- */
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const mixRGB = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
  const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

  function resample(pts, n) {
    const lens = [0];
    for (let i = 1; i < pts.length; i++) {
      lens.push(lens[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    }
    const total = lens[lens.length - 1];
    const out = [];
    let j = 1;
    for (let k = 0; k < n; k++) {
      const d = (total * k) / (n - 1);
      while (j < pts.length - 1 && lens[j] < d) j++;
      const t = (d - lens[j - 1]) / (lens[j] - lens[j - 1] || 1);
      out.push([lerp(pts[j - 1][0], pts[j][0], t), lerp(pts[j - 1][1], pts[j][1], t)]);
    }
    return out;
  }
  const lerpPts = (a, b, t) => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)]);
  function pointAt(pts, f) {
    const x = clamp(f, 0, 1) * (pts.length - 1);
    const i = Math.min(Math.floor(x), pts.length - 2);
    const t = x - i;
    return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t)];
  }

  /* ---------- 도시 블록 (결정적 난수) ---------- */
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const N = 4;
  const blocks = [];
  for (let gx = -N; gx < N; gx++) {
    for (let gz = -N; gz < N; gz++) {
      const park = (gx === 1 && gz === 1) || (gx === -3 && gz === -2) || (gx === 2 && gz === -4);
      const r = rand();
      blocks.push({
        cx: gx + 0.5,
        cz: gz + 0.5,
        s: 0.33,
        h: park ? 0.03 : 0.18 + Math.pow(r, 1.5) * 1.25,
        park,
        glass: !park && rand() > 0.84,
        hue: 210 + rand() * 30
      });
    }
  }

  /* ---------- 경로 (도로 격자 위 좌표) ---------- */
  const F = resample([[-4, 3], [-4, -1], [1, -1], [1, -3], [4, -3]], 84);   // 최단(계단 포함)
  const AH = resample([[-4, 3], [-1, 3]], 24);                               // 공통 앞부분(도보)
  const AT = resample([[-1, 3], [-1, 0], [2, 0], [2, -3], [4, -3]], 60);      // 기존 맞춤 경로 뒷부분
  const CT = resample([[-1, 3], [3, 3], [3, -3], [4, -3]], 60);              // 재추천 경로 뒷부분
  const AFULL = AH.concat(AT);

  const C_GREY = [154, 167, 184];
  const C_BLUE = [47, 123, 255];
  const C_CYAN = [51, 204, 255];
  const C_AMBER = [242, 165, 22];
  const C_MINT = [18, 168, 131];
  const LOOP = 14.5;

  /* ---------- 카메라 / 투영 ---------- */
  let W = 0, H = 0, dpr = 1, unit = 40, ox = 0, oy = 0;
  let yaw = 0.62, pitch = 0.98, cyw = 1, syw = 0, cp = 1, sp = 0;
  const D = 16;
  let pointerX = 0, pointerY = 0, px = 0, py = 0;

  function proj(x, y, z) {
    const x1 = x * cyw - z * syw;
    const z1 = x * syw + z * cyw;
    const y2 = y * cp + z1 * sp;
    const z2 = -y * sp + z1 * cp;
    const s = (unit * D) / (D + z2);
    return { x: ox + x1 * s, y: oy - y2 * s, z: z2, s };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const small = rect.width < 700;
    dpr = Math.min(window.devicePixelRatio || 1, small ? 1.5 : 1.75);
    W = Math.max(1, Math.round(rect.width * dpr));
    H = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = W;
    canvas.height = H;
    const wide = rect.width > 900;
    unit = Math.min(W * (wide ? 0.6 : 0.95), H * 1.1) / 12;
    ox = W * (wide ? 0.62 : 0.5);
    oy = H * (wide ? 0.5 : 0.46);
    if (!running) draw(staticTime());
  }

  /* ---------- 그리기 도우미 ---------- */
  function quad(a, b, c, d, fill) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawGround() {
    const e = N + 0.55;
    const g = [proj(-e, 0, -e), proj(e, 0, -e), proj(e, 0, e), proj(-e, 0, e)];
    ctx.save();
    ctx.shadowColor = "rgba(13,27,42,0.12)";
    ctx.shadowBlur = 40 * dpr;
    ctx.shadowOffsetY = 18 * dpr;
    quad(g[0], g[1], g[2], g[3], "rgba(255,255,255,0.72)");
    ctx.restore();

    // 강 (부드러운 띠)
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const x = -e + (2 * e * i) / 24;
      const p = proj(x, 0, -2.0 + Math.sin(x * 0.6) * 0.35);
      i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y);
    }
    ctx.strokeStyle = "rgba(51,204,255,0.16)";
    ctx.lineWidth = unit * 0.32;
    ctx.lineCap = "round";
    ctx.stroke();

    // 도로 격자
    ctx.strokeStyle = "rgba(160,178,200,0.35)";
    ctx.lineWidth = Math.max(1, unit * 0.045);
    ctx.beginPath();
    for (let i = -N; i <= N; i++) {
      let a = proj(i, 0, -N), b = proj(i, 0, N);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      a = proj(-N, 0, i); b = proj(N, 0, i);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  function drawBlocks() {
    const order = blocks
      .map((b) => ({ b, d: proj(b.cx, 0, b.cz).z }))
      .sort((p, q) => q.d - p.d);

    for (const { b } of order) {
      const x0 = b.cx - b.s, x1 = b.cx + b.s, z0 = b.cz - b.s, z1 = b.cz + b.s;
      const g = [proj(x0, 0, z0), proj(x1, 0, z0), proj(x1, 0, z1), proj(x0, 0, z1)];
      const t = [proj(x0, b.h, z0), proj(x1, b.h, z0), proj(x1, b.h, z1), proj(x0, b.h, z1)];

      if (b.park) {
        quad(t[0], t[1], t[2], t[3], "rgba(150,224,190,0.55)");
        continue;
      }
      const centerD = proj(b.cx, b.h / 2, b.cz).z;
      const top = b.glass ? `hsla(195,80%,92%,0.95)` : `hsla(${b.hue},45%,98%,0.96)`;
      const sideA = b.glass ? `hsla(200,70%,80%,0.9)` : `hsla(${b.hue},32%,88%,0.95)`;
      const sideB = b.glass ? `hsla(205,60%,72%,0.9)` : `hsla(${b.hue + 6},28%,81%,0.95)`;

      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4;
        const fd = (g[i].z + g[j].z) / 2;
        if (fd < centerD) quad(g[i], g[j], t[j], t[i], i % 2 === 0 ? sideA : sideB);
      }
      quad(t[0], t[1], t[2], t[3], top);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = Math.max(1, dpr * 0.8);
      ctx.stroke();
    }
  }

  function tracePath(pts, upto) {
    const n = Math.max(2, Math.round(upto * (pts.length - 1)) + 1);
    const P = [];
    for (let i = 0; i < n; i++) P.push(proj(pts[i][0], 0.04, pts[i][1]));
    ctx.beginPath();
    ctx.moveTo(P[0].x, P[0].y);
    for (let i = 1; i < P.length - 1; i++) {
      const mx = (P[i].x + P[i + 1].x) / 2, my = (P[i].y + P[i + 1].y) / 2;
      ctx.quadraticCurveTo(P[i].x, P[i].y, mx, my);
    }
    ctx.lineTo(P[P.length - 1].x, P[P.length - 1].y);
    return P;
  }

  function strokeRoute(pts, color, alpha, opts) {
    const o = opts || {};
    const upto = o.upto == null ? 1 : o.upto;
    if (upto <= 0) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    tracePath(pts, upto);
    if (o.dashed) ctx.setLineDash([unit * 0.12, unit * 0.16]);
    ctx.strokeStyle = rgba(color, alpha * 0.18);
    ctx.lineWidth = unit * 0.34;
    if (!o.dashed) ctx.stroke();
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = unit * (o.dashed ? 0.08 : 0.12);
    ctx.stroke();
    if (o.flow && !o.dashed) {
      ctx.setLineDash([unit * 0.05, unit * 0.32]);
      ctx.lineDashOffset = -o.flow * unit * 1.2;
      ctx.strokeStyle = `rgba(255,255,255,${0.85 * alpha})`;
      ctx.lineWidth = unit * 0.05;
      ctx.stroke();
    }
    ctx.restore();
  }

  function glyph(kind, s) {
    ctx.beginPath();
    switch (kind) {
      case "walk":
        ctx.arc(0.5 * s, -6 * s, 1.8 * s, 0, Math.PI * 2);
        ctx.moveTo(0, -3 * s); ctx.lineTo(-1 * s, 2.5 * s); ctx.lineTo(-4 * s, 7.5 * s);
        ctx.moveTo(-1 * s, 2.5 * s); ctx.lineTo(3 * s, 7.5 * s);
        ctx.moveTo(-4 * s, 0); ctx.lineTo(0, -3 * s); ctx.lineTo(4 * s, -0.5 * s);
        break;
      case "bus":
        roundRect(-6 * s, -7 * s, 12 * s, 13 * s, 3 * s);
        ctx.moveTo(-6 * s, 0); ctx.lineTo(6 * s, 0);
        ctx.moveTo(-3.5 * s, 6 * s); ctx.lineTo(-3.5 * s, 8.5 * s);
        ctx.moveTo(3.5 * s, 6 * s); ctx.lineTo(3.5 * s, 8.5 * s);
        break;
      case "subway":
        roundRect(-5.5 * s, -7 * s, 11 * s, 12 * s, 4 * s);
        ctx.moveTo(-5.5 * s, -1 * s); ctx.lineTo(5.5 * s, -1 * s);
        ctx.moveTo(-3 * s, 5 * s); ctx.lineTo(-5 * s, 8.5 * s);
        ctx.moveTo(3 * s, 5 * s); ctx.lineTo(5 * s, 8.5 * s);
        break;
      case "bike":
        ctx.arc(-5 * s, 3 * s, 3.4 * s, 0, Math.PI * 2);
        ctx.moveTo(8.4 * s, 3 * s);
        ctx.arc(5 * s, 3 * s, 3.4 * s, 0, Math.PI * 2);
        ctx.moveTo(-5 * s, 3 * s); ctx.lineTo(-1.5 * s, -3 * s); ctx.lineTo(3.5 * s, -3 * s); ctx.lineTo(5 * s, 3 * s);
        break;
      case "stairs":
        ctx.moveTo(-7 * s, 6 * s); ctx.lineTo(-3 * s, 6 * s); ctx.lineTo(-3 * s, 2 * s); ctx.lineTo(1 * s, 2 * s);
        ctx.lineTo(1 * s, -2 * s); ctx.lineTo(5 * s, -2 * s); ctx.lineTo(5 * s, -6 * s); ctx.lineTo(7 * s, -6 * s);
        break;
      case "alert":
        ctx.moveTo(0, -6 * s); ctx.lineTo(0, 1.5 * s);
        ctx.moveTo(0, 5.5 * s); ctx.lineTo(0, 5.6 * s);
        break;
    }
    ctx.stroke();
  }

  function marker(p, kind, alpha, bob, bg, fg) {
    if (alpha <= 0.01) return;
    const base = proj(p[0], 0.04, p[1]);
    const top = proj(p[0], 0.62 + bob, p[1]);
    const size = 30 * dpr * (top.s / unit);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(13,27,42,0.18)";
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(top.x, top.y + size / 2);
    ctx.stroke();
    ctx.shadowColor = "rgba(13,27,42,0.22)";
    ctx.shadowBlur = 14 * dpr;
    ctx.shadowOffsetY = 6 * dpr;
    roundRect(top.x - size / 2, top.y - size / 2, size, size, size * 0.32);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.translate(top.x, top.y);
    ctx.strokeStyle = fg;
    ctx.lineWidth = 1.7 * dpr * (size / (30 * dpr));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    glyph(kind, (size / 30) * 1.05);
    ctx.restore();
  }

  function ring(p, r, color, alpha) {
    const c = proj(p[0], 0.04, p[1]);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, cp * 0.9 + 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, r * unit, 0, Math.PI * 2);
    ctx.strokeStyle = rgba(color, alpha);
    ctx.lineWidth = 2.2 * dpr;
    ctx.stroke();
    ctx.restore();
  }

  function dot(p, color, t) {
    const c = proj(p[0], 0.06, p[1]);
    const r = unit * 0.13;
    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r * (2.1 + Math.sin(t * 4) * 0.3), 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, 0.18);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, 1);
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = "#fff";
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function endpoint(p, color) {
    const c = proj(p[0], 0.04, p[1]);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, cp * 0.9 + 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, unit * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, 0.22);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, unit * 0.09, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, 1);
    ctx.fill();
    ctx.restore();
  }

  /* ---------- 프레임 ---------- */
  function draw(t) {
    const tt = t % LOOP;

    yaw = 0.62 + Math.sin(t * 0.08) * 0.07 + px * 0.22;
    pitch = 0.9 + py * 0.08;
    cyw = Math.cos(yaw); syw = Math.sin(yaw);
    cp = Math.cos(pitch); sp = Math.sin(pitch);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawGround();
    drawBlocks();

    const fadeOut = 1 - seg(tt, 13.4, 14.5);
    const flow = t * 0.6;
    const start = AH[0];
    const end = CT[CT.length - 1];

    endpoint(start, C_MINT);
    endpoint(end, [13, 27, 42]);

    if (tt < 2.8) {
      // 1~2단계: 최단 경로 → DUX 맞춤 경로로 변형
      const m = ease(seg(tt, 1.4, 2.8));
      const pts = m > 0 ? lerpPts(F, AFULL, m) : F;
      const col = mixRGB(C_GREY, C_BLUE, m);
      strokeRoute(pts, col, 0.95, { upto: ease(seg(tt, 0, 1.0)), dashed: m < 0.45, flow });
      marker(pointAt(F, 0.64), "stairs", (1 - m) * seg(tt, 0.5, 1.0), Math.sin(t * 2) * 0.04, "#FFF1D6", "#8A5300");
      marker(pointAt(AH, 0.45), "walk", m, Math.sin(t * 2 + 1) * 0.04, "#FFFFFF", "#0D1B2A");
    } else {
      const mt = ease(seg(tt, 6.6, 8.0));
      const alertAmt = seg(tt, 5.4, 5.8) * (1 - seg(tt, 7.4, 8.2));
      const tail = mt > 0 ? lerpPts(AT, CT, mt) : AT;
      const tailCol = mixRGB(mixRGB(C_BLUE, C_AMBER, alertAmt), C_BLUE, 0);

      strokeRoute(AH, mixRGB(C_BLUE, C_CYAN, 0.25), fadeOut, { flow });
      strokeRoute(tail, mt > 0.5 ? mixRGB(C_BLUE, C_MINT, (mt - 0.5) * 1.2) : tailCol, fadeOut, { dashed: alertAmt > 0.5 && mt < 0.5, flow });

      marker(pointAt(AH, 0.45), "walk", fadeOut, Math.sin(t * 2 + 1) * 0.04, "#FFFFFF", "#0D1B2A");
      const busP = pointAt(AT, 0.13);
      marker(busP, alertAmt > 0.3 ? "alert" : "bus", (1 - mt) * fadeOut, Math.sin(t * 2) * 0.04,
        alertAmt > 0.3 ? "#F2A516" : "#2F7BFF", "#FFFFFF");
      marker(pointAt(AT, 0.62), "subway", (1 - mt) * fadeOut, Math.sin(t * 2 + 2) * 0.04, "#7A5CFF", "#FFFFFF");
      marker(pointAt(CT, 0.3), "bus", mt * fadeOut, Math.sin(t * 2 + 0.5) * 0.04, "#12A883", "#FFFFFF");
      marker(pointAt(CT, 0.78), "bike", mt * fadeOut, Math.sin(t * 2 + 1.5) * 0.04, "#FFFFFF", "#08765B");

      if (alertAmt > 0) {
        const k = (tt * 1.2) % 1;
        ring(busP, 0.2 + k * 0.6, C_AMBER, alertAmt * (1 - k));
      }

      // 이동 점
      let dp;
      if (tt < 5.4) dp = pointAt(AH, ease(seg(tt, 2.8, 5.4)));
      else if (tt < 8.0) dp = AH[AH.length - 1];
      else dp = pointAt(CT, ease(seg(tt, 8.0, 11.5)));
      ctx.globalAlpha = fadeOut;
      dot(dp, C_BLUE, t);
      ctx.globalAlpha = 1;

      if (tt > 11.5 && tt < 13.4) {
        const k = seg(tt, 11.5, 13.0);
        ring(end, 0.15 + k * 0.7, C_MINT, 1 - k);
      }
    }

    // 가장자리 부드럽게 페이드
    ctx.globalCompositeOperation = "destination-in";
    const R = Math.max(W, H) * 0.62;
    const grd = ctx.createRadialGradient(ox, oy, R * 0.45, ox, oy, R);
    grd.addColorStop(0, "rgba(0,0,0,1)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";
  }

  /* ---------- 루프 제어 ---------- */
  let running = false;
  let visible = true;
  let userPaused = reduceMQ.matches;
  let rafId = 0;
  let last = 0;
  let time = 0;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4 || window.innerWidth < 700;
  const minFrame = lowPower ? 1000 / 30 : 0;

  function staticTime() { return time || 9.4; }

  function frame(now) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const dt = now - last;
    if (dt < minFrame) return;
    last = now;
    time += Math.min(dt, 64) / 1000;
    px += (pointerX - px) * 0.05;
    py += (pointerY - py) * 0.05;
    draw(time);
  }

  function update() {
    const should = visible && !document.hidden && !userPaused;
    if (should && !running) {
      running = true;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      update();
    }, { threshold: 0.01 }).observe(canvas);
  }
  document.addEventListener("visibilitychange", update);

  document.addEventListener("dux:motion", (e) => {
    userPaused = !!e.detail.paused;
    if (userPaused && !time) time = 9.4;
    update();
    if (!running) draw(staticTime());
  });

  if (window.matchMedia("(pointer: fine)").matches) {
    stage.closest(".hero").addEventListener("pointermove", (e) => {
      pointerX = e.clientX / window.innerWidth - 0.5;
      pointerY = e.clientY / window.innerHeight - 0.5;
    }, { passive: true });
  }

  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);

  resize();
  if (userPaused) { time = 9.4; draw(time); }
  update();
})();
