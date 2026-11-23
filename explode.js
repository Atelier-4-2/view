// Atelier 4·2 View — explode engine (layers or floors), shared by the main viewer and the section-perspective mode.
export const EXPLODE_DICT = {
  ko: {
    explode: '분해', exKind: '묶음', exFloors: '층 (높이 군집)', exLayers: '레이어 단위', exDir: '방향', exUp: '위', exSide: '옆',
    exGap: '간격', exLayerPick: '띄울 레이어', exHint: '층은 슬래브 높이로 자동 묶습니다. 간격 0이면 원래 위치입니다.', exNone: '묶음을 만들 수 없습니다.',
  },
  fr: {
    explode: 'Éclaté', exKind: 'Groupes', exFloors: 'Niveaux (hauteur)', exLayers: 'Par calque', exDir: 'Direction', exUp: 'Haut', exSide: 'Côté',
    exGap: 'Écart', exLayerPick: 'Calques à écarter', exHint: 'Les niveaux sont déduits de la hauteur des dalles. Écart 0 = position d’origine.', exNone: 'Impossible de former des groupes.',
  },
};

export function createExplode(ctx) {
  const { THREE } = ctx;
  const st = { kind: 'floors', dir: 'up', gap: 0, layers: null /* Set of layer indexes, null = all */ };
  const sideVec = new THREE.Vector3(1, 0, 0);
  let groups = null;
  const meters = () => {
    const s = ctx.getState();
    const u = s && s.unit;
    const f = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, dm: 0.1 }[u];
    if (f) return f;
    const d = s ? s.box.getSize(new THREE.Vector3()).length() : 1;
    return d > 2000 ? 0.001 : 1;
  };

  function baseOf(o) { if (!o.userData.exBase) o.userData.exBase = o.position.clone(); return o.userData.exBase; }
  function resetPositions() {
    const s = ctx.getState(); if (!s) return;
    for (const o of s.sources) if (o.userData.exBase) o.position.copy(o.userData.exBase);
    s.root.updateMatrixWorld(true);
  }

  function buildGroups() {
    const s = ctx.getState(); groups = null;
    if (!s) return null;
    resetPositions();
    const src = s.sources;
    const map = new Map();
    const layerOf = o => o.userData.layer;
    const fromLayers = () => {
      const used = [...new Set(src.map(layerOf))].filter(i => !st.layers || st.layers.has(i));
      const zc = new Map();
      for (const o of src) {
        const g = o.geometry; if (!g) continue;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox.clone().applyMatrix4(o.matrixWorld);
        const c = zc.get(layerOf(o)) || { sum: 0, n: 0 };
        c.sum += (b.min.z + b.max.z) / 2; c.n++; zc.set(layerOf(o), c);
      }
      used.sort((a, b) => (zc.get(a).sum / zc.get(a).n) - (zc.get(b).sum / zc.get(b).n));
      const idx = new Map(used.map((l, i) => [l, i]));
      for (const o of src) map.set(o, idx.has(layerOf(o)) ? idx.get(layerOf(o)) : 0);
      return { map, n: used.length };
    };
    if (st.kind === 'layers') { groups = fromLayers(); return groups; }
    // floors: cluster slab bottoms
    const T = s.box.getSize(new THREE.Vector3());
    const m = meters();
    const tmp = new THREE.Box3();
    const bbs = new Map();
    for (const o of src) {
      const g = o.geometry; if (!g) continue;
      if (!g.boundingBox) g.computeBoundingBox();
      if (g.boundingBox.isEmpty()) continue;
      bbs.set(o, tmp.copy(g.boundingBox).applyMatrix4(o.matrixWorld).clone());
    }
    const slabs = [];
    for (const [o, b] of bbs) {
      if (!o.isMesh) continue;
      const dz = b.max.z - b.min.z, dx = b.max.x - b.min.x, dy = b.max.y - b.min.y;
      if (dz <= Math.max(0.04 * T.z, 0.45 / m) && dx * dy >= 0.03 * T.x * T.y) slabs.push(b.min.z);
    }
    slabs.sort((a, b) => a - b);
    const levels = [];
    for (const z of slabs) {
      const last = levels[levels.length - 1];
      if (last && z - last.max < 1.0 / m) { last.max = z; last.sum += z; last.n++; }
      else levels.push({ min: z, max: z, sum: z, n: 1 });
    }
    if (levels.length < 2) { groups = fromLayers(); groups.fallback = true; return groups; }
    const lv = levels.map(l => l.sum / l.n);
    let gmin = Infinity, gmax = -Infinity;
    for (const o of src) {
      const b = bbs.get(o);
      let g = 0;
      if (b) for (const L of lv) if (L <= b.min.z + 0.15 / m) g++;
      map.set(o, g); gmin = Math.min(gmin, g); gmax = Math.max(gmax, g);
    }
    for (const [o, g] of map) map.set(o, g - gmin);
    groups = { map, n: gmax - gmin + 1 };
    return groups;
  }

  function apply() {
    const s = ctx.getState(); if (!s) return;
    if (st.gap <= 0) { resetPositions(); ctx.changed(); return; }
    if (!groups) buildGroups();
    if (!groups) return;
    resetPositions();
    const T = s.box.getSize(new THREE.Vector3());
    const per = st.dir === 'up' ? T.z * 0.6 * st.gap / Math.max(1, groups.n - 1) : Math.max(T.x, T.y) * 0.6 * st.gap / Math.max(1, groups.n - 1);
    const dirW = st.dir === 'up' ? new THREE.Vector3(0, 0, 1) : sideVec.clone();
    for (const o of s.sources) {
      const g = groups.map.get(o) || 0;
      if (!g) continue;
      const base = baseOf(o);
      const par = o.parent;
      par.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(par.matrixWorld).invert();
      const off = dirW.clone().multiplyScalar(per * g);
      const local = off.applyMatrix4(inv).sub(new THREE.Vector3().applyMatrix4(inv));
      o.position.copy(base).add(local);
    }
    s.root.updateMatrixWorld(true);
    ctx.changed();
  }
  return {
    st, sideVec, get groups() { return groups; },
    set(patch, rebuild = true) { Object.assign(st, patch); if (rebuild) groups = null; apply(); },
    rebuild() { groups = null; apply(); },
    reset() { st.gap = 0; groups = null; resetPositions(); },
    clearCache() { groups = null; },
  };
}
