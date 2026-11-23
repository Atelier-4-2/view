// Atelier 4·2 View — Rhino .3dm browser viewer. Everything runs locally; no upload.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { createSP, SP_DICT } from './sp.js';
import { createExplode, EXPLODE_DICT } from './explode.js';
import { createInfo, INFO_DICT } from './info.js';
import { createPrompt, PROMPT_DICT } from './prompt.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1); // Rhino is Z-up

const RHINO_LIB = 'https://cdn.jsdelivr.net/npm/rhino3dm@8.0.1/';
const BIG_FILE = 200 * 1024 * 1024;
const CAP_MESH_LIMIT = 4000;
const EDGE_ANGLE = 30;
const EDGE_PX = 1.2;

/* ---------------- i18n ---------------- */
const DICT = {
  ko: {
    brandAria: 'Atelier 4·2 메인페이지', navAria: 'Atelier 4·2 사이트', panelAria: '패널', stageAria: '3D 뷰',
    layers: '레이어', allOn: '모두 켜기', allOff: '모두 끄기', layersEmpty: '파일을 열면 레이어가 여기에 나옵니다.',
    namedViews: '저장된 뷰', section: '단면', flip: '뒤집기', cap: '잘린 면 채우기',
    capHint: '면 채움은 닫힌 솔리드에서 정확합니다. 열린 면이 많으면 끄세요.',
    export: '내보내기', bg: '배경', bgWhite: '흰색', bgTransparent: '투명', res: '해상도',
    lineDraw: '선 그림(면 음영 없음)', savePng: 'PNG 저장', info: '파일 정보',
    privacy: '파일은 이 기기 밖으로 나가지 않습니다.',
    panel: '패널', viewsAria: '뷰', modesAria: '표시 모드',
    vPersp: '원근', vTop: '평면', vFront: '정면', vRight: '우측', vAxo: '액소', fit: '전체 보기',
    navOrbit: '회전', navPan: '이동',
    mShaded: '음영', mWhite: '흰 모형', mWire: '와이어', mGhost: '고스트', measure: '측정', open: '열기',
    emptyTitle: 'Rhino 파일(.3dm)을 여기에 놓으세요', emptySub: '파일은 이 기기 밖으로 나가지 않습니다',
    pick: '파일 선택', sample: '샘플 보기', formats: '.3dm · .obj · .stl · .glb · .gltf 파일도 열 수 있습니다.',
    clear: '지우기', dropHere: '여기에 놓으세요',
    reading: '파일을 읽는 중입니다', converting: '모델을 변환하는 중입니다', building: '선을 만드는 중입니다',
    bigWarn: '파일이 {mb} MB입니다. 브라우저가 느려지거나 멈출 수 있습니다. 계속할까요?',
    badType: '지원하지 않는 형식입니다. .3dm .obj .stl .glb .gltf만 열 수 있습니다.',
    loadFail: '파일을 열지 못했습니다.', empty3d: '표시할 형상이 없습니다.',
    sampleFail: '샘플을 불러오지 못했습니다.',
    measure1: '첫 번째 점을 누르세요', measure2: '두 번째 점을 누르세요', dist: '거리',
    exported: 'PNG를 저장했습니다', exportFail: 'PNG를 만들지 못했습니다.',
    capLimit: '객체가 많아 면 채움을 껐습니다.', capsLines: '',
    fName: '이름', fSize: '크기', fUnit: '단위', fObjs: '객체', fLayers: '레이어', fBox: '범위',
    unitUnknown: '알 수 없음', rootLayer: '모델', views: '뷰',
    toastSnap: '꼭짓점에 맞췄습니다', extBlocked: '외부 파일 참조는 차단했습니다.', secPos: '{a} 단면 위치', gl3d: '3D 뷰. 화살표 키로 회전, + − 로 확대 축소',
  },
  fr: {
    brandAria: 'Atelier 4·2 accueil', navAria: 'Sites Atelier 4·2', panelAria: 'Panneau', stageAria: 'Vue 3D',
    layers: 'Calques', allOn: 'Tout afficher', allOff: 'Tout masquer', layersEmpty: 'Les calques apparaissent ici une fois le fichier ouvert.',
    namedViews: 'Vues enregistrées', section: 'Coupe', flip: 'Inverser', cap: 'Remplir les sections',
    capHint: 'Le remplissage est exact sur des solides fermés. Désactivez-le si beaucoup de surfaces sont ouvertes.',
    export: 'Exporter', bg: 'Fond', bgWhite: 'Blanc', bgTransparent: 'Transparent', res: 'Résolution',
    lineDraw: 'Dessin au trait (sans ombre)', savePng: 'Enregistrer en PNG', info: 'Fichier',
    privacy: 'Le fichier ne quitte jamais cet appareil.',
    panel: 'Panneau', viewsAria: 'Vues', modesAria: 'Mode d’affichage',
    vPersp: 'Persp.', vTop: 'Plan', vFront: 'Façade', vRight: 'Droite', vAxo: 'Axo', fit: 'Tout voir',
    navOrbit: 'Pivoter', navPan: 'Déplacer',
    mShaded: 'Ombré', mWhite: 'Maquette', mWire: 'Filaire', mGhost: 'Fantôme', measure: 'Mesure', open: 'Ouvrir',
    emptyTitle: 'Déposez un fichier Rhino (.3dm) ici', emptySub: 'Le fichier ne quitte jamais cet appareil',
    pick: 'Choisir un fichier', sample: 'Voir l’exemple', formats: 'Formats .3dm · .obj · .stl · .glb · .gltf acceptés.',
    clear: 'Effacer', dropHere: 'Déposez ici',
    reading: 'Lecture du fichier', converting: 'Conversion du modèle', building: 'Création des arêtes',
    bigWarn: 'Le fichier fait {mb} Mo. Le navigateur peut ralentir ou se bloquer. Continuer ?',
    badType: 'Format non pris en charge. Seuls .3dm .obj .stl .glb .gltf sont acceptés.',
    loadFail: 'Impossible d’ouvrir le fichier.', empty3d: 'Aucune géométrie à afficher.',
    sampleFail: 'Impossible de charger l’exemple.',
    measure1: 'Cliquez le premier point', measure2: 'Cliquez le second point', dist: 'Distance',
    exported: 'PNG enregistré', exportFail: 'Impossible de créer le PNG.',
    capLimit: 'Trop d’objets : remplissage désactivé.', capsLines: '',
    fName: 'Nom', fSize: 'Taille', fUnit: 'Unité', fObjs: 'Objets', fLayers: 'Calques', fBox: 'Étendue',
    unitUnknown: 'inconnue', rootLayer: 'Modèle', views: 'Vues',
    toastSnap: 'Accroché au sommet', extBlocked: 'Références externes bloquées.', secPos: 'Position de coupe {a}', gl3d: 'Vue 3D. Flèches pour tourner, + − pour zoomer',
  },
};
Object.assign(DICT.ko, SP_DICT.ko, EXPLODE_DICT.ko, INFO_DICT.ko, PROMPT_DICT.ko); Object.assign(DICT.fr, SP_DICT.fr, EXPLODE_DICT.fr, INFO_DICT.fr, PROMPT_DICT.fr);
let sp = null, ex = null, info = null, rprompt = null, exportCrop = null;
let lang = 'ko';
try { const s = localStorage.getItem('atelier-lang'); if (s === 'fr' || s === 'ko') lang = s; } catch (e) { /* storage unavailable */ }
const t = (k, p) => {
  let s = (DICT[lang] && DICT[lang][k]) ?? DICT.ko[k] ?? k;
  if (p) for (const key in p) s = s.replace('{' + key + '}', p[key]);
  return s;
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

function applyLang() {
  document.documentElement.lang = lang;
  $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  $('#langFr').setAttribute('aria-pressed', String(lang === 'fr'));
  $('#langKo').setAttribute('aria-pressed', String(lang === 'ko'));
  $('#gl').setAttribute('aria-label', t('gl3d'));
  $$('.sec-range').forEach(r => r.setAttribute('aria-label', t('secPos', { a: r.closest('.sec-row').dataset.axis.toUpperCase() })));
  document.title = 'View — Atelier 4·2';
  if (state) { renderInfo(); updateMeasureUI(); updateSectionLabels(); }
  if (sp) sp.refreshUI();
  if (info) info.refresh();
  if (rprompt) rprompt.refresh();
}

/* ---------------- renderer, cameras ---------------- */
const stage = $('#stage');
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: true, preserveDrawingBuffer: false });
renderer.localClippingEnabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const persp = new THREE.PerspectiveCamera(40, 1, 0.1, 1000);
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
persp.position.set(10, -14, 9);
scene.add(persp, ortho);
let camera = persp;

