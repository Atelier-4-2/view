// Atelier 4·2 View — render prompt helper. No API calls: the user copies prompts into the image tool of their choice.
// All wording below is original to this project.

export const PROMPT_DICT = {
  ko: {
    rp: 'AI 렌더 프롬프트', rpCapture: '렌더용 캡처', rpFrame: '틀', rpR45: '4:5', rpR32: '3:2', rpSrc: '캡처 종류', rpWhite: '흰 모형', rpLine: '선화',
    rpShow: '틀 보기', rpSave: '캡처 PNG 저장', rpSaved: '캡처를 저장했습니다', rpNeed: '모델을 먼저 여세요.',
    rpInfo: '프로젝트 정보', rpMat: '재료', rpMood: '분위기', rpPlace: '장소', rpMatPh: '예: 노출 콘크리트, 목재 루버', rpMoodPh: '예: 흐린 날 오전, 차분함', rpPlacePh: '예: 파리 근교 주거지',
    rpPrinciples: '공통 원칙', rpP1: '카메라, 매스, 창, 기둥은 그대로 둡니다.', rpP2: '한 번에 하나만 추가합니다.', rpP3: '바꿀 영역에는 마스크를 쓰는 것을 권합니다.', rpP4: '형태가 바뀌면 변화 강도를 낮춥니다.',
    rpCopy: '프롬프트 복사', rpCopied: '복사했습니다', rpCopyFail: '복사하지 못했습니다. 직접 선택해 복사하세요.',
    rpTerms: '생성된 이미지는 사용한 서비스의 약관을 따릅니다. 이 도구는 이미지 서비스를 호출하지 않습니다.',
    s0t: '0 · 캡처 점검', s0d: '캡처 이미지가 깨끗한지 먼저 봅니다. 창과 기둥이 또렷하고 그림자·글자·스케일 표시가 없어야 합니다.',
    s1t: '1 · 재료', s1d: '형태는 그대로 두고 표면 재료만 입힙니다.',
    s2t: '2 · 실내', s2d: '유리 안쪽에 보이는 실내만 만듭니다. 바깥 입면은 건드리지 않습니다.',
    s3t: '3 · 외부 가구', s3d: '바닥에 놓이는 벤치, 화분, 자전거 거치대 같은 가구만 더합니다.',
    s4t: '4 · 사람', s4d: '작은 인물을 적당히 더합니다. 건물을 가리지 않게 합니다.',
    s5t: '5 · 식재·하늘', s5d: '나무와 풀, 하늘을 더합니다. 건물 윤곽을 덮지 않게 합니다.',
    s6t: '6 · 마감', s6d: '날씨, 빛의 색, 전체 색감만 다듬습니다. 형태는 바뀌지 않아야 합니다.',
  },
  fr: {
    rp: 'Prompts de rendu IA', rpCapture: 'Capture pour le rendu', rpFrame: 'Cadre', rpR45: '4:5', rpR32: '3:2', rpSrc: 'Type de capture', rpWhite: 'Maquette blanche', rpLine: 'Trait',
    rpShow: 'Afficher le cadre', rpSave: 'Enregistrer la capture PNG', rpSaved: 'Capture enregistrée', rpNeed: 'Ouvrez d’abord un modèle.',
    rpInfo: 'Infos du projet', rpMat: 'Matériaux', rpMood: 'Ambiance', rpPlace: 'Lieu', rpMatPh: 'ex. béton brut, lames de bois', rpMoodPh: 'ex. matin nuageux, calme', rpPlacePh: 'ex. banlieue de Paris, logements',
    rpPrinciples: 'Principes communs', rpP1: 'Garder la caméra, le volume, les fenêtres et les poteaux.', rpP2: 'N’ajouter qu’une chose à la fois.', rpP3: 'Utiliser un masque sur la zone à modifier.', rpP4: 'Si la forme change, baisser l’intensité de variation.',
    rpCopy: 'Copier le prompt', rpCopied: 'Copié', rpCopyFail: 'Copie impossible. Sélectionnez le texte à la main.',
    rpTerms: 'Les images générées suivent les conditions du service utilisé. Cet outil n’appelle aucun service d’images.',
    s0t: '0 · Vérifier la capture', s0d: 'Vérifiez d’abord que la capture est propre : fenêtres et poteaux nets, sans ombre, texte ni échelle.',
    s1t: '1 · Matériaux', s1d: 'Garder la forme et ne poser que les matériaux de surface.',
    s2t: '2 · Intérieur', s2d: 'Créer seulement l’intérieur visible derrière le verre. Ne pas toucher à la façade.',
    s3t: '3 · Mobilier extérieur', s3d: 'Ajouter seulement le mobilier posé au sol : bancs, jardinières, arceaux vélos.',
    s4t: '4 · Personnes', s4d: 'Ajouter quelques silhouettes, sans masquer le bâtiment.',
    s5t: '5 · Végétation et ciel', s5d: 'Ajouter arbres, herbes et ciel sans recouvrir le contour du bâtiment.',
    s6t: '6 · Finition', s6d: 'Affiner seulement la météo, la couleur de la lumière et l’ambiance générale. La forme ne doit pas bouger.',
  },
};

