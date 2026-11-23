// Atelier 4·2 View — section perspective ("단면 투시"): one-point off-axis camera on the cut plane,
// line extraction from depth / normal / object-id buffers, sun, explode and program scenes, entourage cards.
// Written from scratch for this project; only the idea (cut plane as a fixed picture plane) is a general technique.

export const SP_DICT = {
  ko: {
    spBtn: '단면 투시', spTitle: '단면 투시', spAxis: '단면 축', spFront: '정면 (Y)', spSide: '측면 (X)', spFlip: '반대편에서 보기',
    spPos: '절단 위치', spDepth: '평면 ↔ 깊이', spEye: '눈높이 {h} m · 거리 {d} m', spCapBlack: '절단면 검정 채움', spCapHint: '끄면 절단 외곽선만 남습니다.',
    spScenes: '장면', spLine: '선화', spSun: '햇빛', spExplode: '분해', spProgram: '구성',
    spNeed: '모델을 먼저 여세요.', spNoCap: '객체가 많아 절단면 채움을 껐습니다.', spVpAria: '소실점 (드래그)',
    sunDate: '날짜', sunTime: '시각', sunLat: '위도', sunLon: '경도', sunNorth: '북쪽 방향 (°)', sunUtc: 'UTC 시차', sunInfo: '태양 고도 {el}° · 방위 {az}°', sunNight: '해가 지평선 아래입니다',
    progHint: '강조할 레이어를 켜세요. 나머지는 연한 회색입니다.', progAccent: '강조',
    entTitle: '점경 (사람·나무)', entAdd: '점경 넣기', entH: '높이 (m)', entFlip: '좌우 반전', entDel: '삭제', entHint: '투명 배경 선화 PNG. 놓을 바닥을 누르세요. 끌어서 이동, Shift는 깊이 이동.',
    entPlace: '점경을 놓을 바닥을 누르세요', entNone: '점경이 없습니다.', entBadImg: '이미지를 읽지 못했습니다.', entItem: '점경 {n}',
    spSave: '설정 저장 (JSON)', spLoad: '설정 불러오기', spSaved: '단면 투시 설정을 저장했습니다', spLoaded: '단면 투시 설정을 불러왔습니다', spBadJson: '설정 파일을 읽지 못했습니다.',
    spRenderFail: '이 기기에서는 선 추출을 쓸 수 없습니다 (WebGL2 필요).',
    spHintNote: '패턴(마루·벽돌 선)은 다음 단계입니다.',
  },
  fr: {
    spBtn: 'Coupe perspective', spTitle: 'Coupe perspective', spAxis: 'Axe de coupe', spFront: 'Face (Y)', spSide: 'Côté (X)', spFlip: 'Voir de l’autre côté',
    spPos: 'Position de coupe', spDepth: 'Plan ↔ profondeur', spEye: 'Hauteur d’œil {h} m · distance {d} m', spCapBlack: 'Poché noir de la coupe', spCapHint: 'Désactivé : seul le contour de coupe reste.',
    spScenes: 'Scène', spLine: 'Trait', spSun: 'Soleil', spExplode: 'Éclaté', spProgram: 'Programme',
    spNeed: 'Ouvrez d’abord un modèle.', spNoCap: 'Trop d’objets : poché désactivé.', spVpAria: 'Point de fuite (glisser)',
    sunDate: 'Date', sunTime: 'Heure', sunLat: 'Latitude', sunLon: 'Longitude', sunNorth: 'Direction du nord (°)', sunUtc: 'Décalage UTC', sunInfo: 'Hauteur du soleil {el}° · azimut {az}°', sunNight: 'Le soleil est sous l’horizon',
    progHint: 'Activez les calques à accentuer. Les autres restent gris clair.', progAccent: 'Accent',
    entTitle: 'Échelle humaine (personnes, arbres)', entAdd: 'Ajouter', entH: 'Hauteur (m)', entFlip: 'Inverser', entDel: 'Supprimer', entHint: 'PNG au trait, fond transparent. Cliquez le sol. Glisser pour déplacer, Maj pour la profondeur.',
    entPlace: 'Cliquez le sol où poser l’élément', entNone: 'Aucun élément.', entBadImg: 'Image illisible.', entItem: 'Élément {n}',
    spSave: 'Enregistrer (JSON)', spLoad: 'Charger un réglage', spSaved: 'Réglages enregistrés', spLoaded: 'Réglages chargés', spBadJson: 'Fichier de réglages illisible.',
    spRenderFail: 'Extraction de traits indisponible sur cet appareil (WebGL2 requis).',
    spHintNote: 'Les motifs (parquet, briques) viendront ensuite.',
  },
};

const AX = { x: 0, y: 1, z: 2 };

const CAP_ID = [255, 255, 254], CARD_ID = [255, 255, 253];
const INK = '#111111', FAR_GRAY = '#7D848D', ACCENT = '#E6B89C', SHADOW = '#D9DADC';
const GRAYS = ['#EEEEF0', '#E1E2E4', '#D4D6D9', '#C8CACE', '#DADBDD'];

const ID_VERT = /* glsl */`
varying vec3 vVP;
#include <clipping_planes_pars_vertex>
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  vVP = mvPosition.xyz;
}`;
const ID_FRAG = /* glsl */`
precision highp float;
varying vec3 vVP;
uniform vec3 uId; uniform vec3 uFill; uniform float uCap;
layout(location = 0) out highp vec4 o0;
layout(location = 1) out highp vec4 o1;
layout(location = 2) out highp vec4 o2;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  vec3 n = vec3(0.0, 0.0, 1.0);
  if (uCap < 0.5) {
    n = normalize(cross(dFdx(vVP), dFdy(vVP)));
    if (dot(n, vVP) > 0.0) n = -n;
  }
  o0 = vec4(uId, 1.0); o1 = vec4(n * 0.5 + 0.5, 1.0); o2 = vec4(uFill, 1.0);
}`;
const CAP_VERT = /* glsl */`
uniform vec3 uRightV; uniform vec4 uRect;
varying vec3 vVP; varying vec2 vMask;
#include <clipping_planes_pars_vertex>
void main() {
  #include <begin_vertex>
  #include <project_vertex>
  #include <clipping_planes_vertex>
  vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vMask = vec2((dot(wp, uRightV) - uRect.x) / (uRect.y - uRect.x), (wp.z - uRect.z) / (uRect.w - uRect.z));
  vVP = mvPosition.xyz;
}`;
const CAP_FRAG = /* glsl */`
precision highp float;
varying vec3 vVP; varying vec2 vMask;
uniform vec3 uId; uniform vec3 uFill; uniform sampler2D uMask;
layout(location = 0) out highp vec4 o0;
layout(location = 1) out highp vec4 o1;
layout(location = 2) out highp vec4 o2;
#include <clipping_planes_pars_fragment>
void main() {
  #include <clipping_planes_fragment>
  if (vMask.x < 0.0 || vMask.x > 1.0 || vMask.y < 0.0 || vMask.y > 1.0) discard;
  if (texture2D(uMask, vMask).r < 0.5) discard;
  o0 = vec4(uId, 1.0); o1 = vec4(0.5, 0.5, 1.0, 1.0); o2 = vec4(uFill, 1.0);
}`;
const CARD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const CARD_FRAG = /* glsl */`
precision highp float;
varying vec2 vUv; uniform sampler2D map; uniform vec3 uId;
layout(location = 0) out highp vec4 o0;
layout(location = 1) out highp vec4 o1;
layout(location = 2) out highp vec4 o2;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.5) discard;
  o0 = vec4(uId, 1.0); o1 = vec4(0.5, 0.5, 1.0, 1.0); o2 = vec4(c.rgb, 1.0);
}`;
const QUAD_VERT = /* glsl */`
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const QUAD_FRAG = /* glsl */`
precision highp float;
precision highp sampler2D;
uniform sampler2D tId; uniform sampler2D tNor; uniform sampler2D tFill; uniform sampler2D tDepth; uniform sampler2D tShadow;
uniform vec2 uMrt; uniform int uSS; uniform float uKS; uniform int uLmax;
uniform mat4 uPInv; uniform float uNear, uFar, uP00, uP11, uCut, uWRange;
uniform float uRs0, uRs1, uRc0, uRc1, uCreaseCos, uTransparent;
uniform vec3 uInk, uGray, uShadeCol, uCapId, uCardId, uL;
uniform float uSun; uniform mat4 uLVP, uCamWorld; uniform float uLBias, uSmap;
layout(location = 0) out highp vec4 outC;