const hemi = new THREE.HemisphereLight(0xffffff, 0xb8b8c0, 1.15);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(0.4, 0.3, 1);
persp.add(keyLight); persp.add(keyLight.target); keyLight.target.position.set(0, 0, -1);
const keyLight2 = keyLight.clone();
ortho.add(keyLight2); ortho.add(keyLight2.target); keyLight2.target.position.set(0, 0, -1);

const controlsP = new OrbitControls(persp, canvas);
const controlsO = new OrbitControls(ortho, canvas);
for (const c of [controlsP, controlsO]) {
  c.enableDamping = false;
  c.enableRotate = true;
  c.enableZoom = true;
  c.enablePan = true;
  c.zoomSpeed = 1.2;
  c.rotateSpeed = 0.9;
  c.panSpeed = 0.9;
  c.screenSpacePanning = true;
  c.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  c.addEventListener('change', requestRender);
}
canvas.addEventListener('wheel', e => { if (!sp || !sp.active) e.preventDefault(); }, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());
controlsO.enabled = false;
let controls = controlsP;
let navMode = 'orbit';
function applyMouseButtons() {
  for (const c of [controlsP, controlsO]) {
    // Rhino standard: Right-drag = Orbit, Shift+Right-drag = Pan (OrbitControls natively flips ROTATE->PAN on Shift), Middle-drag = Pan, Wheel = Zoom.
    // Left-drag also follows the on-screen navMode toggle (orbit / pan) for trackpad convenience.
    c.mouseButtons = {
      LEFT: navMode === 'pan' ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    c.touches = navMode === 'pan'
      ? { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }
      : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }
}
function setNavMode(m) {
  navMode = m === 'pan' ? 'pan' : 'orbit';
  applyMouseButtons();
  $$('#navModeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.nav === navMode)));
}

let renderQueued = false;
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function render() {
  if (sp && sp.active) { sp.render(); return; }
  renderer.render(scene, camera);
  updateMeasureLabel();
}

/* ---------------- state ---------------- */
const planes = { x: new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), y: new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0) };
const AX = { x: 0, y: 1, z: 2 };
const clipPlanes = []; // active, shared by every material
const sec = { x: { on: false, v: 500, flip: false }, y: { on: false, v: 500, flip: false }, z: { on: false, v: 500, flip: false } };
let state = null; // { root, sources, layers, box, unit, name, size, kind, measureGroup }
let mode = 'white';
let viewName = 'persp';
let measureOn = false;
let measurePts = [];
let measureGroup = null;
let capObjects = []; // things to dispose on rebuild
const edgeMats = new Map();
const faceMats = new Map();
const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
// depth-only: hides back edges in transparent line drawings without painting any colour
const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clipPlanes });
const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clipPlanes });
const flatMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clippingPlanes: clipPlanes });
let exporting = null;

function themeBg() {
  return getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#ececef';
}
function applyBg() {
  renderer.setClearColor(new THREE.Color(themeBg()), 1);
  requestRender();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => setTimeout(applyBg, 30));

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  persp.aspect = w / h; persp.updateProjectionMatrix();
  fitOrthoAspect();
  if (sp) sp.onResize();
  if (info) info.onResize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  for (const m of edgeMats.values()) m.resolution.set(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
  requestRender();
}
new ResizeObserver(resize).observe(stage);

/* ---------------- materials ---------------- */
function edgeMat(key, color, opacity = 1) {
  let m = edgeMats.get(key);
  if (!m) {
    m = new LineMaterial({ color, linewidth: EDGE_PX, transparent: opacity < 1, opacity, clippingPlanes: clipPlanes });
    m.resolution.set(canvas.width, canvas.height);
    edgeMats.set(key, m);
  }
  return m;
}
function faceMat(kind, hex) {
  const key = kind + hex;
  let m = faceMats.get(key);
  if (m) return m;
  const base = { color: new THREE.Color(hex), side: THREE.DoubleSide, clippingPlanes: clipPlanes, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
  if (kind === 'shaded') m = new THREE.MeshStandardMaterial({ ...base, roughness: 0.85, metalness: 0 });
  else m = new THREE.MeshBasicMaterial({ ...base, transparent: true, opacity: 0.22, depthWrite: false });
  faceMats.set(key, m);
  return m;
}
function hexOf(c) {
  if (!c) return null;
  const to = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + to(c.r) + to(c.g) + to(c.b);
}

/* ---------------- mode ---------------- */
function applyMode() {
  if (!state) return;
  const ld = !!(exporting && exporting.lineDraw);
  const lineFace = exporting && exporting.transparent ? depthMat : flatMat;
  for (const o of state.sources) {
    const lc = o.userData.lc || '#9a9aa2';
    if (o.isMesh) {
      if (ld && mode !== 'wire') o.material = lineFace;
      else if (mode === 'white') o.material = whiteMat;
      else if (mode === 'shaded') o.material = o.userData.lc ? faceMat('shaded', lc) : o.userData.origMat;
      else if (mode === 'ghost') o.material = faceMat('ghost', lc);
      else o.material = hiddenMat;
      const ed = o.userData.edges;
      if (ed) {
        ed.visible = mode !== 'shaded' || (ld && mode !== 'wire');
        ed.material = (mode === 'white' || (ld && mode !== 'wire')) ? edgeMat('black', 0x111111)
          : mode === 'ghost' ? edgeMat('ghost', 0x6e6e73, 0.55)
          : edgeMat('w' + lc, new THREE.Color(lc).multiplyScalar(0.85));
      }
    } else if (o.isLine || o.isPoints) {
      const col = (mode === 'white' || mode === 'ghost') ? '#111111' : lc;
      o.material.color.set(col);
      o.material.clippingPlanes = clipPlanes;
    }
  }
  $$('#modeSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  rebuildCaps();
  requestRender();
}

/* ---------------- loading ---------------- */
function showProgress(text, pct) {
  const p = $('#progress'), bar = $('.bar', p);
  p.hidden = false;
  $('#progressText').textContent = text;
  if (pct == null) { bar.classList.add('indeterminate'); $('#progressBar').style.width = ''; }
  else { bar.classList.remove('indeterminate'); $('#progressBar').style.width = Math.round(pct * 100) + '%'; }
}
const hideProgress = () => { $('#progress').hidden = true; };
let toastTimer = 0;
function toast(msg, ms = 3200) {
  const el = $('#toast');
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
const nextFrame = () => new Promise(r => { let done = false; const go = () => { if (!done) { done = true; r(); } }; requestAnimationFrame(go); setTimeout(go, 60); });

function readFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onprogress = e => { if (e.lengthComputable) showProgress(t('reading') + ' … ' + Math.round(e.loaded / e.total * 100) + '%', e.loaded / e.total); };
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error('read'));
    fr.readAsArrayBuffer(file);
  });
}

