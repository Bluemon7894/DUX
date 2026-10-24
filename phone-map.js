/**
 * DUX v4 — 휴대폰 속 지도 (Canvas 2D)
 * 같은 거리 데이터(city)로 도로·건물·공원을 그리고, 경로 구간과 현재 위치를 표시합니다.
 *  - follow:   내 위치 중심, 진행 방향이 위 (걷는 중 안내 화면)
 *  - overview: 북쪽이 위, 경로 전체가 보이도록 맞춤 (경로 선택 화면)
 */
const toPts = (flat) => { const o = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };

const STYLE = {
  bg: "#16150f",
  block: "#221f19",
  park: "#1e2a1b",
  road: { main: "#4a463c", sec: "#3d3a32", alley: "#322f29" },
  walk: "#e6b54a",
  bus: "#3d7be0",
  sub: "#8a6dff",
  off: "#77736a"
};

export function createPhoneMap(canvas, city) {
  const ctx = canvas.getContext("2d");
  const roads = city.roads.map((r) => ({ k: r.k, w: r.w, pts: toPts(r.pts) }));
  const blds = city.buildings.map((b) => {
    const pts = toPts(b.pts);
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    const rad = Math.max(...pts.map((p) => Math.hypot(p[0] - cx, p[1] - cz)));
    return { pts, cx, cz, rad };
  });
  const parks = (city.parks || []).map((p) => toPts(p.pts));
  let W = 0, H = 0, dpr = 1;

  function resize() {
    // 휴대폰이 기울어져 있으므로 회전 전 크기(clientWidth/Height)를 씀
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = W; canvas.height = H;
  }

  // view: { mode, x, z, yaw, scale(px/m, css), segments:[{pts, kind, from?}], dest:[x,z], user:{x,z,yaw}, fit:[[x,z],...], anchorY }
  function draw(view) {
    if (!W) resize();
    const s = view.scale * dpr;
    let T;
    if (view.mode === "follow") {
      const phi = -view.yaw - Math.PI / 2, c = Math.cos(phi), sn = Math.sin(phi);
      const ox = W / 2, oy = H * (view.anchorY || 0.64);
      T = (x, z) => { const dx = (x - view.x) * s, dz = (z - view.z) * s; return [ox + dx * c - dz * sn, oy + dx * sn + dz * c]; };
    } else {
      const xs = view.fit.map((p) => p[0]), zs = view.fit.map((p) => p[1]);
      const minx = Math.min(...xs), maxx = Math.max(...xs), minz = Math.min(...zs), maxz = Math.max(...zs);
      const top = H * (view.top || 0.12), bottom = H * (view.bottom || 0.5);
      const fs = Math.min((W * 0.84) / Math.max(1, maxx - minx), (bottom - top) / Math.max(1, maxz - minz));
      const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
      T = (x, z) => [W / 2 + (x - cx) * fs, (top + bottom) / 2 + (z - cz) * fs];
      view.scale = fs / dpr;
    }
    const sc = view.scale * dpr;
    const reach = Math.hypot(W, H) / sc;
    const cxw = view.mode === "follow" ? view.x : (Math.min(...view.fit.map((p) => p[0])) + Math.max(...view.fit.map((p) => p[0]))) / 2;
    const czw = view.mode === "follow" ? view.z : (Math.min(...view.fit.map((p) => p[1])) + Math.max(...view.fit.map((p) => p[1]))) / 2;

    ctx.fillStyle = STYLE.bg;
    ctx.fillRect(0, 0, W, H);

    const poly = (pts) => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); };
    ctx.fillStyle = STYLE.park;
    parks.forEach((p) => { poly(p); ctx.fill(); });
    if (sc > 0.6) {
      ctx.fillStyle = STYLE.block;
      blds.forEach((b) => { if (Math.hypot(b.cx - cxw, b.cz - czw) - b.rad < reach) { poly(b.pts); ctx.fill(); } });
    }
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ["alley", "sec", "main"].forEach((k) => {
      ctx.strokeStyle = STYLE.road[k];
      roads.forEach((r) => {
        if (r.k !== k) return;
        ctx.lineWidth = Math.max(1.2 * dpr, r.w * sc);
        ctx.beginPath();
        r.pts.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      });
    });

    // 경로
    (view.segments || []).forEach((sg) => {
      const pts = sg.pts;
      const line = () => { ctx.beginPath(); pts.forEach((p, i) => { const [x, y] = T(p[0], p[1]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); };
      ctx.setLineDash([]);
      if (sg.kind === "walk") {
        ctx.strokeStyle = sg.dim ? "rgba(230,181,74,0.35)" : STYLE.walk;
        ctx.lineWidth = 4.5 * dpr;
        ctx.setLineDash([0.1, 9 * dpr]);
        line(); ctx.stroke();
      } else {
        const col = sg.kind === "bus" ? STYLE.bus : sg.kind === "sub" ? STYLE.sub : STYLE.off;
        ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 8 * dpr; line(); ctx.stroke();
        ctx.strokeStyle = sg.dim ? "rgba(119,115,106,0.6)" : col;
        ctx.lineWidth = 5.5 * dpr;
        if (sg.kind === "off") ctx.setLineDash([7 * dpr, 6 * dpr]);
        line(); ctx.stroke();
      }
      ctx.setLineDash([]);
      if (sg.label) {
        const mid = pts[Math.floor(pts.length / 2)];
        const [x, y] = T(mid[0], mid[1]);
        ctx.font = `700 ${11 * dpr}px Pretendard, sans-serif`;
        const tw = ctx.measureText(sg.label).width + 12 * dpr;
        ctx.fillStyle = sg.kind === "off" ? "#77736a" : sg.kind === "sub" ? STYLE.sub : sg.kind === "bus" ? STYLE.bus : STYLE.walk;
        ctx.beginPath(); ctx.roundRect(x - tw / 2, y - 10 * dpr, tw, 20 * dpr, 10 * dpr); ctx.fill();
        ctx.fillStyle = sg.kind === "walk" ? "#16150f" : "#ffffff";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(sg.label, x, y + 0.5 * dpr);
      }
    });

    // 목적지
    if (view.dest) {
      const [x, y] = T(view.dest[0], view.dest[1]);
      ctx.fillStyle = "#f1e8d4";
      ctx.beginPath(); ctx.arc(x, y - 14 * dpr, 9 * dpr, Math.PI * 0.85, Math.PI * 2.15); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#16150f"; ctx.beginPath(); ctx.arc(x, y - 14 * dpr, 3.5 * dpr, 0, Math.PI * 2); ctx.fill();
    }
    // 출발지 (경로 화면)
    if (view.origin) {
      const [x, y] = T(view.origin[0], view.origin[1]);
      ctx.fillStyle = "#16150f"; ctx.strokeStyle = STYLE.walk; ctx.lineWidth = 3 * dpr;
      ctx.beginPath(); ctx.arc(x, y, 6 * dpr, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    // 내 위치 (진행 방향 화살표)
    if (view.user) {
      const [x, y] = T(view.user.x, view.user.z);
      const a = view.mode === "follow" ? -Math.PI / 2 : view.user.yaw;
      ctx.fillStyle = "rgba(230,181,74,0.18)";
      ctx.beginPath(); ctx.arc(x, y, 22 * dpr, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.translate(x, y); ctx.rotate(a + Math.PI / 2);
      ctx.fillStyle = "#e6b54a"; ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath(); ctx.moveTo(0, -12 * dpr); ctx.lineTo(9 * dpr, 9 * dpr); ctx.lineTo(0, 4 * dpr); ctx.lineTo(-9 * dpr, 9 * dpr); ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  return { draw, resize };
}
