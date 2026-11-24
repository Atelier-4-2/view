// Atelier 4·2 View — object info panel (click an object) with an accent outline on the selection.
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

export const INFO_DICT = {
  ko: {
    objInfo: '부재 정보', objHint: '모델의 부재를 누르면 정보가 여기에 나옵니다.', oName: '이름', oLayer: '레이어', oType: '종류', oSize: '크기', oMat: '재질', oUser: '사용자 텍스트',
    oNoName: '(이름 없음)', oNone: '없음', oClear: '선택 해제', home: '처음 구도',
    tBrep: '폴리서피스/솔리드', tMesh: '메시', tCurve: '곡선', tPoint: '점', tExtrusion: '압출', tSurface: '서피스', tInstance: '블록 인스턴스', tOther: '기타',
  },
  fr: {
    objInfo: 'Infos de l’objet', objHint: 'Cliquez un objet du modèle pour afficher ses informations.', oName: 'Nom', oLayer: 'Calque', oType: 'Type', oSize: 'Taille', oMat: 'Matériau', oUser: 'Texte utilisateur',
    oNoName: '(sans nom)', oNone: 'aucun', oClear: 'Désélectionner', home: 'Vue initiale',
    tBrep: 'Polysurface / solide', tMesh: 'Maillage', tCurve: 'Courbe', tPoint: 'Point', tExtrusion: 'Extrusion', tSurface: 'Surface', tInstance: 'Instance de bloc', tOther: 'Autre',
  },
};

export function createInfo(ctx) {
  const { THREE, canvas, $, t } = ctx;
  let sel = null, hl = null, hlMat = null;
  const ray = new THREE.Raycaster();

  function clearHL() {
    if (hl) { hl.parent && hl.parent.remove(hl); hl = null; }
    if (hlMat) { hlMat.dispose(); hlMat = null; }
  }
  function select(o) {
    clearHL();
    sel = o;
    if (o) {
      const src = o.userData.edges;
      const g = src ? src.geometry : null;
      if (g) {
        if (src.isLineSegments2) {
          hlMat = new LineMaterial({ color: 0xE6B89C, linewidth: 3.2, clippingPlanes: ctx.clipPlanes });
          hlMat.resolution.set(canvas.width, canvas.height);
          hl = new LineSegments2(g, hlMat);
        } else {
          hlMat = new THREE.LineBasicMaterial({ color: 0xE6B89C, clippingPlanes: ctx.clipPlanes });
          hl = new THREE.LineSegments(g, hlMat);
        }
        hl.frustumCulled = false; hl.renderOrder = 50; hl.userData.helper = true; hl.userData.hl = true;
        o.add(hl);
      }
    }
    fill();
    if (o) { const d = $('#secObj'); if (d) d.open = true; }
    ctx.requestRender();
  }
  const typeLabel = o => {
    const ot = (o.userData.objectType || '').toString();
    const map = { Brep: 'tBrep', Mesh: 'tMesh', Curve: 'tCurve', Point: 'tPoint', Extrusion: 'tExtrusion', Surface: 'tSurface', InstanceReference: 'tInstance' };
    const k = map[ot] || (o.isMesh ? 'tMesh' : o.isLine ? 'tCurve' : o.isPoints ? 'tPoint' : 'tOther');
    return t(k) + (ot && !map[ot] ? ' (' + ot + ')' : '');
  };
  function userStrings(o) {
    const a = o.userData.attributes || {};
    const us = a.userStrings;
    const out = [];
    if (Array.isArray(us)) for (const e of us) { if (Array.isArray(e)) out.push([String(e[0]), String(e[1])]); else if (e && typeof e === 'object') out.push([String(e.key ?? e[0]), String(e.value ?? e[1])]); }
    else if (us && typeof us === 'object') for (const k of Object.keys(us)) out.push([k, String(us[k])]);
    return out;
  }
  function fill() {
    const dl = $('#objDl'); dl.textContent = '';
    $('#objHint').hidden = !!sel; $('#objClear').hidden = !sel;
    const s = ctx.getState();
    if (!sel || !s) return;
    const a = sel.userData.attributes || {};
    const L = s.layers[sel.userData.layer];
    const bb = new THREE.Box3(); sel.updateWorldMatrix(true, false);
    const g = sel.geometry; if (g) { if (!g.boundingBox) g.computeBoundingBox(); bb.copy(g.boundingBox).applyMatrix4(sel.matrixWorld); }
    const size = bb.isEmpty() ? null : bb.getSize(new THREE.Vector3());
    const u = s.unit ? ' ' + s.unit : '';
    const mat = sel.userData.origMat; const mname = mat && !Array.isArray(mat) && mat.name ? mat.name : '';
    const rows = [
      [t('oName'), a.name || t('oNoName')],
      [t('oLayer'), (L && (L.fullPath || L.name)) || '-'],
      [t('oType'), typeLabel(sel)],
      [t('oSize'), size ? [size.x, size.y, size.z].map(v => ctx.fmt(v)).join(' × ') + u : '-'],
      [t('oMat'), mname || '-'],
    ];
    for (const [k, v] of rows) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
    const us = userStrings(sel);
    const h = document.createElement('dt'); h.className = 'full'; h.textContent = t('oUser'); dl.append(h);
    if (!us.length) { const dd = document.createElement('dd'); dd.className = 'full muted'; dd.textContent = t('oNone'); dl.append(dd); }
    for (const [k, v] of us) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
  }
  function pick(ev) {
    const s = ctx.getState(); if (!s) return null;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), ctx.getCamera());
    const th = Math.max(s.box.getSize(new THREE.Vector3()).length() * 0.003, 1e-6);
    ray.params.Line.threshold = th; ray.params.Points.threshold = th;
    const targets = s.sources.filter(o => o.visible && (o.isMesh || o.isLine));
    const hits = ray.intersectObjects(targets, false).filter(h => ctx.pointInClip(h.point));
    return hits.length ? hits[0].object : null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (!down) return;
    const d = down; down = null;
    if (ctx.disabled() || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > (e.pointerType === 'touch' ? 12 : 5) || performance.now() - d.t > 600) return;
    select(pick(e));
  });
  $('#objClear').addEventListener('click', () => select(null));
  return { onResize(w, h) { if (hlMat && hlMat.resolution) hlMat.resolution.set(w, h); }, select, reset() { clearHL(); sel = null; fill(); }, refresh: fill, get selected() { return sel; } };
}