async function openFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!['3dm', 'obj', 'stl', 'glb', 'gltf'].includes(ext)) { toast(t('badType')); return; }
  if (file.size > BIG_FILE && !window.confirm(t('bigWarn', { mb: Math.round(file.size / 1048576) }))) return;
  showProgress(t('reading'), 0);
  try {
    const buf = await readFile(file);
    await loadBuffer(buf, file.name, ext, file.size);
  } catch (err) {
    console.warn(err);
    hideProgress();
    toast(t('loadFail') + (err && err.message ? ' (' + err.message + ')' : ''), 6000);
  }
}

async function loadBuffer(buf, name, ext, size) {
  showProgress(t('converting'), null);
  await nextFrame();
  let parsed;
  if (ext === '3dm') parsed = await parse3dm(buf);
  else if (ext === 'obj') parsed = await parseObj(buf);
  else if (ext === 'stl') parsed = await parseStl(buf);
  else parsed = await parseGltf(buf, ext);
  await install(parsed, name, size ?? buf.byteLength);
  hideProgress();
}

async function parse3dm(buf) {
  const { Rhino3dmLoader } = await import('three/addons/loaders/3DMLoader.js');
  const namedRaw = await extractNamedViews(buf); // before parse: the loader transfers (detaches) the buffer
  const loader = new Rhino3dmLoader();
  loader.setLibraryPath(RHINO_LIB);
  let obj;
  try { obj = await new Promise((resolve, reject) => loader.parse(buf, resolve, reject)); }
  finally { loader.dispose(); }
  const ud = obj.userData || {};
  const layers = (ud.layers || []).map((l, i) => ({
    index: i, id: l.id, name: l.name || ('Layer ' + i), parentId: l.parentLayerId, color: hexOf(l.color), visible: l.visible !== false,
    fullPath: l.fullPath,
  }));
  const settings = ud.settings || {};
  let unit = settings.modelUnitSystem;
  if (unit && typeof unit === 'object') unit = unit.value ?? unit.unitSystem;
  return { kind: '3dm', root: obj, layers, unit: unitName(unit), named: (ud.namedViews && ud.namedViews.length ? ud.namedViews : namedRaw), warnings: ud.warnings };
}
// three's 3DMLoader does not expose Rhino saved views, so read them straight from rhino3dm.
async function extractNamedViews(buf) {
  if (buf.byteLength > 150 * 1024 * 1024) return [];
  let doc = null;
  try {
    const mod = await import(RHINO_LIB + 'rhino3dm.module.js');
    const rhino = await (mod.default || mod)();
    doc = rhino.File3dm.fromByteArray(new Uint8Array(buf));
    const nvs = doc && doc.namedViews && doc.namedViews();
    const out = [];
    for (let i = 0; nvs && i < nvs.count; i++) {
      const nv = nvs.get(i);
      try {
        const vp = nv.viewport || (nv.getViewport && nv.getViewport());
        if (!vp) continue;
        const pick = k => { try { const v = vp[k]; return typeof v === 'function' ? v.call(vp) : v; } catch (e) { return undefined; } };
        const arr = a => (a ? [a[0], a[1], a[2]] : null);
        const o = { name: nv.name, cameraLocation: arr(pick('cameraLocation')), cameraDirection: arr(pick('cameraDirection')), cameraUp: arr(pick('cameraUp')), isParallelProjection: !!pick('isParallelProjection'), isPerspectiveProjection: !!pick('isPerspectiveProjection') };
        let fr = null;
        try { fr = typeof vp.getFrustum === 'function' ? vp.getFrustum() : null; } catch (e) { /* no frustum */ }
        if (fr) { const l = fr.left ?? fr[0], r = fr.right ?? fr[1]; if (isFinite(l) && isFinite(r) && r > l) o.frustumWidth = r - l; }
        out.push(o);
      } finally { nv.delete && nv.delete(); }
    }
    nvs && nvs.delete && nvs.delete();
    return out;
  } catch (e) { console.info('named views unavailable', e && e.message); return []; }
  finally { try { doc && doc.delete && doc.delete(); } catch (e) { /* ignore */ } }
}
async function parseObj(buf) {
  const { OBJLoader } = await import('three/addons/loaders/OBJLoader.js');
  return { kind: 'obj', root: new OBJLoader().parse(new TextDecoder().decode(buf)), unit: null };
}
async function parseStl(buf) {
  const { STLLoader } = await import('three/addons/loaders/STLLoader.js');
  const g = new STLLoader().parse(buf);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xcccccc }));
  const root = new THREE.Group(); root.add(m);
  return { kind: 'stl', root, unit: null };
}
async function parseGltf(buf, ext) {
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  // privacy: never let a .gltf pull buffers or textures from the network; only embedded data:/blob: URIs pass
  let blocked = 0;
  const manager = new THREE.LoadingManager();
  manager.setURLModifier(url => {
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    blocked++;
    return 'data:application/octet-stream;base64,';
  });
  const gltf = await new Promise((res, rej) => new GLTFLoader(manager).parse(buf, '', res, rej));
  if (blocked) toast(t('extBlocked'), 5000);
  return { kind: 'gltf', root: gltf.scene, unit: null };
}

function unitName(v) {
  const map = { 1: 'µm', 2: 'mm', 3: 'cm', 4: 'm', 5: 'km', 6: 'µin', 7: 'mil', 8: 'in', 9: 'ft', 10: 'mi', 12: 'Å', 13: 'nm', 14: 'dm', 15: 'dam', 16: 'hm', 17: 'Mm', 18: 'Gm', 19: 'yd', 22: 'nmi' };
  if (typeof v === 'string') return v;
  return map[v] || null;
}

function disposeState() {
  if (!state) return;
  if (sp) sp.reset();
  if (ex) ex.reset();
  if (info) info.reset();
  clearMeasure();
  clearCaps();
  scene.remove(state.root);
  const shared = new Set([whiteMat, flatMat, hiddenMat, depthMat, ...faceMats.values(), ...edgeMats.values()]);
  const mats = new Set();
  state.root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    for (const m of [].concat(o.material || [], o.userData.origMat || [])) if (!shared.has(m)) mats.add(m);
  });
  for (const m of mats) {
    for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
    m.dispose();
  }
  // per-file layer-colour materials: drop them so repeated opens do not accumulate
  faceMats.forEach(m => m.dispose()); faceMats.clear();
  edgeMats.forEach(m => m.dispose()); edgeMats.clear();
  state = null;
}

function layerIndexOf(o) {
  for (let p = o; p; p = p.parent) {
    const a = p.userData && p.userData.attributes;
    if (a && typeof a.layerIndex === 'number') return a.layerIndex;
  }
  return null;
}

