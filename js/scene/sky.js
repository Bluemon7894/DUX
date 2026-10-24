/**
 * DUX — 하늘 · 별 · 해 · 안개
 * - 하늘은 카메라를 감싸는 구(BackSide)에 셰이더로 그립니다: 높이별 색, 해와 번짐, 별(밤), 지평선의 도시 불빛.
 * - 안개는 three.js 기본 안개를 고쳐서, 해를 향한 방향일수록 밝게 번지도록 합니다.
 */
import { Mesh, SphereGeometry, ShaderMaterial, BackSide, Color, Vector3, ShaderChunk } from "../../vendor/three.min.js";

/* ---------- 안개: 해 방향으로 번지는 빛 ---------- */
export const fogUniforms = {
  uSunView: { value: new Vector3(0, 0, -1) },
  uSunGlow: { value: new Color(0, 0, 0) }
};

ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogView;
#endif`;
ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogView = mvPosition.xyz;
#endif`;
ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  uniform vec3 uSunView;
  uniform vec3 uSunGlow;
  varying float vFogDepth;
  varying vec3 vFogView;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
ShaderChunk.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  float sunAmt = max( dot( normalize( vFogView ), uSunView ), 0.0 );
  vec3 fogCol = fogColor + uSunGlow * ( pow( sunAmt, 4.0 ) * 0.32 + pow( sunAmt, 30.0 ) * 0.45 );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogCol, fogFactor );
#endif`;

export function patchFog(mat) {
  if (mat.__fogPatched || !mat.fog) return;
  mat.__fogPatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    shader.uniforms.uSunView = fogUniforms.uSunView;
    shader.uniforms.uSunGlow = fogUniforms.uSunGlow;
    if (prev) prev(shader, renderer);
  };
  mat.needsUpdate = true;
}