// English prompts, original wording; {mat} {mood} {place} are filled from the project fields.
export const STEPS = [
  { id: 's0', prompt: 'Check only, do not generate yet. The attached image is a clean capture of an architectural model: keep this exact camera, massing, window grid and column rhythm as the fixed reference for every later step. Nothing in the image may be added, removed or moved.' },
  { id: 's1', prompt: 'Using the attached capture as a strict reference, keep the camera, massing, windows and columns exactly as they are. Only apply realistic surface materials: {mat}. Keep the setting {place}, {mood}. Do not add people, plants, furniture or sky details in this step.' },
  { id: 's2', prompt: 'Keep the image unchanged outside the glazed openings. Behind the glass only, add a plausible lived-in interior with soft warm lighting, consistent with {mood}. Do not alter the facade, frames, columns or reflections on the outside.' },
  { id: 's3', prompt: 'Keep everything in the image as it is. Add only a few pieces of outdoor furniture on the ground near the building (benches, planters, bicycle racks), suited to {place}. They must not hide the facade or change its geometry.' },
  { id: 's4', prompt: 'Keep everything in the image as it is. Add a small number of people at believable scale (adults about 1.7 m tall), walking or standing apart from each other, dressed for {mood}. They must not cover windows, columns or entrances.' },
  { id: 's5', prompt: 'Keep the building exactly as it is. Add trees, grass and a sky that fit {place} and {mood}. Vegetation stays behind or beside the building and never covers its outline; sky stays soft and does not compete with the facade.' },
  { id: 's6', prompt: 'Keep geometry, people and vegetation unchanged. Only refine the overall atmosphere: weather and light color for {mood}, gentle contrast, natural color grading, materials still reading as {mat}. If any shape starts to change, lower the variation strength.' },
];

export function createPrompt(ctx) {
  const { $, t } = ctx;
  const vals = { mat: '', mood: '', place: '' };
  const fb = { mat: 'the materials of the project', mood: 'a calm everyday mood', place: 'the project site' };
  const fillText = (s) => s.replace(/\{(mat|mood|place)\}/g, (_, k) => (vals[k].trim() || fb[k]));

  function build() {
    const box = $('#rpSteps'); box.textContent = '';
    STEPS.forEach(st => {
      const card = document.createElement('div'); card.className = 'rp-card';
      const h = document.createElement('h4'); h.textContent = t(st.id + 't');
      const d = document.createElement('p'); d.className = 'hint'; d.textContent = t(st.id + 'd');
      const ta = document.createElement('textarea'); ta.readOnly = true; ta.rows = 5; ta.value = fillText(st.prompt); ta.setAttribute('aria-label', t(st.id + 't'));
      ta.dataset.step = st.id;
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn sm'; b.textContent = t('rpCopy');
      b.addEventListener('click', async () => {
        const txt = ta.value;
        try { await navigator.clipboard.writeText(txt); ctx.toast(t('rpCopied'), 1500); }
        catch (e) { ta.select(); try { document.execCommand('copy'); ctx.toast(t('rpCopied'), 1500); } catch (e2) { ctx.toast(t('rpCopyFail')); } }
      });
      card.append(h, d, ta, b); box.append(card);
    });
  }
  function refresh() { build(); }
  for (const k of ['mat', 'mood', 'place']) {
    const el = $('#rp' + k[0].toUpperCase() + k.slice(1) + 'In');
    el.addEventListener('input', () => { vals[k] = el.value; $$all(`#rpSteps textarea`).forEach(ta => { const st = STEPS.find(s => s.id === ta.dataset.step); ta.value = fillText(st.prompt); }); });
  }
  function $$all(s) { return [...document.querySelectorAll(s)]; }
  build();
  return { refresh, vals };
}