async function install(parsed, name, size) {
  disposeState();
  const root = parsed.root;
  // collect renderables
  const raw = [];
  root.traverse(o => { if (o.isMesh || o.isLine || o.isPoints) raw.push(o); });
  if (!raw.length) throw new Error(t('empty3d'));

  let layers = parsed.layers;
  if (parsed.kind === '3dm') {
    for (const o of raw) {
      const li = layerIndexOf(o);
      o.userData.layer = (li != null && layers[li]) ? li : -1;
    }
  } else {
    // non-3dm: top-level children become layers
    const kids = root.children.filter(k => k.name || true);
    if (kids.length > 1 && kids.length <= 200) {
      layers = kids.map((k, i) => ({ index: i, id: 'k' + i, name: k.name || ('#' + (i + 1)), parentId: null, color: null, visible: true }));
      kids.forEach((k, i) => k.traverse(o => { o.userData.layer = i; }));
    } else {
      layers = [{ index: 0, id: 'm', name: t('rootLayer'), parentId: null, color: null, visible: true }];
      raw.forEach(o => { o.userData.layer = 0; });
    }
  }
  if (parsed.kind === '3dm' && raw.some(o => o.userData.layer === -1)) {
    layers = layers.concat([{ index: layers.length, id: 'none', name: t('rootLayer'), parentId: null, color: null, visible: true }]);
    raw.forEach(o => { if (o.userData.layer === -1) o.userData.layer = layers.length - 1; });
  }
  for (const o of raw) {
    const l = layers[o.userData.layer];
    o.userData.lc = l && l.color ? l.color : null;
  }

  state = { root, sources: raw, layers, unit: parsed.unit, name, size, kind: parsed.kind, named: parsed.named || [], box: new THREE.Box3() };
  scene.add(root);

  // materials + edges, in chunks so the UI stays alive
  const meshes = raw.filter(o => o.isMesh);
  showProgress(t('building'), 0);
  for (let i = 0; i < raw.length; i++) {
    const o = raw[i];
    if (o.isMesh) {
      o.userData.origMat = o.material;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { m.side = THREE.DoubleSide; m.clippingPlanes = clipPlanes; }
      if (o.geometry && o.geometry.attributes.position && !o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      const eg = new THREE.EdgesGeometry(o.geometry, EDGE_ANGLE);
      if (eg.attributes.position.count) {
        const g = new LineSegmentsGeometry().fromEdgesGeometry(eg);
        const ls = new LineSegments2(g, edgeMat('black', 0x111111));
        ls.frustumCulled = false;
        ls.userData.helper = true;
        o.add(ls);
        o.userData.edges = ls;
      }
      eg.dispose();
    } else {
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m, k) => { const c = m.clone(); c.clippingPlanes = clipPlanes; if (Array.isArray(o.material)) o.material[k] = c; else o.material = c; });
    }
    if (i % 150 === 149) { showProgress(t('building') + ' … ' + Math.round(i / raw.length * 100) + '%', i / raw.length); await nextFrame(); }
  }
  // initial layer visibility
  state.layerOn = layers.map(l => l.visible);
  updateLayerVisibility();
  state.box = computeBox(false);
  if (state.box.isEmpty()) state.box = computeBox(true);
  state.meshCount = meshes.length;

  buildLayerPanel();
  buildNamedViews();
  renderInfo();
  resetSections();
  applyMode();
  setView('persp', true);
  fitView();
  { const sph = state.box.getBoundingSphere(new THREE.Sphere()); state.home = { cam: 'persp', pos: persp.position.clone(), up: persp.up.clone(), target: controls.target.clone(), r: Math.max(sph.radius, 1e-6), viewName: 'persp' }; }
  $('#empty').hidden = true;
  syncExplodeUI(); buildExplodeLayers();
  if (parsed.warnings && parsed.warnings.length) console.info('3dm warnings', parsed.warnings.length);
}

/* ---------------- bounds, layers ---------------- */
function effectiveOn(idx) {
  const L = state.layers;
  let guard = 0;
  let cur = L[idx];
  while (cur && guard++ < 64) {
    if (!state.layerOn[cur.index]) return false;
    if (!cur.parentId || cur.parentId === ZERO_ID) return true;
    cur = L.find(x => x.id === cur.parentId);
  }
  return true;
}
const ZERO_ID = '00000000-0000-0000-0000-000000000000';

function updateLayerVisibility() {
  const cache = new Map();
  for (const o of state.sources) {
    const i = o.userData.layer;
    if (!cache.has(i)) cache.set(i, effectiveOn(i));
    o.visible = cache.get(i);
    // ancestors between source and root (e.g. gltf nodes) stay visible
  }
  // dim children of hidden parents in the panel
  if (state.layerEls) {
    state.layers.forEach((l, i) => {
      const li = state.layerEls[i];
      if (!li) return;
      li.classList.toggle('off', !state.layerOn[i]);
      li.classList.toggle('dim', state.layerOn[i] && !effectiveOn(i));
      li.querySelector('input').checked = state.layerOn[i];
    });
  }
  if (sp && sp.active) sp.onModelChange();
  requestRender();
}

function computeBox(all) {
  const box = new THREE.Box3();
  const tmp = new THREE.Box3();
  state.root.updateMatrixWorld(true);
  for (const o of state.sources) {
    if (!all && !o.visible) continue;
    const g = o.geometry;
    if (!g) continue;
    if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox.isEmpty()) continue;
    tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  }
  return box;
}

function buildLayerPanel() {
  const ul = $('#layerList');
  ul.textContent = '';
  const L = state.layers;
  $('#layersEmpty').hidden = true;
  // order: depth-first by parent
  const byParent = new Map();
  L.forEach(l => {
    const p = (!l.parentId || l.parentId === ZERO_ID || !L.some(x => x.id === l.parentId)) ? null : l.parentId;
    l.depthParent = p;
    if (!byParent.has(p)) byParent.set(p, []);
    byParent.get(p).push(l);
  });
  const counts = new Array(L.length).fill(0);
  state.sources.forEach(o => { counts[o.userData.layer]++; });
  state.layerEls = new Array(L.length);
  const walk = (parent, depth) => {
    for (const l of byParent.get(parent) || []) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      label.style.paddingLeft = Math.min(depth, 8) * 14 + 'px';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = state.layerOn[l.index];
      cb.addEventListener('change', () => { state.layerOn[l.index] = cb.checked; updateLayerVisibility(); });
      const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = l.color || '#9a9aa2';
      const nm = document.createElement('span'); nm.className = 'name'; nm.textContent = l.name; nm.title = l.fullPath || l.name;
      label.append(cb, sw, nm);
      li.append(label);
      ul.append(li);
      state.layerEls[l.index] = li;
      walk(l.id, depth + 1);
    }
  };
  walk(null, 0);
  // orphans (cyclic parents) fallback
  L.forEach(l => { if (!state.layerEls[l.index]) { const li = document.createElement('li'); li.textContent = l.name; ul.append(li); state.layerEls[l.index] = li; } });
  updateLayerVisibility();
}

$('#layersAllOn').addEventListener('click', () => { if (!state) return; state.layerOn.fill(true); updateLayerVisibility(); });
$('#layersAllOff').addEventListener('click', () => { if (!state) return; state.layerOn.fill(false); updateLayerVisibility(); });