/* ---------- 하늘 구 ---------- */
export function createSky() {
  const uniforms = {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uSunDir: { value: new Vector3(1, 0.05, 0) },
    uSunColor: { value: new Color("#fff1cf") },
    uSunStrength: { value: 0 },
    uHaze: { value: 0.5 },
    uNight: { value: 1 },
    uCityGlow: { value: new Color("#3a2614") },
    uTime: { value: 0 }
  };
  const mat = new ShaderMaterial({
    uniforms,
    side: BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize( position );
        vec4 p = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * p;
        gl_Position.z = gl_Position.w; // 항상 가장 먼 곳
      }`,
    fragmentShader: `
      uniform vec3 uZenith, uHorizon, uSunColor, uCityGlow;
      uniform vec3 uSunDir;
      uniform float uSunStrength, uHaze, uNight, uTime;
      varying vec3 vDir;

      float hash( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }

      void main() {
        vec3 d = normalize( vDir );
        float h = d.y;
        float t = pow( clamp( h, 0.0, 1.0 ), 0.42 );
        vec3 col = mix( uHorizon, uZenith, t );
        if ( h < 0.0 ) col = uHorizon * ( 1.0 + h * 0.6 );

        // 지평선 근처 도시 불빛 (밤)
        col += uCityGlow * exp( - max( h, 0.0 ) * 9.0 ) * uNight;

        // 해: 안개에 가려 테두리가 번진 원반 + 넓은 빛무리
        float s = max( dot( d, normalize( uSunDir ) ), 0.0 );
        float disk = smoothstep( 0.99962 - uHaze * 0.0003, 0.99978, s );
        float glow = pow( s, 60.0 ) * 0.45 + pow( s, 12.0 ) * 0.22 + pow( s, 3.0 ) * 0.1;
        vec3 diskCol = mix( uSunColor, vec3( 1.0, 0.99, 0.95 ), 0.6 );
        col = mix( col, diskCol * 1.25, disk * ( 1.0 - uHaze * 0.35 ) * uSunStrength );
        col += uSunColor * glow * uSunStrength;

        // 별
        if ( uNight > 0.01 && h > 0.0 ) {
          vec3 p = d * 260.0;
          vec3 cell = floor( p );
          float n = hash( cell );
          if ( n > 0.972 ) {
            vec3 c = cell + 0.5 + ( vec3( hash( cell + 1.7 ), hash( cell + 3.1 ), hash( cell + 5.3 ) ) - 0.5 ) * 0.7;
            float dist = length( p - c );
            float tw = 0.65 + 0.35 * sin( uTime * ( 1.5 + n * 3.0 ) + n * 90.0 );
            float b = smoothstep( 0.16, 0.0, dist ) * tw * ( n > 0.994 ? 1.6 : 0.8 );
            col += vec3( 0.92, 0.95, 1.0 ) * b * uNight * smoothstep( 0.03, 0.22, h );
          }
        }
        gl_FragColor = vec4( col, 1.0 );
        #include <colorspace_fragment>
      }`
  });
  const mesh = new Mesh(new SphereGeometry(2000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

/* ---------- 시간대: 방문자의 실제 현재 시각 기준 ---------- */
const K = {
  day: {
    zenith: "#a3a9a8", horizon: "#d9d2c0", fog: "#cfc8b6", density: 0.0034, cityGlow: "#000000",
    hemiSky: "#f7f2e6", hemiGround: "#5d564b", hemi: 1.15, sun: "#fff3da", sunI: 1.35, night: 0, sunStrength: 0.85, glow: "#fff2d6", haze: 0.4
  },
  night: {
    zenith: "#03050c", horizon: "#141b2e", fog: "#0e1320", density: 0.0062, cityGlow: "#3b2716",
    hemiSky: "#3f4f7c", hemiGround: "#0f0c09", hemi: 0.42, sun: "#8aa0d0", sunI: 0.12, night: 1, sunElev: -12, sunStrength: 0, glow: "#000000", haze: 0.5
  },
  blue: {
    zenith: "#101a36", horizon: "#6b6476", fog: "#4b4a5a", density: 0.0068, cityGlow: "#2a1c10",
    hemiSky: "#7c86a8", hemiGround: "#2a241c", hemi: 0.62, sun: "#c7a88a", sunI: 0.25, night: 0.45, sunElev: -3, sunStrength: 0.25, glow: "#5a3a24", haze: 0.8
  },
  dawn: {
    zenith: "#8f8d86", horizon: "#cdb07a", fog: "#c4a979", density: 0.005, cityGlow: "#000000",
    hemiSky: "#ffeccb", hemiGround: "#5e5038", hemi: 1.0, sun: "#ffd391", sunI: 1.05, night: 0, sunElev: 3.0, sunStrength: 1.0, glow: "#ffd98f", haze: 0.6
  },
  morning: {
    zenith: "#a19e94", horizon: "#d8bd8a", fog: "#cfb68a", density: 0.0046, cityGlow: "#000000",
    hemiSky: "#fff0d4", hemiGround: "#665840", hemi: 1.08, sun: "#ffdca0", sunI: 1.2, night: 0, sunElev: 5.6, sunStrength: 1.0, glow: "#ffe2a8", haze: 0.5
  }
};
const cA = new Color(), cB = new Color();
function mixColor(out, a, b, t) { return out.copy(cA.set(a)).lerp(cB.set(b), t); }
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * 시각(0~24시, 소수)에 따른 하늘 상태.
 * 서울 10월 하순 기준: 해 뜸 약 06:42, 해 짐 약 17:50, 남중 고도 약 40°.
 * 해 방향(azimuth): 동(+x) → 남(+z) → 서(-x). out.sunAz, out.sunElev(도) 포함.
 */
const RISE = 6.7, SET = 17.83, PEAK = 40;
export function skyAt(hours, out) {
  const h = ((hours % 24) + 24) % 24;
  const dayLen = SET - RISE;
  let elev, az;
  if (h >= RISE && h <= SET) {
    const t = (h - RISE) / dayLen;
    elev = PEAK * Math.sin(Math.PI * t);
    az = Math.PI * t;                         // 0 = 동쪽, π/2 = 남쪽, π = 서쪽
  } else {
    const nt = ((h - SET + 24) % 24) / (24 - dayLen);
    elev = -40 * Math.sin(Math.PI * nt);
    az = Math.PI + Math.PI * nt;              // 밤에는 북쪽으로 돌아감
  }
  // 해 높이에 따라 밤 → 푸른 시간 → 노을/여명 → 낮
  const stops = [[-90, K.night], [-12, K.night], [-4, K.blue], [1.5, K.dawn], [9, K.morning], [18, K.day], [90, K.day]];
  let i = 0;
  while (i < stops.length - 2 && elev > stops[i + 1][0]) i++;
  const [e0, a] = stops[i], [e1, b] = stops[i + 1];
  let t = Math.max(0, Math.min(1, (elev - e0) / (e1 - e0)));
  t = t * t * (3 - 2 * t);
  ["zenith", "horizon", "fog", "cityGlow", "hemiSky", "hemiGround", "sun", "glow"].forEach((k) => {
    out[k] = out[k] || new Color();
    mixColor(out[k], a[k], b[k], t);
  });
  ["density", "hemi", "sunI", "night", "sunStrength", "haze"].forEach((k) => { out[k] = lerp(a[k], b[k], t); });
  out.sunElev = elev;
  out.sunAz = az;
  out.evening = h > 12;
  return out;
}