float lin(float d) { float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
vec3 vpos(ivec2 p, float dist) {
  vec2 ndc = (vec2(p) + 0.5) / uMrt * 2.0 - 1.0;
  vec4 a = uPInv * vec4(ndc, -1.0, 1.0); a.xyz /= a.w;
  return a.xyz * (dist / -a.z);
}
bool same3(vec3 a, vec3 b) { return all(lessThan(abs(a - b), vec3(0.001))); }

void main() {
  ivec2 o = ivec2(gl_FragCoord.xy) * uSS;
  vec3 acc = vec3(0.0); float accA = 0.0;
  int dirs[16] = int[16](1,0, 1,1, 0,1, -1,1, -1,0, -1,-1, 0,-1, 1,-1);
  for (int sj = 0; sj < 4; sj++) {
    if (sj >= uSS) break;
    for (int si = 0; si < 4; si++) {
      if (si >= uSS) break;
      ivec2 p = o + ivec2(si, sj);
      vec4 idp = texelFetch(tId, p, 0);
      bool objp = idp.a > 0.5;
      bool capp = objp && same3(idp.rgb, uCapId), cardp = objp && same3(idp.rgb, uCardId);
      float dp = objp ? lin(texelFetch(tDepth, p, 0).r) : uFar;
      vec3 np = texelFetch(tNor, p, 0).rgb * 2.0 - 1.0;
      vec3 Pp = objp ? vpos(p, dp) : vec3(0.0);
      float pxw = 2.0 * dp / (uP00 * uMrt.x);
      float strength = 0.0, lineW = 1.0;
      if (!cardp) {
        for (int L = 1; L <= 16; L++) {
          if (L > uLmax) break;
          for (int k = 0; k < 8; k++) {
            ivec2 dv = ivec2(dirs[k * 2], dirs[k * 2 + 1]);
            ivec2 q = p + dv * L;
            if (q.x < 0 || q.y < 0 || q.x >= int(uMrt.x) || q.y >= int(uMrt.y)) continue;
            vec4 idq = texelFetch(tId, q, 0);
            bool objq = idq.a > 0.5;
            if (!objp && !objq) continue;
            if (objq && same3(idq.rgb, uCardId)) continue;
            float len = float(L) * length(vec2(dv));
            float dq = objq ? lin(texelFetch(tDepth, q, 0).r) : uFar;
            float dn = min(objp ? dp : uFar, objq ? dq : uFar);
            float tf = clamp((dn - uCut) / uWRange, 0.0, 1.0);
            float rS = mix(uRs0, uRs1, tf) * uKS, rC = mix(uRc0, uRc1, tf) * uKS;
            bool sil = false, cr = false;
            if (objp != objq || !same3(idp.rgb, idq.rgb)) sil = true;
            else {
              vec3 Pq = vpos(q, dq);
              float pd = abs(dot(np, Pq - Pp));
              float foot = 1.6 * len * pxw;
              if (pd > max(foot, 0.0015 * dp)) sil = true;
              else {
                vec3 nq = texelFetch(tNor, q, 0).rgb * 2.0 - 1.0;
                if (dot(np, nq) < uCreaseCos) cr = true;
              }
            }
            float cov = 0.0;
            if (sil) cov = clamp(rS - len + 1.0, 0.0, 1.0);
            else if (cr) cov = clamp(rC - len + 1.0, 0.0, 1.0);
            if (cov > strength) { strength = cov; lineW = tf; }
            else if (cov > 0.0 && cov >= strength * 0.99 && tf < lineW) lineW = tf;
          }
        }
      }
      vec3 base = vec3(1.0);
      if (objp) {
        base = texelFetch(tFill, p, 0).rgb;
        if (uSun > 0.5 && !capp && !cardp) {
          vec3 Pw = (uCamWorld * vec4(Pp, 1.0)).xyz;
          vec3 nw = normalize(mat3(uCamWorld) * np);
          bool sh = uSun > 1.5 || dot(nw, uL) <= 0.02;
          if (!sh) {
            vec4 lp = uLVP * vec4(Pw + nw * 0.0, 1.0);
            vec3 ln = lp.xyz / lp.w * 0.5 + 0.5;
            if (ln.x > 0.0 && ln.x < 1.0 && ln.y > 0.0 && ln.y < 1.0) {
              float occ = 0.0;
              for (int a = -1; a <= 1; a++) for (int b = -1; b <= 1; b++) {
                float sd = texture2D(tShadow, ln.xy + vec2(float(a), float(b)) / uSmap).r;
                if (ln.z - uLBias > sd) occ += 1.0;
              }
              sh = occ > 4.5;
            }
          }
          if (sh) base = uShadeCol;
        }
      }
      float fade = smoothstep(0.55, 1.0, lineW);
      vec3 ink = mix(uInk, uGray, fade);
      vec3 col = mix(base, ink, strength);
      float a = objp ? 1.0 : strength;
      acc += col * a; accA += a;
    }
  }
  float n = float(uSS * uSS);
  vec3 rgb = accA > 0.0 ? acc / accA : vec3(1.0);
  float alpha = accA / n;
  if (uTransparent < 0.5) { rgb = mix(vec3(1.0), rgb, alpha); alpha = 1.0; }
  outC = vec4(rgb * (uTransparent < 0.5 ? 1.0 : alpha), alpha);
}`;

export function createSP(ctx) {
  const { THREE, renderer, scene, canvas, stage, $, $$, t } = ctx;
  const S = {
    on: false, axis: 'y', flip: true, vu: 0, vv: 0, depth: 650, scene: 'line', capBlack: true,
    sun: { date: '2026-06-21', minutes: 14 * 60, lat: 48.857, lon: 2.352, north: 0, utc: 2, utcEdited: false },
    accent: new Set(), cards: [], sel: -1, base: null,
  };
  // raw sRGB values into the buffers: three's ColorManagement would linearise hex colours
  const raw = hex => new THREE.Color().setStyle(hex, THREE.LinearSRGBColorSpace);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
  cam.matrixAutoUpdate = true;
  let rect = null, baseRect = null, dMin = 1, dMax = 100, depthExtent = 1;
  let mrt = null, shadowRT = null, mrtKey = '';
  let idMats = new Map();
  const capPairs = [];
  let maskRT = null;
  const maskCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 10);
  const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
  let snapshot = null;
  let placing = null;
  const cardGroup = new THREE.Group();
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let quadMat = null;
  const raycaster = new THREE.Raycaster();
  const lightCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const shadowMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide, clippingPlanes: ctx.clipPlanes, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
  let lastSun = { L: new THREE.Vector3(0, 0, 1), el: 0, az: 0 };
  const handle = $('#spHandle');

  /* ---------- geometry helpers ---------- */
  function basis() {
    const e = new THREE.Vector3(); e.setComponent(AX[S.axis], 1);
    const W = e.clone().multiplyScalar(S.flip ? 1 : -1);
    const up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(W, up);
    return { e, W, up, right };
  }
  function meters() {
    const s = ctx.getState(); const u = s && s.unit;
    const f = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, dm: 0.1 }[u];
    if (f) return f;
    return s && s.box.getSize(new THREE.Vector3()).length() > 2000 ? 0.001 : 1;
  }
  function currentBox() {
    const s = ctx.getState();
    const b = ctx.computeBox(false);
    return b.isEmpty() ? s.box : b;
  }
  function computeBaseRect() {
    const s = ctx.getState(); if (!s) return;
    const box = currentBox();
    const { right, e, W } = basis();
    const pts = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new THREE.Vector3(x, y, z));
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const p of pts) { const u = p.dot(right); u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, p.z); v1 = Math.max(v1, p.z); }
    const mu = (u1 - u0) * 0.06 + 1e-6, mv = (v1 - v0) * 0.06 + 1e-6;
    baseRect = { u0: u0 - mu, u1: u1 + mu, v0: v0 - mv, v1: v1 + mv };
    depthExtent = Math.max(box.getSize(new THREE.Vector3()).dot(new THREE.Vector3(Math.abs(e.x), Math.abs(e.y), Math.abs(e.z))), 1e-6);
    fitRect();
  }
  function fitRect() {
    if (!baseRect) return;
    const asp = Math.max(0.1, (stage.clientWidth || 1) / (stage.clientHeight || 1));
    const cu = (baseRect.u0 + baseRect.u1) / 2, cv = (baseRect.v0 + baseRect.v1) / 2;
    let hw = (baseRect.u1 - baseRect.u0) / 2, hh = (baseRect.v1 - baseRect.v0) / 2;
    if (hw / hh < asp) hw = hh * asp; else hh = hw / asp;
    rect = { u0: cu - hw, u1: cu + hw, v0: cv - hh, v1: cv + hh };
    const ref = Math.max(depthExtent, 0.6 * (rect.u1 - rect.u0));
    dMin = ref * 0.5; dMax = ref * 120;
    S.vu = Math.min(rect.u1, Math.max(rect.u0, S.vu)); S.vv = Math.min(rect.v1, Math.max(rect.v0, S.vv));
  }
  function depthD() { return dMin * Math.pow(dMax / dMin, 1 - S.depth / 1000); }
  function setDefaultVP() {
    const s = ctx.getState();
    const m = meters();
    S.vu = (rect.u0 + rect.u1) / 2;
    const floor = currentBox().min.z;
    const eye = floor + 1.6 / m;
    S.vv = eye < rect.v1 ? eye : (rect.v0 + rect.v1) / 2;
    if (!s) return;
  }
  function updateCamera() {
    const { e, W, up, right } = basis();
    const cut = ctx.sliderValue(S.axis);
    const d = depthD();
    const eye = e.clone().multiplyScalar(cut).addScaledVector(right, S.vu).addScaledVector(up, S.vv).addScaledVector(W, -d);
    cam.position.copy(eye);
    cam.up.set(0, 0, 1);
    cam.lookAt(eye.clone().add(W));
    cam.updateMatrixWorld(true);
    const n = d * 0.5, f = d + depthExtent * 3 + (rect.u1 - rect.u0);
    const k = n / d;
    cam.near = n; cam.far = f;
    cam.projectionMatrix.makePerspective((rect.u0 - S.vu) * k, (rect.u1 - S.vu) * k, (rect.v1 - S.vv) * k, (rect.v0 - S.vv) * k, n, f);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.aspect = (rect.u1 - rect.u0) / (rect.v1 - rect.v0);
  }
  // screen position (css px, stage space) of a world point and its depth w behind the cut
  function project(P) {
    const v = P.clone().project(cam);
    return { x: (v.x + 1) / 2 * stage.clientWidth, y: (1 - v.y) / 2 * stage.clientHeight };
  }
  function cutScreen(u, v) { // cut-plane point (u,v) -> css px; independent of d by construction
    const W = stage.clientWidth, H = stage.clientHeight;
    return { x: (u - rect.u0) / (rect.u1 - rect.u0) * W, y: (rect.v1 - v) / (rect.v1 - rect.v0) * H };
  }
  function worldOnCut(u, v) {
    const { e, right } = basis();
    return e.clone().multiplyScalar(ctx.sliderValue(S.axis)).addScaledVector(right, u).add(new THREE.Vector3(0, 0, v));
  }

  /* ---------- sun ---------- */
  function sunPosition() {
    const sn = S.sun;
    const [yy, mm, dd] = sn.date.split('-').map(Number);
    const start = Date.UTC(yy, 0, 0), cur = Date.UTC(yy, mm - 1, dd);
    const doy = Math.round((cur - start) / 864e5);
    const hour = sn.minutes / 60;
    const g = 2 * Math.PI / 365 * (doy - 1 + (hour - 12) / 24);
    const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    const toff = eq + 4 * sn.lon - 60 * sn.utc;
    const tst = sn.minutes + toff;
    const ha = (tst / 4 - 180) * Math.PI / 180;
    const lat = sn.lat * Math.PI / 180;
    const cz = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
    const el = Math.PI / 2 - Math.acos(Math.max(-1, Math.min(1, cz)));
    let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) + Math.PI;
    const nr = sn.north * Math.PI / 180;
    // direction to the sun in the north frame (x = east, y = north), then rotate by the model north angle (ccw from +Y)
    const lx = Math.sin(az) * Math.cos(el), ly = Math.cos(az) * Math.cos(el), lz = Math.sin(el);
    const L = new THREE.Vector3(lx * Math.cos(nr) - ly * Math.sin(nr), lx * Math.sin(nr) + ly * Math.cos(nr), lz).normalize();
    lastSun = { L, el: el * 180 / Math.PI, az: ((az * 180 / Math.PI) % 360 + 360) % 360 };
    return lastSun;
  }
  function parisUtcOffset(dateStr) {
    try {
      const d = new Date(dateStr + 'T12:00:00Z');
      const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' }).formatToParts(d).find(x => x.type === 'timeZoneName');
      const m = p && /GMT([+-]\d+)/.exec(p.value);
      return m ? +m[1] : 1;
    } catch (e) { return 1; }
  }

  /* ---------- materials & render targets ---------- */
  function mkId(rgb) {
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: ID_VERT, fragmentShader: ID_FRAG, side: THREE.DoubleSide, clipping: true,
      uniforms: { uId: { value: new THREE.Vector3(...rgb.map(v => v / 255)) }, uFill: { value: new THREE.Color(1, 1, 1) }, uCap: { value: 0 } },
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
    m.clippingPlanes = ctx.clipPlanes;
    return m;
  }
  function buildIdMats() {
    disposeIdMats();
    const s = ctx.getState(); let i = 1;
    for (const o of s.sources) if (o.isMesh) {
      const id = i++;
      idMats.set(o, mkId([(id >> 16) & 255, (id >> 8) & 255, id & 255]));
    }
  }
  function disposeIdMats() { idMats.forEach(m => m.dispose()); idMats = new Map(); }
  // cap = the cut shape, taken from an orthographic stencil pass along the view axis so it cannot change with d.
  function capMaterial(planes) {
    const m = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: CAP_VERT, fragmentShader: CAP_FRAG, side: THREE.DoubleSide, clipping: true,
      uniforms: { uId: { value: new THREE.Vector3(...CAP_ID.map(v => v / 255)) }, uFill: { value: raw(S.capBlack ? INK : '#ffffff') }, uMask: { value: null }, uRightV: { value: new THREE.Vector3(1, 0, 0) }, uRect: { value: new THREE.Vector4() } },
    });
    m.clippingPlanes = planes;
    const mk = new THREE.MeshBasicMaterial({
      color: 0xffffff, side: THREE.DoubleSide, clippingPlanes: planes,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    });
    const pair = { mrt: m, mask: mk };
    capPairs.push(pair);
    const od = m.dispose.bind(m);
    m.dispose = () => { od(); mk.dispose(); const i = capPairs.indexOf(pair); if (i >= 0) capPairs.splice(i, 1); };
    return m;
  }
  function ensureMask(w, h) {
    if (maskRT && maskRT.width === w && maskRT.height === h) return;
    if (maskRT) maskRT.dispose();
    maskRT = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, stencilBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  }
  function ensureMRT(w, h) {
    const key = w + 'x' + h;
    if (mrt && mrtKey === key) return;
    disposeMRT();
    mrt = new THREE.WebGLMultipleRenderTargets(w, h, 3, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: true, stencilBuffer: true });
    const dt = new THREE.DepthTexture(w, h);
    dt.format = THREE.DepthStencilFormat; dt.type = THREE.UnsignedInt248Type;
    dt.minFilter = THREE.NearestFilter; dt.magFilter = THREE.NearestFilter;
    mrt.depthTexture = dt;
    mrtKey = key;
  }
  function disposeMRT() { if (mrt) { mrt.dispose(); if (mrt.depthTexture) mrt.depthTexture.dispose(); mrt = null; mrtKey = ''; } }
  function ensureShadowRT(size) {
    if (shadowRT && shadowRT.width === size) return;
    if (shadowRT) { shadowRT.dispose(); shadowRT.depthTexture.dispose(); }
    shadowRT = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
    shadowRT.depthTexture = new THREE.DepthTexture(size, size);
    shadowRT.depthTexture.minFilter = THREE.NearestFilter; shadowRT.depthTexture.magFilter = THREE.NearestFilter;
  }
  function ensureQuad() {
    if (quadMat) return;
    const vec = raw;
    quadMat = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: QUAD_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tId: { value: null }, tNor: { value: null }, tFill: { value: null }, tDepth: { value: null }, tShadow: { value: null },
        uMrt: { value: new THREE.Vector2() }, uSS: { value: 2 }, uKS: { value: 2 }, uLmax: { value: 3 },
        uPInv: { value: new THREE.Matrix4() }, uNear: { value: 1 }, uFar: { value: 10 }, uP00: { value: 1 }, uP11: { value: 1 }, uCut: { value: 0 }, uWRange: { value: 1 },
        uRs0: { value: 1.1 }, uRs1: { value: 0.45 }, uRc0: { value: 0.6 }, uRc1: { value: 0.3 }, uCreaseCos: { value: Math.cos(30 * Math.PI / 180) }, uTransparent: { value: 0 },
        uInk: { value: new THREE.Vector3(...[...vec(INK).toArray()]) }, uGray: { value: new THREE.Vector3(...vec(FAR_GRAY).toArray()) },
        uShadeCol: { value: new THREE.Vector3(...vec(SHADOW).toArray()) }, uCapId: { value: new THREE.Vector3(...CAP_ID.map(v => v / 255)) }, uCardId: { value: new THREE.Vector3(...CARD_ID.map(v => v / 255)) },
        uL: { value: new THREE.Vector3(0, 0, 1) }, uSun: { value: 0 }, uLVP: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uLBias: { value: 0.002 }, uSmap: { value: 2048 },
      },
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const m = new THREE.Mesh(g, quadMat); m.frustumCulled = false;
    quadScene.add(m);
  }

  /* ---------- pass helpers ---------- */
  function withPass(opts, fn) {
    const s = ctx.getState();
    const saved = [];
    for (const o of s.sources) {
      const rec = { o, mat: o.material, vis: o.visible, ed: o.userData.edges ? o.userData.edges.visible : null };
      saved.push(rec);
      if (o.userData.edges) o.userData.edges.visible = false;
      if (!o.isMesh) o.visible = false;
      else if (opts.hide) o.material = hiddenMat;
      else if (opts.ids) o.material = idMats.get(o) || o.material;
    }
    const caps = ctx.capObjects();
    const capVis = caps.map(c => [c, c.cap && c.cap.visible, c.parts.map(p => p.visible)]);
    if (!opts.caps) for (const c of caps) { if (c.cap) c.cap.visible = false; c.parts.forEach(p => { p.visible = false; }); }
    if (opts.caps && !opts.mask) for (const c of caps) c.parts.forEach(p => { p.visible = false; });
    const mg = ctx.measureGroup(); const mgv = mg ? mg.visible : null; if (mg) mg.visible = false;
    const cv = cardGroup.visible; cardGroup.visible = !!opts.cards;
    try { fn(); } finally {
      for (const r of saved) { r.o.material = r.mat; r.o.visible = r.vis; if (r.o.userData.edges) r.o.userData.edges.visible = r.ed; }
      for (const [c, cvis, pv] of capVis) { if (c.cap) c.cap.visible = cvis; c.parts.forEach((p, i) => { p.visible = pv[i]; }); }
      if (mg) mg.visible = mgv;
      cardGroup.visible = cv;
    }
  }
  function fillFor(o) {
    if (S.scene !== 'program') return '#ffffff';
    const li = o.userData.layer;
    return S.accent.has(li) ? ACCENT : GRAYS[li % GRAYS.length];
  }
  function renderShadow(box) {
    const size = renderer.capabilities.maxTextureSize >= 4096 ? 4096 : 2048;
    ensureShadowRT(size);
    const sun = lastSun;
    const c = box.getCenter(new THREE.Vector3());
    const rad = box.getSize(new THREE.Vector3()).length() / 2 + 1e-6;
    lightCam.position.copy(c).addScaledVector(sun.L, rad * 2);
    lightCam.up.set(Math.abs(sun.L.z) > 0.98 ? 0 : 0, Math.abs(sun.L.z) > 0.98 ? 1 : 0, Math.abs(sun.L.z) > 0.98 ? 0 : 1);
    lightCam.lookAt(c);
    lightCam.updateMatrixWorld(true);
    const inv = lightCam.matrixWorldInverse.copy(lightCam.matrixWorld).invert();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    lightCam.left = x0; lightCam.right = x1; lightCam.bottom = y0; lightCam.top = y1;
    lightCam.near = -z1 - rad * 0.05; lightCam.far = -z0 + rad * 0.05;
    lightCam.updateProjectionMatrix();
    withPass({ ids: false, caps: false, cards: false }, () => {
      scene.overrideMaterial = shadowMat;
      renderer.setRenderTarget(shadowRT);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear(true, true, true);
      renderer.render(scene, lightCam);
      scene.overrideMaterial = null;
      renderer.setRenderTarget(null);
    });
    const vp = new THREE.Matrix4().multiplyMatrices(lightCam.projectionMatrix, lightCam.matrixWorldInverse);
    return { vp, size, range: lightCam.far - lightCam.near };
  }

  // only closed meshes may feed the cap: an open surface would fill the whole ray with black
  function isCappable(o) {
    if (o.userData.closed !== undefined) return o.userData.closed;
    let ok = false;
    try {
      const g = o.geometry, pos = g.attributes.position;
      if (pos && pos.count >= 4) {
        g.computeBoundingBox();
        const q = Math.max(g.boundingBox.getSize(new THREE.Vector3()).length() * 1e-6, 1e-9);
        const ids = new Map(); const vid = new Int32Array(pos.count);
        for (let i = 0; i < pos.count; i++) {
          const key = Math.round(pos.getX(i) / q) + ',' + Math.round(pos.getY(i) / q) + ',' + Math.round(pos.getZ(i) / q);
          let id = ids.get(key); if (id === undefined) { id = ids.size; ids.set(key, id); } vid[i] = id;
        }
        const idx = g.index; const tri = idx ? idx.count / 3 : pos.count / 3;
        const edges = new Map();
        const add = (a, b) => { if (a === b) return; const k = a < b ? a * 4294967296 + b : b * 4294967296 + a; edges.set(k, (edges.get(k) || 0) + 1); };
        for (let f = 0; f < tri; f++) {
          const a = vid[idx ? idx.getX(f * 3) : f * 3], b = vid[idx ? idx.getX(f * 3 + 1) : f * 3 + 1], c = vid[idx ? idx.getX(f * 3 + 2) : f * 3 + 2];
          add(a, b); add(b, c); add(c, a);
        }
        ok = edges.size > 0;
        for (const n of edges.values()) if (n & 1) { ok = false; break; }
      }
    } catch (e) { ok = false; }
    o.userData.closed = ok;
    return ok;
  }

  /* ---------- the render ---------- */
  function render(opts = {}) {
    const s = ctx.getState();
    if (!S.on || !s || !rect) return;
    const gl = renderer.getContext();
    if (!gl || !(gl instanceof WebGL2RenderingContext)) return;
    ensureQuad();
    updateCamera();
    const outW = renderer.domElement.width, outH = renderer.domElement.height;
    if (!outW || !outH) return;
    const maxDim = Math.min(8192, renderer.capabilities.maxTextureSize || 4096);
    let ss = opts.ss || ((outW * outH * 4 <= 24e6 && outW * 2 <= maxDim && outH * 2 <= maxDim) ? 2 : 1);
    const mw = outW * ss, mh = outH * ss;
    ensureMRT(mw, mh);
    const k = outW / Math.max(1, stage.clientWidth);
    const box = currentBox();
    // fills
    for (const [o, m] of idMats) m.uniforms.uFill.value.copy(raw(fillFor(o)));
    let sh = null;
    const sunOn = S.scene === 'sun';
    if (sunOn) { sunPosition(); if (lastSun.el > 0.5) sh = renderShadow(box); updateSunInfo(); }
    const prevClear = new THREE.Color(); renderer.getClearColor(prevClear); const prevA = renderer.getClearAlpha();
    if (ctx.capObjects().length) {
      ensureMask(mw, mh);
      const { e, W, right } = basis();
      const ext = depthExtent * 3 + (rect.u1 - rect.u0);
      const eps = Math.max(ext * 1e-4, 1e-6);
      maskCam.position.copy(e).multiplyScalar(ctx.sliderValue(S.axis)).addScaledVector(W, -eps);
      maskCam.up.set(0, 0, 1); maskCam.lookAt(maskCam.position.clone().add(W));
      maskCam.left = rect.u0; maskCam.right = rect.u1; maskCam.bottom = rect.v0; maskCam.top = rect.v1; maskCam.near = eps * 0.5; maskCam.far = ext;
      maskCam.updateProjectionMatrix(); maskCam.updateMatrixWorld(true);
      const caps = ctx.capObjects();
      const swapped = [];
      for (const c of caps) { const pr = capPairs.find(x => x.mrt === c.cap.material); if (pr) { swapped.push([c.cap, pr.mrt]); c.cap.material = pr.mask; } }
      withPass({ ids: false, caps: true, mask: true, hide: true, cards: false }, () => {
        renderer.setRenderTarget(maskRT);
        renderer.setClearColor(0x000000, 0);
        renderer.clear(true, true, true);
        renderer.render(scene, maskCam);
        renderer.setRenderTarget(null);
      });
      for (const [cap, mat] of swapped) { cap.material = mat; mat.uniforms.uMask.value = maskRT.texture; mat.uniforms.uRightV.value.copy(right); mat.uniforms.uRect.value.set(rect.u0, rect.u1, rect.v0, rect.v1); }
    }
    const prevAuto = renderer.autoClear;
    withPass({ ids: true, caps: true, cards: true }, () => {
      renderer.setRenderTarget(mrt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      renderer.render(scene, cam);
      renderer.setRenderTarget(null);
    });
    const u = quadMat.uniforms;
    u.tId.value = mrt.texture[0]; u.tNor.value = mrt.texture[1]; u.tFill.value = mrt.texture[2]; u.tDepth.value = mrt.depthTexture;
    u.uMrt.value.set(mw, mh); u.uSS.value = ss; u.uKS.value = k * ss;
    u.uLmax.value = Math.min(16, Math.max(1, Math.ceil(1.1 * k * ss + 0.001)));
    u.uPInv.value.copy(cam.projectionMatrixInverse); u.uNear.value = cam.near; u.uFar.value = cam.far;
    u.uP00.value = cam.projectionMatrix.elements[0]; u.uP11.value = cam.projectionMatrix.elements[5];
    u.uCut.value = depthD(); u.uWRange.value = depthExtent;
    u.uTransparent.value = opts.transparent ? 1 : 0;
    u.uCamWorld.value.copy(cam.matrixWorld);
    if (sunOn) {
      u.uL.value.copy(lastSun.L);
      if (sh) { u.uSun.value = 1; u.tShadow.value = shadowRT.depthTexture; u.uLVP.value.copy(sh.vp); u.uSmap.value = sh.size; u.uLBias.value = 0.0015; }
      else { u.uSun.value = 2; u.tShadow.value = mrt.depthTexture; }
    } else { u.uSun.value = 0; u.tShadow.value = mrt.depthTexture; }
    renderer.setClearColor(0xffffff, opts.transparent ? 0 : 1);
    renderer.autoClear = true;
    renderer.render(quadScene, quadCam);
    renderer.setClearColor(prevClear, prevA);
    renderer.autoClear = prevAuto;
    positionHandle();
  }

  /* ---------- UI ---------- */
  function positionHandle() {
    if (!S.on || !rect) { handle.hidden = true; return; }
    const p = cutScreen(S.vu, S.vv);
    handle.hidden = false;
    handle.style.left = p.x + 'px'; handle.style.top = p.y + 'px';
    const m = meters();
    const floor = ctx.getState().box.min.z;
    $('#spEye').textContent = t('spEye', { h: ((S.vv - floor) * m).toFixed(1), d: (depthD() * m).toFixed(1) });
  }
  function updateSunInfo() {
    $('#sunInfo').textContent = lastSun.el > 0 ? t('sunInfo', { el: lastSun.el.toFixed(0), az: lastSun.az.toFixed(0) }) : t('sunNight');
  }
  function syncFromSections() {
    if (!S.on) return;
    const row = $(`.sec-row[data-axis="${S.axis}"] .sec-range`);
    if (row) { $('#spPos').value = row.value; }
    $('#spPosVal').textContent = ctx.getState() ? S.axis.toUpperCase() + ' = ' + ctx.fmt(ctx.sliderValue(S.axis)) + (ctx.getState().unit ? ' ' + ctx.getState().unit : '') : '';
  }
  function reapplyAxisSection() {
    const a = S.axis;
    const sc = ctx.sec[a];
    sc.on = true; sc.flip = S.flip;
    ctx.setSectionRows();
    ctx.updatePlanes(); ctx.updateSectionLabels(); ctx.rebuildCaps();
  }
  function setScene(name) {
    S.scene = name;
    $$('#spSceneSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scene === name)));
    $('#spSunBox').hidden = name !== 'sun';
    $('#spProgBox').hidden = name !== 'program';
    $('#spLegend').hidden = name !== 'program';
    if (name === 'explode') {
      if (ctx.explode.st.gap <= 0) { ctx.explode.set({ kind: 'floors', gap: 0.35 }); ctx.syncExplodeUI(); }
      toastOnce();
    }
    if (name === 'program') buildProgramUI();
    ctx.requestRender();
  }
  let toasted = false;
  function toastOnce() { toasted = true; }
  function buildProgramUI() {
    const s = ctx.getState(); if (!s) return;
    const box = $('#spProgList'); box.textContent = '';
    const legend = $('#spLegend'); legend.textContent = '';
    const used = [...new Set(s.sources.map(o => o.userData.layer))];
    if (!S.accent.size && used.length && !S.accentInit) { S.accent.add(used[0]); }
    S.accentInit = true;
    for (const li of used) {
      const L = s.layers[li];
      const row = document.createElement('label'); row.className = 'chk wide prog-row';
      const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = S.accent.has(li);
      cb.addEventListener('change', () => { if (cb.checked) S.accent.add(li); else S.accent.delete(li); buildProgramUI(); ctx.requestRender(); });
      const sw = document.createElement('span'); sw.className = 'sw';
      sw.style.background = S.accent.has(li) ? ACCENT : GRAYS[li % GRAYS.length];
      const nm = document.createElement('span'); nm.textContent = L ? L.name : '#' + li;
      row.append(cb, sw, nm);
      box.append(row);
      const lg = document.createElement('div'); lg.className = 'lg-row';
      const s2 = document.createElement('span'); s2.className = 'sw'; s2.style.background = sw.style.background;
      const n2 = document.createElement('span'); n2.textContent = L ? L.name : '#' + li;
      lg.append(s2, n2); legend.append(lg);
    }
  }
  function setAxis(a) {
    S.axis = a;
    $$('#spAxis button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.axis === a)));
    computeBaseRect(); setDefaultVP();
    reapplyAxisSection();
    syncFromSections();
    ctx.requestRender();
  }
  function onModelChange() {
    if (!S.on || !ctx.getState()) return;
    computeBaseRect();
    ctx.requestRender();
  }
  function onResize() {
    if (!S.on) return;
    fitRect();
    ctx.requestRender();
  }

  /* ---------- enter / exit ---------- */
  function enter() {
    const s = ctx.getState();
    if (!s) { ctx.toast(t('spNeed')); return false; }
    if (!(renderer.getContext() instanceof WebGL2RenderingContext)) { ctx.toast(t('spRenderFail')); return false; }
    if (ctx.measureOn()) ctx.setMeasure(false);
    if (ctx.clearSelection) ctx.clearSelection();
    snapshot = { view: ctx.saveView(), sec: ctx.getSecSnapshot(), exGap: ctx.explode.st.gap };
    const sc = ctx.sec;
    S.axis = (sc.x.on && !sc.y.on) ? 'x' : 'y';
    S.flip = sc[S.axis].on ? sc[S.axis].flip : true;
    S.on = true;
    ctx.app.classList.add('sp-on');
    $$('#spAxis button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.axis === S.axis)));
    $('#secSP').hidden = false; $('#secSP').open = true;
    $('#spBtn').setAttribute('aria-pressed', 'true');
    ctx.controlsEnabled(false);
    buildIdMats();
    scene.add(cardGroup);
    for (const c of S.cards) { if (!c.mesh) buildCardMesh(c); }
    computeBaseRect(); setDefaultVP();
    reapplyAxisSection();
    syncFromSections();
    setScene(S.scene);
    $('#spCapBlack').checked = S.capBlack;
    S.sun.utc = S.sun.utcEdited ? S.sun.utc : parisUtcOffset(S.sun.date);
    syncSunUI();
    refreshCardList();
    ctx.requestRender();
    return true;
  }
  function exit() {
    if (!S.on) return;
    S.on = false;
    ctx.app.classList.remove('sp-on');
    $('#spBtn').setAttribute('aria-pressed', 'false');
    $('#spHandle').hidden = true;
    $('#spLegend').hidden = true;
    scene.remove(cardGroup);
    if (ctx.getState()) {
      ctx.setSecSnapshot(snapshot.sec);
      ctx.restoreView(snapshot.view);
      ctx.explode.set({ gap: snapshot.exGap }); ctx.syncExplodeUI();
    }
    ctx.controlsEnabled(true);
    disposeIdMats(); disposeMRT();
    if (shadowRT) { shadowRT.dispose(); shadowRT.depthTexture.dispose(); shadowRT = null; }
    placing = null; canvas.style.cursor = '';
    ctx.rebuildCaps();
    ctx.requestRender();
  }
  function reset() { // new model loaded or old one disposed
    if (S.on) { S.on = false; ctx.app.classList.remove('sp-on'); $('#spBtn').setAttribute('aria-pressed', 'false'); $('#spHandle').hidden = true; $('#spLegend').hidden = true; scene.remove(cardGroup); ctx.controlsEnabled(true); canvas.style.cursor = ''; }
    disposeIdMats(); disposeMRT();
    for (const c of S.cards) disposeCard(c);
    S.cards = []; S.sel = -1; S.accent = new Set(); S.accentInit = false; baseRect = null; rect = null; placing = null;
    $('#secSP').hidden = true;
    refreshCardList();
  }
  function capWanted() { return S.on; }

  /* ---------- entourage cards ---------- */
  function processCardImage(img) {
    const maxS = 1024;
    const sc = Math.min(1, maxS / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(2, Math.round(img.naturalWidth * sc)), h = Math.max(2, Math.round(img.naturalHeight * sc));
    // pad by 3 px so the flood fill can reach every outside pixel
    const pad = 3, W = w + pad * 2, H = h + pad * 2;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, pad, pad, w, h);
    const id = cx.getImageData(0, 0, W, H), d = id.data;
    const stroke = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) stroke[i] = d[i * 4 + 3] > 24 ? 1 : 0;
    // dilate by 2 px to close small gaps before flood filling the outside
    let cur = stroke;
    for (let r = 0; r < 2; r++) {
      const nx = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (cur[i] || (x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) || (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W])) nx[i] = 1;
      }
      cur = nx;
    }
    const outside = new Uint8Array(W * H);
    const stack = [0];
    outside[0] = 1;
    while (stack.length) {
      const i = stack.pop(); const x = i % W, y = (i - x) / W;
      const tryPush = j => { if (!outside[j] && !cur[j]) { outside[j] = 1; stack.push(j); } };
      if (x > 0) tryPush(i - 1); if (x < W - 1) tryPush(i + 1); if (y > 0) tryPush(i - W); if (y < H - 1) tryPush(i + W);
    }
    const out = cx.createImageData(W, H), o = out.data;
    for (let i = 0; i < W * H; i++) {
      if (outside[i]) { o[i * 4 + 3] = 0; continue; }
      const a = d[i * 4 + 3] / 255;
      o[i * 4] = Math.round(255 * (1 - a) + d[i * 4] * a);
      o[i * 4 + 1] = Math.round(255 * (1 - a) + d[i * 4 + 1] * a);
      o[i * 4 + 2] = Math.round(255 * (1 - a) + d[i * 4 + 2] * a);
      o[i * 4 + 3] = 255;
    }
    cx.putImageData(out, 0, 0);
    return cv;
  }
  function buildCardMesh(c) {
    const tex = new THREE.CanvasTexture(c.canvas);
    tex.colorSpace = THREE.NoColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.anisotropy = 4;
    const mat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: CARD_VERT, fragmentShader: CARD_FRAG, side: THREE.DoubleSide, uniforms: { map: { value: tex }, uId: { value: new THREE.Vector3(...CARD_ID.map(v => v / 255)) } } });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.frustumCulled = false; mesh.renderOrder = 30; mesh.userData.card = c;
    c.mesh = mesh; c.tex = tex;
    cardGroup.add(mesh);
    placeCardMesh(c);
  }
  function placeCardMesh(c) {
    const m = meters();
    const { e, W, up, right } = basis();
    const h = c.hM / m, w = h * c.aspect;
    c.mesh.scale.set(w * (c.flip ? -1 : 1), h, 1);
    const cutPt = e.clone().multiplyScalar(ctx.sliderValue(S.axis));
    const pos = cutPt.addScaledVector(right, c.u).addScaledVector(W, c.w).addScaledVector(up, c.v + h / 2);
    c.mesh.position.copy(pos);
    const mx = new THREE.Matrix4().makeBasis(right, up, W.clone().negate());
    c.mesh.quaternion.setFromRotationMatrix(mx);
  }
  function disposeCard(c) { if (c.mesh) { cardGroup.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh.material.dispose(); c.tex && c.tex.dispose(); c.mesh = null; } }
  function addCardFromFile(file) {
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        const cv = processCardImage(img);
        placing = { dataUrl: rd.result, canvas: cv, aspect: cv.width / cv.height, name: file.name.replace(/\.[^.]+$/, '') };
        canvas.style.cursor = 'copy';
        ctx.toast(t('entPlace'), 4000);
        if (matchMedia('(max-width: 720px)').matches) ctx.setPanel(false);
      };
      img.onerror = () => ctx.toast(t('entBadImg'));
      img.src = rd.result;
    };
    rd.onerror = () => ctx.toast(t('entBadImg'));
    rd.readAsDataURL(file);
  }
  function addCard(data, u, v, w) {
    const c = { name: data.name, dataUrl: data.dataUrl, canvas: data.canvas, aspect: data.aspect, hM: data.hM || 1.75, flip: !!data.flip, u, v, w };
    S.cards.push(c); buildCardMesh(c); S.sel = S.cards.length - 1; refreshCardList(); ctx.requestRender();
  }
  function ndcOf(ev) { const r = canvas.getBoundingClientRect(); return new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); }
  function pickFloor(ev) {
    const s = ctx.getState();
    raycaster.setFromCamera(ndcOf(ev), cam);
    const targets = s.sources.filter(o => o.isMesh && o.visible);
    const hits = raycaster.intersectObjects(targets, false).filter(h => ctx.pointInClip(h.point));
    const { e, W, right } = basis();
    if (hits.length) { const p = hits[0].point; return { u: p.dot(right), v: p.z, w: W.dot(p.clone().sub(e.clone().multiplyScalar(ctx.sliderValue(S.axis)))) }; }
    // ground plane at box floor
    const floor = currentBox().min.z;
    const pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -floor);
    const p = raycaster.ray.intersectPlane(pl, new THREE.Vector3());
    if (!p) return null;
    return { u: p.dot(right), v: floor, w: W.dot(p.clone().sub(e.clone().multiplyScalar(ctx.sliderValue(S.axis)))) };
  }
  function pickCard(ev) {
    raycaster.setFromCamera(ndcOf(ev), cam);
    const hits = raycaster.intersectObjects(cardGroup.children, false);
    for (const h of hits) {
      const c = h.object.userData.card;
      const uv = h.uv; const x = Math.min(c.canvas.width - 1, Math.max(0, Math.floor((c.flip ? 1 - uv.x : uv.x) * c.canvas.width)));
      const y = Math.min(c.canvas.height - 1, Math.max(0, Math.floor((1 - uv.y) * c.canvas.height)));
      const a = c.canvas.getContext('2d', { willReadFrequently: true }).getImageData(x, y, 1, 1).data[3];
      if (a > 128) return c;
    }
    return null;
  }
  let drag = null;
  canvas.addEventListener('pointerdown', ev => {
    if (!S.on) return;
    if (placing && (ev.pointerType !== 'mouse' || ev.button === 0)) {
      const f = pickFloor(ev);
      if (f) { addCard({ ...placing, hM: +$('#entH').value || 1.75 }, f.u, f.v, Math.max(0, f.w)); placing = null; canvas.style.cursor = ''; }
      ev.stopImmediatePropagation(); return;
    }
    const c = pickCard(ev);
    if (c) {
      S.sel = S.cards.indexOf(c); refreshCardList();
      const { e, W, right } = basis();
      drag = { c, id: ev.pointerId, shift: ev.shiftKey };
      const pl = new THREE.Plane(); pl.setFromNormalAndCoplanarPoint(W, c.mesh.position);
      const hit = (() => { raycaster.setFromCamera(ndcOf(ev), cam); return raycaster.ray.intersectPlane(pl, new THREE.Vector3()); })();
      drag.off = hit ? { u: c.u - hit.dot(right), v: c.v - hit.z } : { u: 0, v: 0 };
      canvas.setPointerCapture(ev.pointerId);
      ev.stopImmediatePropagation(); ev.preventDefault();
    }
  }, true);
  canvas.addEventListener('pointermove', ev => {
    if (!drag || ev.pointerId !== drag.id) return;
    const { e, W, right } = basis();
    raycaster.setFromCamera(ndcOf(ev), cam);
    const c = drag.c;
    if (ev.shiftKey) {
      const base = c.mesh.position.clone(); base.z = c.v;
      const pl = new THREE.Plane(new THREE.Vector3(0, 0, 1), -c.v);
      const p = raycaster.ray.intersectPlane(pl, new THREE.Vector3());
      if (p) { c.w = Math.max(0, W.dot(p.clone().sub(e.clone().multiplyScalar(ctx.sliderValue(S.axis))))); c.u = p.dot(right); }
    } else {
      const pl = new THREE.Plane(); pl.setFromNormalAndCoplanarPoint(W, c.mesh.position);
      const p = raycaster.ray.intersectPlane(pl, new THREE.Vector3());
      if (p) { c.u = p.dot(right) + drag.off.u; c.v = p.z + drag.off.v; }
    }
    placeCardMesh(c); ctx.requestRender();
  });
  const endDrag = ev => { if (drag && ev.pointerId === drag.id) { try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ } drag = null; } };
  canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);

  function refreshCardList() {
    const ul = $('#entList'); ul.textContent = '';
    $('#entEmpty').hidden = S.cards.length > 0;
    S.cards.forEach((c, i) => {
      const li = document.createElement('li'); li.className = 'ent-item' + (i === S.sel ? ' sel' : '');
      const nm = document.createElement('button'); nm.type = 'button'; nm.className = 'btn sm ent-name'; nm.textContent = c.name || t('entItem', { n: i + 1 });
      nm.addEventListener('click', () => { S.sel = i; refreshCardList(); });
      const h = document.createElement('input'); h.type = 'number'; h.min = '0.1'; h.max = '40'; h.step = '0.05'; h.value = c.hM; h.setAttribute('aria-label', t('entH'));
      h.addEventListener('input', () => { const v = +h.value; if (v > 0) { c.hM = v; placeCardMesh(c); ctx.requestRender(); } });
      const fl = document.createElement('button'); fl.type = 'button'; fl.className = 'btn sm'; fl.textContent = t('entFlip'); fl.setAttribute('aria-pressed', String(c.flip));
      fl.addEventListener('click', () => { c.flip = !c.flip; placeCardMesh(c); fl.setAttribute('aria-pressed', String(c.flip)); ctx.requestRender(); });
      const del = document.createElement('button'); del.type = 'button'; del.className = 'btn sm'; del.textContent = t('entDel');
      del.addEventListener('click', () => { disposeCard(c); S.cards.splice(i, 1); S.sel = -1; refreshCardList(); ctx.requestRender(); });
      li.append(nm, h, fl, del); ul.append(li);
    });
  }

  /* ---------- vanishing point handle ---------- */
  let hdrag = null;
  handle.addEventListener('pointerdown', ev => { hdrag = { id: ev.pointerId }; handle.setPointerCapture(ev.pointerId); ev.preventDefault(); ev.stopPropagation(); });
  handle.addEventListener('pointermove', ev => {
    if (!hdrag || !S.on || !rect) return;
    const r = stage.getBoundingClientRect();
    const fx = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), fy = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
    S.vu = rect.u0 + fx * (rect.u1 - rect.u0); S.vv = rect.v1 - fy * (rect.v1 - rect.v0);
    ctx.requestRender();
  });
  const hend = ev => { if (hdrag) { try { handle.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ } hdrag = null; } };
  handle.addEventListener('pointerup', hend); handle.addEventListener('pointercancel', hend);
  handle.addEventListener('keydown', ev => {
    if (!S.on || !rect) return;
    const du = (rect.u1 - rect.u0) * 0.02, dv = (rect.v1 - rect.v0) * 0.02;
    const k = ev.key;
    if (k === 'ArrowLeft') S.vu -= du; else if (k === 'ArrowRight') S.vu += du; else if (k === 'ArrowUp') S.vv += dv; else if (k === 'ArrowDown') S.vv -= dv; else return;
    S.vu = Math.min(rect.u1, Math.max(rect.u0, S.vu)); S.vv = Math.min(rect.v1, Math.max(rect.v0, S.vv));
    ev.preventDefault(); ctx.requestRender();
  });

  /* ---------- export & JSON ---------- */
  function exportBlob(k, transparent) {
    // caller has already set pixel ratio k and size; render with the larger MRT budget
    return new Promise(res => {
      const outW = canvas.width, outH = canvas.height;
      const maxDim = Math.min(8192, renderer.capabilities.maxTextureSize || 4096);
      const ss = (outW * outH * 4 <= 24e6 && outW * 2 <= maxDim && outH * 2 <= maxDim) ? 2 : 1;
      render({ ss, transparent });
      canvas.toBlob(res, 'image/png');
    });
  }
  function toJSON() {
    const s = ctx.getState();
    return {
      app: 'atelier-view', kind: 'section-perspective', version: 1, model: s ? s.name : null,
      axis: S.axis, flip: S.flip, position: ctx.sec[S.axis].v, vanishing: { u: S.vu, v: S.vv }, depth: S.depth, scene: S.scene, capBlack: S.capBlack,
      sun: { ...S.sun }, accent: [...S.accent],
      explode: { kind: ctx.explode.st.kind, dir: ctx.explode.st.dir, gap: ctx.explode.st.gap },
      cards: S.cards.map(c => ({ name: c.name, dataUrl: c.dataUrl, hM: c.hM, flip: c.flip, u: c.u, v: c.v, w: c.w, aspect: c.aspect })),
    };
  }
  async function fromJSON(j) {
    if (!j || j.kind !== 'section-perspective') throw new Error('bad');
    if (!S.on && !enter()) return;
    S.axis = j.axis === 'x' ? 'x' : 'y'; S.flip = !!j.flip; S.depth = +j.depth || 650; S.capBlack = j.capBlack !== false;
    ctx.sec[S.axis].v = Math.max(0, Math.min(1000, +j.position || 500));
    $$('#spAxis button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.axis === S.axis)));
    $('#spDepth').value = S.depth; $('#spCapBlack').checked = S.capBlack;
    if (j.sun) Object.assign(S.sun, j.sun);
    S.accent = new Set(j.accent || []); S.accentInit = true;
    if (j.explode) ctx.explode.set({ kind: j.explode.kind, dir: j.explode.dir, gap: j.explode.gap });
    ctx.syncExplodeUI(); syncSunUI();
    const sec = ctx.sec[S.axis]; $(`.sec-row[data-axis="${S.axis}"] .sec-range`).value = sec.v;
    computeBaseRect();
    S.vu = j.vanishing ? +j.vanishing.u : S.vu; S.vv = j.vanishing ? +j.vanishing.v : S.vv;
    reapplyAxisSection();
    for (const c of S.cards) disposeCard(c);
    S.cards = [];
    for (const c of j.cards || []) {
      await new Promise(r => { const img = new Image(); img.onload = () => { const cv = processCardImage(img); const cc = { name: c.name, dataUrl: c.dataUrl, canvas: cv, aspect: c.aspect || cv.width / cv.height, hM: c.hM || 1.75, flip: !!c.flip, u: c.u, v: c.v, w: c.w }; S.cards.push(cc); buildCardMesh(cc); r(); }; img.onerror = r; img.src = c.dataUrl; });
    }
    refreshCardList(); syncFromSections(); setScene(j.scene || 'line'); ctx.requestRender();
  }

  /* ---------- wiring ---------- */
  function syncSunUI() {
    const sn = S.sun;
    $('#sunDate').value = sn.date; $('#sunTime').value = sn.minutes; $('#sunLat').value = sn.lat; $('#sunLon').value = sn.lon; $('#sunNorth').value = sn.north; $('#sunUtc').value = sn.utc;
    $('#sunTimeVal').textContent = String(Math.floor(sn.minutes / 60)).padStart(2, '0') + ':' + String(sn.minutes % 60).padStart(2, '0');
  }
  $('#spBtn').addEventListener('click', () => { if (S.on) exit(); else enter(); });
  $$('#spAxis button').forEach(b => b.addEventListener('click', () => { if (S.on) setAxis(b.dataset.axis); }));
  $('#spFlip').addEventListener('click', () => { if (!S.on) return; S.flip = !S.flip; computeBaseRect(); reapplyAxisSection(); ctx.requestRender(); });
  $('#spPos').addEventListener('input', e => {
    if (!S.on) return;
    const row = $(`.sec-row[data-axis="${S.axis}"] .sec-range`);
    row.value = e.target.value; row.dispatchEvent(new Event('input', { bubbles: true }));
    syncFromSections();
  });
  $('#spDepth').addEventListener('input', e => { S.depth = +e.target.value; ctx.requestRender(); });
  $('#spCapBlack').addEventListener('change', e => { S.capBlack = e.target.checked; ctx.rebuildCaps(); });
  $$('#spSceneSeg button').forEach(b => b.addEventListener('click', () => { if (S.on) setScene(b.dataset.scene); }));
  const sunIn = (id, fn) => $(id).addEventListener('input', e => { fn(e.target); syncSunUI(); ctx.requestRender(); });
  sunIn('#sunDate', el => { if (el.value) { S.sun.date = el.value; if (!S.sun.utcEdited) S.sun.utc = parisUtcOffset(el.value); } });
  sunIn('#sunTime', el => { S.sun.minutes = +el.value; });
  sunIn('#sunLat', el => { const v = parseFloat(el.value); if (isFinite(v)) S.sun.lat = Math.max(-89, Math.min(89, v)); });
  sunIn('#sunLon', el => { const v = parseFloat(el.value); if (isFinite(v)) S.sun.lon = Math.max(-180, Math.min(180, v)); });
  sunIn('#sunNorth', el => { const v = parseFloat(el.value); if (isFinite(v)) S.sun.north = v; });
  sunIn('#sunUtc', el => { const v = parseFloat(el.value); if (isFinite(v)) { S.sun.utc = v; S.sun.utcEdited = true; } });
  $('#entFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f && S.on) addCardFromFile(f); });
  $('#entAdd').addEventListener('click', () => { if (!S.on) return; $('#entFile').click(); });
  $('#spSave').addEventListener('click', () => {
    if (!S.on) return;
    const blob = new Blob([JSON.stringify(toJSON())], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = (ctx.getState().name.replace(/\.[^.]+$/, '') || 'view') + '_sectionpersp_' + S.axis + '.json';
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    ctx.toast(t('spSaved'));
  });
  $('#spLoadBtn').addEventListener('click', () => $('#spLoadFile').click());
  $('#spLoadFile').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { await fromJSON(JSON.parse(await f.text())); ctx.toast(t('spLoaded')); } catch (err) { console.warn(err); ctx.toast(t('spBadJson')); }
  });

  return {
    get active() { return S.on; }, S, render, exportBlob, onResize, onModelChange, reset, exit, enter, capWanted, capMaterial, syncFromSections, isCappable,
    refreshUI() { if (S.on) { positionHandle(); syncFromSections(); refreshCardList(); buildProgramUI(); } },
    get axis() { return S.axis; }, get scene() { return S.scene; },
    explodeSide() { return basis().right; },
    debug: {
      get rect() { return rect; }, cam, depthD, cutScreen, worldOnCut, project, setDepth(v) { S.depth = v; $('#spDepth').value = v; ctx.requestRender(); },
      setVP(u, v) { S.vu = u; S.vv = v; ctx.requestRender(); }, setScene, toJSON, fromJSON, addCard, sunPosition, processCardImage,
      setInk(hex) { ensureQuad(); const c = raw(hex); quadMat.uniforms.uInk.value.set(c.r, c.g, c.b); quadMat.uniforms.uGray.value.set(c.r, c.g, c.b); ctx.requestRender(); },
      probe(x, y) {
        const gl = renderer.getContext(); const props = renderer.properties.get(mrt); const fb = props.__webglFramebuffer;
        const out = []; const prev = gl.getParameter(gl.FRAMEBUFFER_BINDING);
        gl.bindFramebuffer(gl.FRAMEBUFFER, Array.isArray(fb) ? fb[0] : fb);
        for (let i = 0; i < 3; i++) { gl.readBuffer(gl.COLOR_ATTACHMENT0 + i); const b = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b); out.push([...b]); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, prev); return out;
      },
      get cards() { return S.cards; }, get mrt() { return mrt; }, get lastSun() { return lastSun; },
    },
  };
}