function renderInfo() {
  const dl = $('#info');
  dl.textContent = '';
  if (!state) return;
  const b = state.box, s = new THREE.Vector3();
  b.getSize(s);
  const u = state.unit || '';
  const rows = [
    [t('fName'), state.name],
    [t('fSize'), (state.size / 1048576).toFixed(state.size > 1048576 ? 1 : 2) + ' MB'],
    [t('fUnit'), state.unit || t('unitUnknown')],
    [t('fObjs'), String(state.sources.length)],
    [t('fLayers'), String(state.layers.length)],
    [t('fBox'), [s.x, s.y, s.z].map(v => fmt(v)).join(' × ') + (u ? ' ' + u : '')],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    dl.append(dt, dd);
  }
}
function fmt(v) {
  const a = Math.abs(v);
  if (a >= 10000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(3);
}

/* ---------------- named views ---------------- */
function buildNamedViews() {
  const wrap = $('#namedViews');
  wrap.textContent = '';
  const out = [];
  for (const v of state.named || []) {
    const vp = v.viewport || v;
    const loc = vp.cameraLocation, dir = vp.cameraDirection, up = vp.cameraUp;
    if (!v.name || !loc || !dir) continue;
    out.push({ name: v.name, loc: toV3(loc), dir: toV3(dir), up: up ? toV3(up) : new THREE.Vector3(0, 0, 1), persp: vp.isPerspectiveProjection !== false && vp.isParallelProjection !== true, fw: vp.frustumWidth });
  }
  state.namedViews = out;
  $('#secViews').hidden = !out.length;
  for (const nv of out) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn sm'; b.textContent = nv.name;
    b.addEventListener('click', () => gotoNamed(nv));
    wrap.append(b);
  }
}
function toV3(a) {
  if (Array.isArray(a)) return new THREE.Vector3(a[0], a[1], a[2]);
  return new THREE.Vector3(a.x ?? a[0] ?? 0, a.y ?? a[1] ?? 0, a.z ?? a[2] ?? 0);
}
function gotoNamed(nv) {
  const c = nv.persp ? persp : ortho;
  useCamera(nv.persp ? 'persp' : 'ortho');
  const sph = state.box.getBoundingSphere(new THREE.Sphere());
  const dist = Math.max(nv.loc.distanceTo(sph.center), sph.radius);
  const dirN = nv.dir.clone().normalize();
  c.up.copy(nv.up);
  const tgt = nv.loc.clone().add(dirN.clone().multiplyScalar(Math.max(dist, 1e-6)));
  c.position.copy(nv.loc);
  controls.target.copy(tgt);
  if (!nv.persp) { c.position.copy(tgt).addScaledVector(dirN, -sph.radius * 3); setOrthoExtent(sph.radius); if (nv.fw > 0) { const asp = (stage.clientWidth || 1) / (stage.clientHeight || 1); orthoHalf = asp >= 1 ? nv.fw / 2 / asp : nv.fw / 2; fitOrthoAspect(); } }
  c.lookAt(tgt);
  setNearFar(sph.radius);
  controls.update();
  viewName = '';
  syncViewButtons();
  requestRender();
}

/* ---------------- views ---------------- */
function fitDist(r) {
  const vf = THREE.MathUtils.degToRad(persp.fov / 2);
  const hf = Math.atan(Math.tan(vf) * persp.aspect);
  return r / Math.sin(Math.min(vf, hf)) * 1.02;
}
function setNearFar(r) {
  persp.near = Math.max(r * 0.003, 1e-4); persp.far = r * 200; persp.updateProjectionMatrix();
  ortho.near = -r * 60; ortho.far = r * 60; ortho.updateProjectionMatrix();
  controlsP.minDistance = Math.max(r * 0.02, 1e-3); controlsP.maxDistance = r * 40;
  controlsO.minZoom = 0.05; controlsO.maxZoom = 100;
}
function useCamera(which) {
  const toOrtho = which === 'ortho';
  if (toOrtho === (camera === ortho)) return;
  const old = controls;
  camera = toOrtho ? ortho : persp;
  controls = toOrtho ? controlsO : controlsP;
  old.enabled = false; controls.enabled = true;
  controls.target.copy(old.target);
}
let orthoHalf = 10;
function setOrthoExtent(r) { orthoHalf = r * 1.15; ortho.zoom = 1; fitOrthoAspect(); }
function fitOrthoAspect() {
  const w = stage.clientWidth || 1, h = stage.clientHeight || 1, a = w / h;
  const half = orthoHalf;
  if (a >= 1) { ortho.top = half; ortho.bottom = -half; ortho.left = -half * a; ortho.right = half * a; }
  else { ortho.left = -half; ortho.right = half; ortho.top = half / a; ortho.bottom = -half / a; }
  ortho.updateProjectionMatrix();
}
const VIEW_DIRS = {
  top: [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)],
  front: [new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1)],
  right: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  axo: [new THREE.Vector3(1, -1, 1).normalize(), new THREE.Vector3(0, 0, 1)],
};
function setView(name, silent) {
  viewName = name;
  syncViewButtons();
  if (!state) return;
  const sph = state.box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sph.radius, 1e-6);
  const c = sph.center;
  setNearFar(r);
  if (name === 'persp') {
    useCamera('persp');
    persp.up.set(0, 0, 1);
    const d = new THREE.Vector3(0.62, -0.85, 0.55).normalize();
    const dist = fitDist(r);
    persp.position.copy(c).addScaledVector(d, dist);
    controls.target.copy(c);
    persp.lookAt(c);
  } else {
    useCamera('ortho');
    const [d, up] = VIEW_DIRS[name];
    ortho.up.copy(up);
    ortho.position.copy(c).addScaledVector(d, r * 3);
    controls.target.copy(c);
    ortho.lookAt(c);
    setOrthoExtent(r);
  }
  controls.update();
  requestRender();
}
function fitView() {
  if (!state) return;
  const box = computeBox(false);
  const b = box.isEmpty() ? state.box : box;
  const sph = b.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sph.radius, 1e-6);
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
  controls.target.copy(sph.center);
  if (camera === persp) {
    const dist = fitDist(r);
    persp.position.copy(sph.center).addScaledVector(dir, dist);
  } else {
    ortho.position.copy(sph.center).addScaledVector(dir, r * 3);
    setOrthoExtent(r);
  }
  camera.lookAt(sph.center);
  controls.update();
  requestRender();
}
function syncViewButtons() {
  $$('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === viewName)));
}
$$('#viewSeg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$('#fitBtn').addEventListener('click', fitView);
$$('#modeSeg button').forEach(b => b.addEventListener('click', () => { mode = b.dataset.mode; applyMode(); }));

/* ---------------- sections + stencil caps ---------------- */
function sliderValue(axis) {
  const mn = state.box.min.getComponent(AX[axis]), mx = state.box.max.getComponent(AX[axis]);
  return mn + (mx - mn) * sec[axis].v / 1000;
}
function resetSections() {
  for (const a of ['x', 'y', 'z']) { sec[a].on = false; sec[a].v = 500; sec[a].flip = false; }
  $$('.sec-row').forEach(row => {
    $('.sec-on', row).checked = false; $('.sec-range', row).value = 500;
    $('.sec-flip', row).setAttribute('aria-pressed', 'false'); row.classList.remove('on');
  });
  updatePlanes();
  updateSectionLabels();
}
function updateSectionLabels() {
  if (!state) { $$('.sec-val').forEach(o => { o.textContent = ''; }); return; }
  const u = state.unit ? ' ' + state.unit : '';
  for (const a of ['x', 'y', 'z']) {
    const row = $(`.sec-row[data-axis="${a}"]`);
    $('.sec-val', row).textContent = a.toUpperCase() + ' = ' + fmt(sliderValue(a)) + u;
  }
}
function updatePlanes() {
  clipPlanes.length = 0;
  if (state) {
    for (const a of ['x', 'y', 'z']) {
      const s = sec[a], p = planes[a], v = sliderValue(a);
      const n = new THREE.Vector3(); n.setComponent(AX[a], s.flip ? 1 : -1);
      p.normal.copy(n); p.constant = s.flip ? -v : v;
      if (s.on) clipPlanes.push(p);
    }
  }
  for (const c of capObjects) if (c.cap) positionCap(c);
  if (sp) sp.syncFromSections();
  requestRender();
}
function positionCap(c) {
  const p = c.plane;
  const center = state.box.getCenter(new THREE.Vector3());
  const d = p.normal.dot(center) + p.constant;
  c.cap.position.copy(center).addScaledVector(p.normal, -d);
  c.cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.normal);
}
function clearCaps() {
  for (const c of capObjects) {
    c.parts.forEach(m => { m.parent && m.parent.remove(m); });
    c.mats.forEach(m => m.dispose());
    if (c.cap) { scene.remove(c.cap); c.cap.geometry.dispose(); }
  }
  capObjects = [];
}
function rebuildCaps() {
  clearCaps();
  if (!state) return;
  const spOn = !!(sp && sp.active);
  const want = spOn ? sp.capWanted() : ($('#capOn').checked && (mode === 'white' || mode === 'shaded') && !(exporting && exporting.lineDraw));
  const active = ['x', 'y', 'z'].filter(a => sec[a].on);
  if (!want || !active.length) { requestRender(); return; }
  const meshes = state.sources.filter(o => o.isMesh && (!spOn || sp.isCappable(o)));
  if (meshes.length > CAP_MESH_LIMIT) { toast(t('capLimit')); return; }
  const size = state.box.getSize(new THREE.Vector3()).length() * (spOn ? 6 : 3) || 10;
  const capColor = mode === 'white' ? 0x111111 : 0x444449;
  (spOn ? active.filter(x => x === sp.axis) : active).forEach((a, k) => {
    const plane = planes[a];
    const mats = [];
    const parts = [];
    const mk = (side, op) => {
      const m = new THREE.MeshBasicMaterial({
        depthWrite: false, depthTest: false, colorWrite: false, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc,
        side, clippingPlanes: active.map(x => planes[x]), // target plane + every other active plane: removed regions must not feed the stencil
        stencilFail: op, stencilZFail: op, stencilZPass: op,
      });
      mats.push(m); return m;
    };
    const back = mk(THREE.BackSide, THREE.IncrementWrapStencilOp);
    const front = mk(THREE.FrontSide, THREE.DecrementWrapStencilOp);
    for (const o of meshes) {
      for (const mat of [back, front]) {
        const c = new THREE.Mesh(o.geometry, mat);
        c.renderOrder = 10 + k * 2;
        c.frustumCulled = false;
        c.userData.helper = true;
        o.add(c); parts.push(c);
      }
    }
    const others = active.filter(x => x !== a).map(x => planes[x]);
    const capMat = spOn ? sp.capMaterial(others) : new THREE.MeshBasicMaterial({
      color: capColor, side: THREE.DoubleSide, clippingPlanes: others,
      stencilWrite: true, stencilRef: 0, stencilFunc: THREE.NotEqualStencilFunc,
      stencilFail: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilZPass: THREE.ReplaceStencilOp,
    });
    mats.push(capMat);
    const cap = new THREE.Mesh(new THREE.PlaneGeometry(size, size), capMat);
    cap.renderOrder = 10 + k * 2 + 1;
    cap.onAfterRender = r => r.clearStencil();
    cap.frustumCulled = false;
    scene.add(cap);
    const rec = { plane, cap, parts, mats };
    capObjects.push(rec);
    positionCap(rec);
  });
  requestRender();
}
$$('.sec-row').forEach(row => {
  const a = row.dataset.axis;
  $('.sec-on', row).addEventListener('change', e => {
    if (!state) { e.target.checked = false; return; }
    sec[a].on = e.target.checked; row.classList.toggle('on', sec[a].on);
    updatePlanes(); updateSectionLabels(); rebuildCaps();
  });
  $('.sec-range', row).addEventListener('input', e => {
    if (!state) return;
    sec[a].v = +e.target.value; updatePlanes(); updateSectionLabels();
  });
  $('.sec-flip', row).addEventListener('click', e => {
    if (!state) return;
    sec[a].flip = !sec[a].flip; e.currentTarget.setAttribute('aria-pressed', String(sec[a].flip));
    updatePlanes();
  });
});
$('#capOn').addEventListener('change', rebuildCaps);

/* ---------------- measure ---------------- */
const raycaster = new THREE.Raycaster();
function unitLabel() { return state && state.unit ? ' ' + state.unit : ''; }
function fmtLen(v) {
  if (state && state.unit === 'mm' && Math.abs(v) >= 10000) return (v / 1000).toFixed(2) + ' m';
  return fmt(v) + unitLabel();
}
function clearMeasure() {
  measurePts = [];
  if (measureGroup) {
    scene.remove(measureGroup);
    measureGroup.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); });
    measureGroup = null;
  }
  updateMeasureUI();
  requestRender();
}
function drawMeasure() {
  if (measureGroup) { scene.remove(measureGroup); measureGroup.traverse(o => { o.geometry && o.geometry.dispose(); o.material && o.material.dispose(); }); }
  measureGroup = new THREE.Group();
  const pg = new THREE.BufferGeometry().setFromPoints(measurePts);
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xe5484d, size: 10, sizeAttenuation: false, depthTest: false, transparent: true }));
  pts.renderOrder = 999; pts.frustumCulled = false;
  measureGroup.add(pts);
  if (measurePts.length === 2) {
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(measurePts), new THREE.LineBasicMaterial({ color: 0xe5484d, depthTest: false, transparent: true }));
    ln.renderOrder = 998; ln.frustumCulled = false;
    measureGroup.add(ln);
  }
  scene.add(measureGroup);
}
function updateMeasureUI() {
  const chip = $('#measureChip'), txt = $('#measureText');
  if (!measureOn && !measurePts.length) { chip.hidden = true; $('#measureLabel').hidden = true; return; }
  chip.hidden = false;
  if (measurePts.length === 2) {
    const d = measurePts[0].distanceTo(measurePts[1]);
    txt.textContent = t('dist') + ' ' + fmtLen(d);
  } else {
    txt.textContent = measurePts.length === 0 ? t('measure1') : t('measure2');
  }
  if (measurePts.length !== 2) $('#measureLabel').hidden = true;
}
function updateMeasureLabel() {
  const el = $('#measureLabel');
  if (measurePts.length !== 2) { el.hidden = true; return; }
  const mid = measurePts[0].clone().add(measurePts[1]).multiplyScalar(0.5).project(camera);
  if (mid.z > 1 || mid.z < -1) { el.hidden = true; return; }
  const w = stage.clientWidth, h = stage.clientHeight;
  el.hidden = false;
  el.style.left = ((mid.x + 1) / 2 * w) + 'px';
  el.style.top = ((1 - mid.y) / 2 * h) + 'px';
  el.textContent = fmtLen(measurePts[0].distanceTo(measurePts[1]));
}
function pointInClip(p) { return clipPlanes.every(pl => pl.distanceToPoint(p) >= -1e-9); }
function pickPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const targets = state.sources.filter(o => (o.isMesh || o.isLine || o.isPoints) && o.visible);
  const th = Math.max(state.box.getSize(new THREE.Vector3()).length() * 0.004, 1e-6);
  raycaster.params.Line.threshold = th; raycaster.params.Points.threshold = th;
  const hits = raycaster.intersectObjects(targets, false).filter(h => pointInClip(h.point));
  if (!hits.length) return null;
  const h = hits[0];
  let best = h.point.clone(), bestD = 14, snapped = false;
  let idxs = [];
  if (h.face) idxs = [h.face.a, h.face.b, h.face.c];
  else if (h.object.isPoints) idxs = [h.index];
  else if (h.object.isLine && h.index != null) idxs = [h.index, h.index + 1];
  {
    const pos = h.object.geometry.attributes.position;
    for (const idx of idxs) {
      if (idx == null || idx >= pos.count) continue;
      const v = new THREE.Vector3().fromBufferAttribute(pos, idx).applyMatrix4(h.object.matrixWorld);
      if (!pointInClip(v)) continue; // clipped (invisible) vertices are not snap targets
      const s = v.clone().project(camera);
      const dx = ((s.x + 1) / 2 * rect.width) - (clientX - rect.left);
      const dy = ((1 - s.y) / 2 * rect.height) - (clientY - rect.top);
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = v; snapped = true; }
    }
  }
  return { p: best, snapped };
}
let downAt = null;
canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, id: e.pointerId, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!downAt || !measureOn || !state || e.pointerType === 'mouse' && e.button !== 0) { downAt = null; return; }
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  const dt = performance.now() - downAt.t;
  downAt = null;
  if (moved > (e.pointerType === 'touch' ? 12 : 5) || dt > 600) return;
  const hit = pickPoint(e.clientX, e.clientY);
  if (!hit) return;
  if (hit.snapped) toast(t('toastSnap'), 1200);
  if (measurePts.length >= 2) measurePts = [];
  measurePts.push(hit.p);
  drawMeasure(); updateMeasureUI(); requestRender();
});
function setMeasure(on) {
  measureOn = on;
  $('#measureBtn').setAttribute('aria-pressed', String(on));
  canvas.style.cursor = on ? 'crosshair' : '';
  if (on && matchMedia('(max-width: 720px)').matches) setPanel(false);
  if (!on) clearMeasure(); else updateMeasureUI();
}
$('#measureBtn').addEventListener('click', () => setMeasure(!measureOn));
$('#measureClear').addEventListener('click', () => { clearMeasure(); });

/* ---------------- export ---------------- */
let exportBusy = false;
async function exportPng() {
  if (!state) { toast(t('empty3d')); return; }
  if (exportBusy) return;
  exportBusy = true;
  const bg = $('#expBg').value;
  let k = +$('#expScale').value;
  const lineDraw = $('#expLine').checked;
  const spMode = !!(sp && sp.active);
  const w = stage.clientWidth, h = stage.clientHeight;
  const gl = renderer.getContext();
  const maxDim = Math.min(8192, renderer.capabilities.maxTextureSize || 4096, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) || 4096);
  while (k > 1 && (Math.max(w, h) * k > maxDim || (w * k) * (h * k) > 16777216)) k--;
  const prevPR = renderer.getPixelRatio();
  const prevClear = new THREE.Color(); renderer.getClearColor(prevClear);
  const prevAlpha = renderer.getClearAlpha();
  const label = $('#measureLabel'); const lh = label.hidden;
  let blob = null;
  try {
    if (spMode) {
      renderer.setPixelRatio(k);
      renderer.setSize(w, h, false);
      blob = await sp.exportBlob(k, bg === 'transparent');
    } else {
    exporting = { lineDraw, transparent: bg === 'transparent' };
    if (lineDraw) applyMode();
    renderer.setPixelRatio(k);
    renderer.setSize(w, h, false);
    for (const m of edgeMats.values()) { m.linewidth = EDGE_PX * Math.max(1, k * 0.8); m.resolution.set(w * k, h * k); }
    if (bg === 'transparent') renderer.setClearColor(0xffffff, 0); else renderer.setClearColor(0xffffff, 1);
    label.hidden = true;
    renderer.render(scene, camera);
    blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    }
  } catch (err) {
    console.warn(err);
  } finally {
    label.hidden = lh;
    exporting = null;
    renderer.setPixelRatio(prevPR);
    renderer.setSize(w, h, false);
    for (const m of edgeMats.values()) { m.linewidth = EDGE_PX; m.resolution.set(w * prevPR, h * prevPR); }
    renderer.setClearColor(prevClear, prevAlpha);
    if (lineDraw && !spMode) applyMode();
    requestRender();
    exportBusy = false;
  }
  if (blob && exportCrop) blob = await cropBlob(blob, exportCrop);
  if (!blob) { toast(t('exportFail')); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.name.replace(/\.[^.]+$/, '') || 'view') + (exportCrop ? '_rendercapture_' + exportCrop.tag : spMode ? '_sectionpersp_' + sp.axis.toUpperCase() + '_' + sp.scene : '_' + viewName + '_' + mode) + '_' + k + 'x.png';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t('exported') + ' (' + Math.round(w * k) + '×' + Math.round(h * k) + ')');
  window.__lastExport = { k, w: blob.size };
}
$('#expBtn').addEventListener('click', exportPng);

/* ---------------- file input, drag and drop ---------------- */
const fileInput = $('#fileInput');
const pickFile = () => fileInput.click();
$('#pickBtn').addEventListener('click', pickFile);
$('#openBtn').addEventListener('click', pickFile);
fileInput.addEventListener('change', () => { const f = fileInput.files[0]; fileInput.value = ''; if (f) openFile(f); });
$('#sampleBtn').addEventListener('click', async () => {
  try {
    showProgress(t('reading'), null);
    const res = await fetch('tests/sample.3dm');
    if (!res.ok) throw new Error(res.status);
    const buf = await res.arrayBuffer();
    await loadBuffer(buf, 'sample.3dm', '3dm', buf.byteLength);
  } catch (e) { console.warn(e); hideProgress(); toast(t('sampleFail')); }
});
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; stage.classList.add('dragging'); $('#veil').hidden = false; e.preventDefault(); } });
window.addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) { stage.classList.remove('dragging'); $('#veil').hidden = true; } });
window.addEventListener('drop', e => {
  e.preventDefault(); dragDepth = 0; stage.classList.remove('dragging'); $('#veil').hidden = true;
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) openFile(f);
});

/* ---------------- panel, language, keys ---------------- */
const app = $('#app');
function setPanel(open) {
  app.classList.toggle('collapsed', !open);
  $('#panelBtn').setAttribute('aria-expanded', String(open));
  if (!matchMedia('(max-width: 720px)').matches) { try { localStorage.setItem('atelier-view-panel', open ? '1' : '0'); } catch (e) { /* ignore */ } }
}
$('#panelBtn').addEventListener('click', () => setPanel(app.classList.contains('collapsed')));
{
  const mq = matchMedia('(max-width: 720px)');
  let open = !mq.matches;
  try { const s = localStorage.getItem('atelier-view-panel'); if (s != null && open) open = s === '1'; } catch (e) { /* ignore */ }
  setPanel(open);
  mq.addEventListener('change', e => { if (e.matches) setPanel(false); });
}
{
  const step = THREE.MathUtils.degToRad(15);
  $$('#navModeSeg button').forEach(b => b.addEventListener('click', () => setNavMode(b.dataset.nav)));
  $('#navRotL')?.addEventListener('click', () => { if (state) keyOrbit(-step, 0); });
  $('#navRotR')?.addEventListener('click', () => { if (state) keyOrbit(step, 0); });
  $('#navRotU')?.addEventListener('click', () => { if (state) keyOrbit(0, step); });
  $('#navRotD')?.addEventListener('click', () => { if (state) keyOrbit(0, -step); });
  $('#navZoomIn')?.addEventListener('click', () => { if (state) keyZoom(1 / 1.2); });
  $('#navZoomOut')?.addEventListener('click', () => { if (state) keyZoom(1.2); });
  setNavMode('orbit');
}
$$('.lang button').forEach(b => b.addEventListener('click', () => {
  lang = b.dataset.lang;
  try { localStorage.setItem('atelier-lang', lang); } catch (e) { /* ignore */ }
  applyLang();
}));
window.addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (sp && sp.active) return;
  const map = { '1': 'persp', '2': 'top', '3': 'front', '4': 'right', '5': 'axo' };
  if (map[e.key]) setView(map[e.key]);
  else if (e.key === 'f' || e.key === 'F') fitView();
  else if (e.key === 'm' || e.key === 'M') setMeasure(!measureOn);
  else if (e.key === 'Escape' && measureOn) clearMeasure();
  else if (state && e.target.closest && !e.target.closest('button, a, summary')) {
    const step = THREE.MathUtils.degToRad(e.shiftKey ? 15 : 5);
    if (e.key === 'ArrowLeft') { keyOrbit(-step, 0); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { keyOrbit(step, 0); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { keyOrbit(0, step); e.preventDefault(); }
    else if (e.key === 'ArrowDown') { keyOrbit(0, -step); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { keyZoom(1 / 1.15); e.preventDefault(); }
    else if (e.key === '-' || e.key === '_') { keyZoom(1.15); e.preventDefault(); }
  }
});
function keyOrbit(dAz, dEl) {
  const q = new THREE.Quaternion().setFromUnitVectors(camera.up.clone().normalize(), new THREE.Vector3(0, 1, 0));
  const off = camera.position.clone().sub(controls.target).applyQuaternion(q);
  const sp = new THREE.Spherical().setFromVector3(off);
  sp.theta -= dAz;
  sp.phi = Math.max(0.01, Math.min(Math.PI - 0.01, sp.phi - dEl));
  off.setFromSpherical(sp).applyQuaternion(q.invert());
  camera.position.copy(controls.target).add(off);
  camera.lookAt(controls.target);
  controls.update();
  viewName = ''; syncViewButtons();
  requestRender();
}
function keyZoom(f) {
  if (camera === ortho) { ortho.zoom = Math.max(0.01, ortho.zoom / f); ortho.updateProjectionMatrix(); }
  else { camera.position.sub(controls.target).multiplyScalar(f).add(controls.target); }
  controls.update();
  requestRender();
}

async function cropBlob(blob, c) {
  const bmp = await createImageBitmap(blob);
  const x = Math.round(c.x * bmp.width), y = Math.round(c.y * bmp.height), w = Math.round(c.w * bmp.width), h = Math.round(c.h * bmp.height);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, x, y, w, h, 0, 0, w, h);
  if (bmp.close) bmp.close();
  return new Promise(res => cv.toBlob(res, 'image/png'));
}
function frameRect() {
  const W = stage.clientWidth, H = stage.clientHeight, ratio = +$('#rpRatio').value; // w / h
  let w = W * 0.86, h = w / ratio;
  if (h > H * 0.86) { h = H * 0.86; w = h * ratio; }
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
function updateFrame() {
  const el = $('#capFrame'); const on = $('#rpShow').checked;
  el.hidden = !on; if (!on) return;
  const r = frameRect();
  Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
}
$('#rpShow').addEventListener('change', updateFrame); $('#rpRatio').addEventListener('change', updateFrame);
new ResizeObserver(updateFrame).observe(stage);
$('#rpSave').addEventListener('click', async () => {
  if (!state) { toast(t('rpNeed')); return; }
  const r = frameRect(), W = stage.clientWidth, H = stage.clientHeight;
  const prevLine = $('#expLine').checked, prevScale = $('#expScale').value, prevBg = $('#expBg').value;
  $('#expLine').checked = $('#rpSrc').value === 'line'; $('#expScale').value = '4'; $('#expBg').value = 'white';
  exportCrop = { x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H, tag: ($('#rpRatio').value === '0.8' ? '4x5' : '3x2') + '_' + $('#rpSrc').value };
  try { await exportPng(); } finally { exportCrop = null; $('#expLine').checked = prevLine; $('#expScale').value = prevScale; $('#expBg').value = prevBg; }
});
function goHome() {
  const h = state && state.home; if (!h) return;
  if (sp && sp.active) sp.exit();
  useCamera(h.cam);
  const c = h.cam === 'ortho' ? ortho : persp;
  c.up.copy(h.up); c.position.copy(h.pos); controls.target.copy(h.target);
  c.lookAt(h.target); setNearFar(h.r);
  controls.update(); viewName = h.viewName; syncViewButtons(); requestRender();
}
$('#homeBtn').addEventListener('click', goHome);
info = createInfo({ THREE, canvas, $, t, getState: () => state, clipPlanes, fmt, requestRender, pointInClip, getCamera: () => camera, disabled: () => measureOn || !!(sp && sp.active) });
rprompt = createPrompt({ $, t, toast });

/* ---------------- section perspective + explode wiring ---------------- */
function secSnapshot() { return JSON.parse(JSON.stringify(sec)); }
function syncSecRows() {
  $$('.sec-row').forEach(row => {
    const a = row.dataset.axis;
    $('.sec-on', row).checked = sec[a].on; $('.sec-range', row).value = sec[a].v;
    $('.sec-flip', row).setAttribute('aria-pressed', String(sec[a].flip)); row.classList.toggle('on', sec[a].on);
  });
}
const spCtx = {
  THREE, renderer, scene, canvas, stage, $, $$, t, app: $('#app'),
  getState: () => state, computeBox, sliderValue, sec, clipPlanes, fmt, toast, requestRender,
  capObjects: () => capObjects, measureGroup: () => measureGroup, pointInClip,
  setSectionRows: syncSecRows, updatePlanes, updateSectionLabels, rebuildCaps, setPanel,
  getSecSnapshot: secSnapshot,
  setSecSnapshot: snap => { for (const a of ['x', 'y', 'z']) Object.assign(sec[a], snap[a]); syncSecRows(); updatePlanes(); updateSectionLabels(); },
  saveView: () => ({ viewName }), restoreView: v => { viewName = v.viewName; syncViewButtons(); },
  controlsEnabled: on => { if (!on) { controlsP.enabled = false; controlsO.enabled = false; } else controls.enabled = true; },
  measureOn: () => measureOn, setMeasure, clearSelection: () => { if (info) info.select(null); },
};
ex = createExplode({ THREE, getState: () => state, changed: () => { if (sp && sp.active) sp.onModelChange(); requestRender(); } });
spCtx.explode = ex;
function syncExplodeUI() {
  $('#exKind').value = ex.st.kind; $('#exDir').value = ex.st.dir; $('#exGap').value = Math.round(ex.st.gap * 100); $('#exGapVal').textContent = Math.round(ex.st.gap * 100) + '%';
  $('#exLayersBox').hidden = ex.st.kind !== 'layers';
}
spCtx.syncExplodeUI = syncExplodeUI;
function buildExplodeLayers() {
  const box = $('#exLayerList'); box.textContent = '';
  if (!state) return;
  const used = [...new Set(state.sources.map(o => o.userData.layer))];
  for (const li of used) {
    const l = document.createElement('label'); l.className = 'chk wide';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !ex.st.layers || ex.st.layers.has(li);
    cb.addEventListener('change', () => {
      const set = ex.st.layers || new Set(used);
      if (cb.checked) set.add(li); else set.delete(li);
      ex.set({ layers: set });
    });
    const nm = document.createElement('span'); nm.textContent = state.layers[li] ? state.layers[li].name : '#' + li;
    l.append(cb, nm); box.append(l);
  }
}
function exPatch(p) { if (sp && sp.active) ex.sideVec.copy(sp.explodeSide()); ex.set(p); syncExplodeUI(); }
$('#exKind').addEventListener('change', e => { exPatch({ kind: e.target.value, layers: null }); if (e.target.value === 'layers') buildExplodeLayers(); });
$('#exDir').addEventListener('change', e => exPatch({ dir: e.target.value }));
$('#exGap').addEventListener('input', e => { if (!state) return; if ($('#exKind').value === 'layers') buildExplodeLayers(); exPatch({ gap: +e.target.value / 100 }); });
sp = createSP(spCtx);

/* ---------------- boot ---------------- */
applyLang();
applyBg();
resize();
// test hook (also handy for scripted checks); no network involved
window.AtelierView = {
  loadBuffer: (buf, name = 'file.3dm') => loadBuffer(buf, name, name.split('.').pop().toLowerCase(), buf.byteLength),
  get state() { return state; }, THREE,
  setSection: (a, on, v) => { sec[a].on = on; if (v != null) sec[a].v = v; const row = $(`.sec-row[data-axis="${a}"]`); $('.sec-on', row).checked = on; $('.sec-range', row).value = sec[a].v; row.classList.toggle('on', on); updatePlanes(); updateSectionLabels(); rebuildCaps(); },
  setMode: m => { mode = m; applyMode(); },
  sp, ex, sec, objInfo: info, goHome, rprompt,
  info: () => renderer.info,
  get camera() { return camera; }, render: () => render(), exportPng: () => exportPng(), clipPlanes, pickPoint: (x, y) => pickPoint(x, y), edgeMats, faceMats,
};
