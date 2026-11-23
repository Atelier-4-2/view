/* atelier-cloud.js — Atelier 4·2 shared "project cloud" layer.
   Standalone ES module, no imports, no UI. Same-origin tools (/share/, /site/, /crit/, /view/, /board/) import this one file.
   Providers: Google Drive (scope drive.file) and OneDrive (Files.ReadWrite.AppFolder + User.Read), both by plain fetch.
   Tokens live in sessionStorage only (per tab, survives navigation between the tools, never localStorage).

   const cloud = createCloud({ googleClientId, msClientId });
   await cloud.restore() || await cloud.signIn('google' | 'onedrive');
   const p = await cloud.createProject('Colombes_p10');      // or cloud.openProject(id)
   await p.updateManifest(m => { m.tools.board = { path: 'board/main.json' }; });
   const { data, version } = await p.readJson('board/main.json');
   await p.writeJson('board/main.json', data, { version });   // throws ConflictError when someone else wrote first
   await p.uploadBlob('files/renders/a.mov', file, { onProgress });
   const blob = await p.downloadBlob('files/renders/a.mov');
*/

/* ===================== constants & errors ===================== */
export const FOLDERS = ['files', 'board', 'crit', 'models'];
export const MANIFEST = 'project.json';
export const SESSION_KEY = 'atelier-cloud-session';
export const PROVIDER_KEY = 'atelier-cloud-provider';
/** ?mock=1 / test overrides never touch the real keys: a fake token must not leak into a real tab or another tool. */
export const MOCK_SESSION_KEY = 'atelier-cloud-session-mock';
const MOCK_SUFFIX = '-mock';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const GDRIVE = 'https://www.googleapis.com/drive/v3';
const GUPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const MS_SCOPES = ['Files.ReadWrite.AppFolder', 'User.Read'];
const GSI_SRC = 'https://accounts.google.com/gsi/client';
export const MSAL_SRC = 'https://cdn.jsdelivr.net/npm/@azure/msal-browser@3.30.0/lib/msal-browser.min.js';
/** SRI of the exact pinned file above (sha384). Bump both together; index.html's CSP lists the same URL. */
export const MSAL_SRI = 'sha384-YnOjsoOxSYo65h1BXWnSq24bFbqW8HfzMWSEQxYEMRmjW9Vl1J3HZI3iZxqNYvIi';
const GOOGLE_RESUME_PREFIX = 'https://www.googleapis.com/upload/drive/v3/';
export const GOOGLE_CHUNK = 8 * 1024 * 1024;           // multiple of 256 KiB
export const GRAPH_ALIGN = 320 * 1024;
export const ONEDRIVE_CHUNK = 32 * GRAPH_ALIGN;        // 10 MiB, multiple of 320 KiB
const MAX_RETRIES = 6;

/** code: api-disabled | access-denied | conflict | exists | not-found | auth-expired | auth-required | admin-consent | network | http | bad-path */
export class CloudError extends Error {
  constructor(code, message, status, body) {
    super(message || code); this.name = 'CloudError'; this.code = code; this.body = body;
    // auth failures are 401s: status 0 means "network" and is retried, a dead token must not be
    this.status = status || ((code === 'auth-expired' || code === 'auth-required') ? 401 : 0);
  }
}
export class ConflictError extends CloudError {
  constructor(message) { super('conflict', message || 'version conflict', 409); this.name = 'ConflictError'; }
}

/* ===================== pure helpers (exported for tests) ===================== */
export const chunkRange = (offset, size, chunk) => {
  const start = Math.max(0, Math.min(offset, size)), end = Math.min(start + chunk, size);
  return { start, end, header: size === 0 ? 'bytes */0' : `bytes ${start}-${end - 1}/${size}` };
};
export const parseRangeHeader = (v) => { const m = /bytes=\d+-(\d+)/i.exec(v || ''); return m ? Number(m[1]) + 1 : 0; };
export const parseNextExpected = (r) => (Array.isArray(r) && r.length ? Number(String(r[0]).split('-')[0]) || 0 : 0);
export const backoff = (attempt, rand = 0.5) => Math.round(Math.min(30000, 800 * 2 ** Math.max(0, attempt - 1)) * (0.75 + rand * 0.5));
export const retryable = (s) => s === 0 || s === 408 || s === 429 || (s >= 500 && s <= 599);
export const isAdminConsentError = (text) =>
  /AADSTS(65001|65002|90094|900941|650056|700016)|admin_?consent|need admin approval|consent_required/i.test(String(text || ''));
/** A Google resumable-session URI is only ever sent a Bearer token if it points at the Drive upload endpoint. */
export const isGoogleUploadUri = (u) => typeof u === 'string' && u.startsWith(GOOGLE_RESUME_PREFIX);
/** Graph upload sessions: https only, on a Microsoft file host (OneDrive personal / SharePoint / Graph). */
export function isGraphUploadUri(u) {
  let x; try { x = new URL(String(u)); } catch (e) { return false; }
  if (x.protocol !== 'https:' || x.username || x.password) return false;
  const h = x.hostname.toLowerCase();
  return h.endsWith('.sharepoint.com') || h.endsWith('.files.1drv.com') || h === 'graph.microsoft.com' || h === 'api.onedrive.com';
}
/** "a.mov" taken -> "a (2).mov", "a (3).mov" ... Pure; `taken` is a Set of existing names. */
export function uniqueName(name, taken) {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
  for (let n = 2; n < 10000; n++) { const c = `${base} (${n})${ext}`; if (!taken.has(c)) return c; }
  return name + ' ' + Date.now();
}
/** Where a conflicting queued JSON write is saved when the owner chooses "keep both". */
export function conflictCopyPath(path, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const i = path.lastIndexOf('/'), dir = i < 0 ? '' : path.slice(0, i + 1), file = i < 0 ? path : path.slice(i + 1);
  const dot = file.lastIndexOf('.');
  return dir + (dot > 0 ? file.slice(0, dot) + ' (conflict ' + stamp + ')' + file.slice(dot) : file + ' (conflict ' + stamp + ')');
}
const escQ = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** "board//main.json" → ['board','main.json']; rejects '', '..', '.', backslashes. */
export function normalizePath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (!parts.length) throw new CloudError('bad-path', 'empty path');
  for (const p of parts) if (p === '.' || p === '..' || p.includes('\\') || /[\u0000-\u001f]/.test(p)) throw new CloudError('bad-path', 'bad path: ' + path);
  return parts;
}
export function newManifest(name, now = new Date().toISOString()) {
  return { schema: 1, name, created: now, updated: now, folders: [...FOLDERS], tools: {} };
}
/** Run mutator on a deep copy, stamp `updated`, make sure shape is valid. Pure. */
export function applyManifestUpdate(manifest, mutator, now = new Date().toISOString()) {
  const m = JSON.parse(JSON.stringify(manifest));
  if (!m.tools || typeof m.tools !== 'object') m.tools = {};
  const r = mutator(m);
  const out = r === undefined ? m : r;
  out.schema = 1; out.updated = now;
  if (!out.tools || typeof out.tools !== 'object') out.tools = {};
  return out;
}
/** Call fn(attempt) until it stops throwing ConflictError. */
export async function retryOnConflict(fn, attempts = 5) {
  let last;
  for (let a = 1; a <= attempts; a++) {
    try { return await fn(a); } catch (e) { if (!(e instanceof ConflictError)) throw e; last = e; }
  }
  throw last;
}

/** Flatten a tree (nested nodes with children) to Map(id → {name, path, sig}). Pure. */
export function snapshotOf(tree, prefix = '', map = new Map()) {
  for (const n of tree || []) {
    const path = prefix + n.name;
    map.set(n.id, { id: n.id, name: n.name, path, isFolder: !!n.isFolder, sig: n.isFolder ? 'dir' : [n.version || '', n.size || 0, n.modifiedTime || ''].join('|') });
    if (n.isFolder && n.children) snapshotOf(n.children, path + '/', map);
  }
  return map;
}
/** → { added, modified, removed } lists of snapshot entries. Pure. */
export function diffSnapshots(prev, next) {
  const added = [], modified = [], removed = [];
  for (const [id, n] of next) { const p = prev.get(id); if (!p) added.push(n); else if (p.sig !== n.sig || p.path !== n.path) modified.push(n); }
  for (const [id, p] of prev) if (!next.has(id)) removed.push(p);
  return { added, modified, removed };
}

/* ---- offline queue storage (IndexedDB, with an in-memory fallback for tests / private windows) ---- */
export function memoryQueueStore() {
  const m = new Map(); let n = 0;
  return { async put(rec) { if (rec.id == null) rec.id = ++n; m.set(rec.id, rec); return rec.id; }, async all() { return [...m.values()].sort((a, b) => a.id - b.id); }, async del(id) { m.delete(id); } };
}
function idbQueueStore() {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('atelier-cloud', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction('queue', mode); const out = fn(t.objectStore('queue')); t.oncomplete = () => res(out.result); t.onerror = () => rej(t.error); }); };
  return {
    put: (rec) => tx('readwrite', s => s.put(rec)),
    all: () => tx('readonly', s => s.getAll()),
    del: (id) => tx('readwrite', s => s.delete(id)),
  };
}

const sleep = (ms, signal) => new Promise((res) => { const t = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });
const abortErr = () => (typeof DOMException !== 'undefined' ? new DOMException('Aborted', 'AbortError') : Object.assign(new Error('Aborted'), { name: 'AbortError' }));

/* ===================== session storage (tokens) ===================== */
const makeSession = (key) => ({
  get() { try { return JSON.parse(sessionStorage.getItem(key)); } catch (e) { return null; } },
  set(v) { try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (e) { /* unavailable */ } },
  clear() { try { sessionStorage.removeItem(key); } catch (e) { /* unavailable */ } },
});
const makePref = (key) => ({
  get() { try { return localStorage.getItem(key); } catch (e) { return null; } },
  set(v) { try { localStorage.setItem(key, v); } catch (e) { /* unavailable */ } },
});
/** In-memory token + mirror in sessionStorage. `refresh` must return a fresh token or throw. */
function tokenHolder(provider, refresh, onExpired, ss) {
  let st = { provider, token: null, expiresAt: 0, user: null };
  let signaled = false;
  return {
    load() { const s = ss.get(); if (s && s.provider === provider && s.token && s.expiresAt > Date.now() + 60000) { st = s; return true; } return false; },
    set(token, expiresAt) { st = { ...st, provider, token, expiresAt }; signaled = false; ss.set(st); },
    setUser(u) { st.user = u; if (st.token) ss.set(st); },
    get user() { return st.user; },
    get token() { return st.token; },
    /** Valid token, or a silent refresh. If that fails, 'auth-expired' is signalled once and the error rethrown. */
    async get() { return st.token && Date.now() < st.expiresAt - 60000 ? st.token : this.force(); },
    async force() {
      try { return await refresh(); }
      catch (e) { if (!signaled) { signaled = true; onExpired && onExpired(e); } throw e; }
    },
    clear() { st = { provider, token: null, expiresAt: 0, user: null }; ss.clear(); },
  };
}
function loadScript(src, globalName, integrity) {
  return new Promise((resolve, reject) => {
    if (globalName()) return resolve();
    const s = document.createElement('script'); s.src = src; s.async = true;
    if (integrity) { s.integrity = integrity; s.crossOrigin = 'anonymous'; }
    s.onload = () => resolve(); s.onerror = () => reject(new CloudError('network', 'script load failed: ' + src));
    document.head.appendChild(s);
  });
}

/* ---- Google Identity Services ---- */
function googleAuth(clientId, holder) {
  let client = null, pending = null;
  const ready = async () => {
    if (client) return;
    await loadScript(GSI_SRC, () => window.google && window.google.accounts && window.google.accounts.oauth2);
    client = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: GOOGLE_SCOPE, callback: () => {} });
  };
  const request = async (interactive) => {
    await ready();
    if (pending) return pending;
    pending = new Promise((resolve, reject) => {
      client.callback = (r) => { pending = null; if (r.error) return reject(r.error === 'access_denied' ? new CloudError('access-denied', r.error, 403) : new CloudError(interactive ? 'auth-required' : 'auth-expired', r.error)); holder.set(r.access_token, Date.now() + (Number(r.expires_in) || 3600) * 1000); resolve(r.access_token); };
      client.error_callback = (e) => { pending = null; reject(new CloudError(interactive ? 'auth-required' : 'auth-expired', (e && e.type) || 'popup')); };
      try { client.requestAccessToken({ prompt: interactive ? 'consent' : '' }); } catch (e) { pending = null; reject(e); }
    });
    return pending;
  };
  return {
    signIn: () => request(true),
    refresh: () => request(false),
    /** After a reload the GSI script is not loaded yet: load it first, otherwise the token would never be revoked.
        The token is read synchronously (the caller clears the holder right after). */
    async signOut() {
      const t = holder.token; if (!t) return;
      try { await loadScript(GSI_SRC, () => window.google && window.google.accounts && window.google.accounts.oauth2); window.google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* offline / blocked: the token expires on its own within the hour */ }
    },
  };
}

/* ---- MSAL (popup, authority common = personal + work/school) ---- */
function msAuth(clientId, holder) {
  let pca = null, account = null;
  const init = async () => {
    if (pca) return;
    await loadScript(MSAL_SRC, () => window.msal, MSAL_SRI);
    pca = new window.msal.PublicClientApplication({
      auth: { clientId, authority: 'https://login.microsoftonline.com/common', redirectUri: location.origin + location.pathname },
      cache: { cacheLocation: 'memoryStorage' },
    });
    await pca.initialize();
  };
  const wrap = (e) => {
    const text = [e && e.errorCode, e && e.errorMessage, e && e.message].filter(Boolean).join(' ');
    return new CloudError(isAdminConsentError(text) ? 'admin-consent' : 'auth-required', text || 'sign-in failed');
  };
  const store = (r) => { account = r.account; holder.set(r.accessToken, r.expiresOn ? new Date(r.expiresOn).getTime() : Date.now() + 3300000); return r.accessToken; };
  return {
    async signIn() {
      await init();
      // re-auth after expiry: hint the same account instead of showing the chooser again
      const hint = holder.user && holder.user.emailAddress;
      try { return store(await pca.acquireTokenPopup(hint ? { scopes: MS_SCOPES, loginHint: hint } : { scopes: MS_SCOPES, prompt: 'select_account' })); } catch (e) { throw wrap(e); }
    },
    /** silent -> interactive: MSAL keeps its cache in memory, so after a reload there is no account object.
        Try to find one, then a hidden-iframe ssoSilent with the remembered login; if both fail, 'auth-expired'
        raises the "다시 로그인" bar and the button there runs the interactive popup (a user gesture, so it is not blocked). */
    async refresh() {
      await init();
      if (!account) {
        const known = pca.getAllAccounts ? pca.getAllAccounts() : [];
        if (known && known[0]) account = known[0];
      }
      if (!account) {
        const hint = holder.user && holder.user.emailAddress;
        if (!hint) throw new CloudError('auth-expired', 'sign in again');
        try { return store(await pca.ssoSilent({ scopes: MS_SCOPES, loginHint: hint })); } catch (e) { throw new CloudError('auth-expired', e && e.message); }
      }
      try { return store(await pca.acquireTokenSilent({ scopes: MS_SCOPES, account })); } catch (e) { throw new CloudError('auth-expired', e && e.message); }
    },
    signOut() { if (pca && account) { try { pca.clearCache({ account }); } catch (e) { /* ignore */ } } account = null; },
  };
}

/* ===================== Google Drive adapter ===================== */
const G_FIELDS = 'id,name,mimeType,parents,size,createdTime,modifiedTime,webViewLink,headRevisionId';
const gNode = (f) => ({
  id: f.id, name: f.name, isFolder: f.mimeType === FOLDER_MIME, mimeType: f.mimeType, size: Number(f.size || 0),
  createdTime: f.createdTime, modifiedTime: f.modifiedTime, version: f.headRevisionId || f.modifiedTime, parents: f.parents,
  webUrl: f.webViewLink || ((f.mimeType === FOLDER_MIME ? 'https://drive.google.com/drive/folders/' : 'https://drive.google.com/file/d/') + encodeURIComponent(f.id) + (f.mimeType === FOLDER_MIME ? '' : '/view')),
});

function googleAdapter({ fetchImpl, holder, auth, rootName }) {
  let rootId = null, user = null;
  const reserved = new Map(), locks = new Map();
  const nameLock = (key, fn) => { const run = (locks.get(key) || Promise.resolve()).catch(() => {}).then(fn); locks.set(key, run.catch(() => {})); return run; };
  const authed = async (url, init = {}, retried = false) => {
    const token = await holder.get();
    let res;
    try { res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + token } }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw new CloudError('network', 'network', 0); }
    if (res.status === 401 && !retried) { await holder.force(); return authed(url, init, true); }
    return res;
  };
  const fail = async (res) => {
    let b = null; try { b = await res.json(); } catch (e) { /* empty */ }
    const reasons = JSON.stringify((b && b.error) || '');
    const disabled = res.status === 403 && (/accessNotConfigured|SERVICE_DISABLED/.test(reasons) || /has not been used in project|is disabled/i.test(reasons));
    const code = disabled ? 'api-disabled' : res.status === 404 ? 'not-found' : res.status === 409 || res.status === 412 ? 'conflict' : 'http';
    if (code === 'conflict') return new ConflictError((b && b.error && b.error.message) || 'conflict');
    return new CloudError(code, (b && b.error && b.error.message) || ('HTTP ' + res.status), res.status, b);
  };
  const json = async (method, path, { query, body, signal } = {}) => {
    const init = { method, signal };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { 'Content-Type': 'application/json; charset=UTF-8' }; }
    const res = await authed(GDRIVE + path + (query ? '?' + new URLSearchParams(query) : ''), init);
    if (res.status === 204) return null;
    if (!res.ok) throw await fail(res);
    return res.json();
  };
  const listAll = async (q, fields = G_FIELDS) => {
    const out = []; let pageToken;
    do {
      const query = { q, fields: `nextPageToken,files(${fields})`, pageSize: '1000', orderBy: 'name' };
      if (pageToken) query.pageToken = pageToken;
      const r = await json('GET', '/files', { query });
      out.push(...(r.files || [])); pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  };
  const enc = encodeURIComponent;
  const children = async (id) => (await listAll(`'${escQ(id)}' in parents and trashed = false`)).map(gNode);
  const interpretUpload = async (res) => {
    if (res.status === 200 || res.status === 201) { let f = null; try { f = await res.json(); } catch (e) { /* */ } return { done: true, file: f && gNode(f) }; }
    if (res.status === 308) return { done: false, next: parseRangeHeader(res.headers.get('Range')) };
    throw await fail(res);
  };

  const a = {
    id: 'google', label: 'Google Drive', chunkSize: GOOGLE_CHUNK, mailBy: 'Google',
    get user() { return user; },
    async signIn() {
      await auth.signIn();
      const ab = await json('GET', '/about', { query: { fields: 'user(displayName,emailAddress)' } });
      user = ab.user; holder.setUser(user); return user;
    },
    resumeUser(u) { user = u; },
    signOut() { const p = auth.signOut(); user = null; rootId = null; return p; },
    async quota() { try { const r = await json('GET', '/about', { query: { fields: 'storageQuota(limit,usage)' } }); return r.storageQuota ? { usage: Number(r.storageQuota.usage), limit: r.storageQuota.limit ? Number(r.storageQuota.limit) : null } : null; } catch (e) { return null; } },
    async ensureRoot() { const f = await a.ensureFolder(rootName, 'root'); rootId = f.id; return rootId; },
    async findChild(parentId, name) {
      const r = await listAll(`name = '${escQ(name)}' and '${escQ(parentId)}' in parents and trashed = false`);
      return r[0] ? gNode(r[0]) : null;
    },
    async ensureFolder(name, parentId) {
      const hit = await a.findChild(parentId, name);
      if (hit && hit.isFolder) return hit;
      return gNode(await json('POST', '/files', { query: { fields: G_FIELDS }, body: { name, mimeType: FOLDER_MIME, parents: [parentId] } }));
    },
    async listProjects() { return (await children(rootId)).filter(n => n.isFolder); },
    async createProject(name) {
      const hit = await a.findChild(rootId, name);
      if (hit) throw new CloudError('exists', 'project exists', 409);
      return a.ensureFolder(name, rootId);
    },
    children,
    async listTree(folderId) {
      const walk = async (id) => {
        const kids = await children(id);
        await Promise.all(kids.map(async k => { if (k.isFolder) k.children = await walk(k.id); }));
        kids.sort((x, y) => (y.isFolder - x.isFolder) || x.name.localeCompare(y.name, undefined, { numeric: true }));
        return kids;
      };
      return walk(folderId);
    },
    async rename(id, name) { return gNode(await json('PATCH', '/files/' + enc(id), { query: { fields: G_FIELDS }, body: { name } })); },
    async trash(id) { return json('PATCH', '/files/' + enc(id), { query: { fields: 'id,trashed' }, body: { trashed: true } }); },
    openUrl: (n) => n.webUrl || gNode({ id: n.id, name: n.name, mimeType: n.isFolder ? FOLDER_MIME : n.mimeType }).webUrl,

    /* small text files (JSON): create-only or version-checked overwrite.
       Drive has no If-Match on media updates, so "check, then write" cannot be atomic. What this does about it:
       - overwrite: the headRevisionId is re-read immediately before the PATCH (window = one round trip), and the
         PATCH response's revision is compared with the one we saw; updateManifest() re-reads + re-applies its
         mutator on ConflictError (retry-merge), so a lost update needs two writers inside that single round trip.
       - create-only: query-then-create, then query again; if two same-name files exist the one with the lowest
         (createdTime, id) wins on every device and the loser trashes its copy and raises ConflictError.
       Remaining TOCTOU (not closable with Drive v3): two devices overwriting inside the same ~100 ms round trip. */
    async writeText({ parentId, name, text, mime = 'application/json', id, version }) {
      if (id) {
        const cur = await json('GET', '/files/' + enc(id), { query: { fields: 'id,headRevisionId,modifiedTime' } });
        if (version && (cur.headRevisionId || cur.modifiedTime) !== version) throw new ConflictError();
        const res = await authed(`${GUPLOAD}/files/${enc(id)}?uploadType=media&fields=${enc(G_FIELDS)}`, { method: 'PATCH', headers: { 'Content-Type': mime + '; charset=UTF-8' }, body: text });
        if (!res.ok) throw await fail(res);
        return gNode(await res.json());
      }
      if (await a.findChild(parentId, name)) throw new ConflictError('already exists');
      const B = 'atelier' + Math.random().toString(36).slice(2);
      const body = `--${B}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId], mimeType: mime })}\r\n--${B}\r\nContent-Type: ${mime}; charset=UTF-8\r\n\r\n${text}\r\n--${B}--`;
      const res = await authed(`${GUPLOAD}/files?uploadType=multipart&fields=${enc(G_FIELDS)}`, { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + B }, body });
      if (!res.ok) throw await fail(res);
      const mine = gNode(await res.json());
      // duplicate check: did another device create the same name between our query and our create?
      const same = (await listAll(`name = '${escQ(name)}' and '${escQ(parentId)}' in parents and trashed = false`)).sort((x, y) => String(x.createdTime).localeCompare(String(y.createdTime)) || String(x.id).localeCompare(String(y.id)));
      if (same.length > 1 && same[0].id !== mine.id) {
        try { await json('PATCH', '/files/' + enc(mine.id), { query: { fields: 'id,trashed' }, body: { trashed: true } }); } catch (e) { /* best effort */ }
        throw new ConflictError('already exists');
      }
      return mine;
    },
    async readBlob(id, signal) {
      const res = await authed(`${GDRIVE}/files/${enc(id)}?alt=media`, { signal });
      if (!res.ok) throw await fail(res);
      return res.blob();
    },
    async stat(id) { return gNode(await json('GET', '/files/' + enc(id), { query: { fields: G_FIELDS } })); },
    /** Drive changes feed from a saved start page token. check() → true when anything visible to the app changed. */
    async changeProbe() {
      let token = (await json('GET', '/changes/startPageToken', { query: { fields: 'startPageToken' } })).startPageToken;
      return {
        async check() {
          let changed = false, t = token;
          for (;;) {
            const c = await json('GET', '/changes', { query: { pageToken: t, fields: 'nextPageToken,newStartPageToken,changes(fileId)', pageSize: '100' } });
            if (c.changes && c.changes.length) changed = true;
            if (c.nextPageToken) { t = c.nextPageToken; continue; }
            token = c.newStartPageToken || t; return changed;
          }
        },
      };
    },

    /* resumable upload */
    isValidUploadUri: isGoogleUploadUri,
    /** Drive allows same-name siblings, so look first. opts.overwrite: replace the existing file's content (new revision);
        otherwise a taken name becomes "name (2).ext". Names chosen by this page are remembered so two parallel
        uploads of the same name do not both pick "(2)". */
    async startUpload({ name, parentId, size, mimeType, overwrite }) {
      const mime = mimeType || 'application/octet-stream';
      let target = name, existingId = null;
      await nameLock(parentId, async () => {
        const kids = await listAll(`'${escQ(parentId)}' in parents and trashed = false`, 'id,name,mimeType');
        const hit = kids.find(k => k.name === name && k.mimeType !== FOLDER_MIME);
        if (hit && overwrite) { existingId = hit.id; return; }
        const taken = new Set(kids.map(k => k.name)); for (const r of (reserved.get(parentId) || [])) taken.add(r);
        target = uniqueName(name, taken);
        if (!reserved.has(parentId)) reserved.set(parentId, new Set());
        reserved.get(parentId).add(target);
      });
      const url = existingId ? `${GUPLOAD}/files/${enc(existingId)}?uploadType=resumable&fields=${enc(G_FIELDS)}` : `${GUPLOAD}/files?uploadType=resumable&fields=${enc(G_FIELDS)}`;
      const res = await authed(url, {
        method: existingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) },
        body: JSON.stringify(existingId ? { mimeType: mime } : { name: target, parents: [parentId], mimeType: mime }),
      });
      if (!res.ok) throw await fail(res);
      const uri = res.headers.get('Location');
      if (!uri) throw new CloudError('http', 'no session uri', 500);
      if (!isGoogleUploadUri(uri)) throw new CloudError('http', 'unexpected upload uri', 502);
      return uri;
    },
    async queryUpload(uri, size, signal) {
      if (!isGoogleUploadUri(uri)) throw new CloudError('http', 'refusing upload uri', 400);
      return interpretUpload(await authed(uri, { method: 'PUT', headers: { 'Content-Range': `bytes */${size}` }, signal }));
    },
    async uploadChunk(uri, blob, start, total, signal) {
      if (!isGoogleUploadUri(uri)) throw new CloudError('http', 'refusing upload uri', 400);
      const r = chunkRange(start, total, blob.size || 1);
      return interpretUpload(await authed(uri, { method: 'PUT', headers: { 'Content-Range': r.header }, body: blob, signal }));
    },

    /* sharing */
    async listPermissions(id) {
      const r = await json('GET', `/files/${enc(id)}/permissions`, { query: { fields: 'permissions(id,type,role,emailAddress,displayName)' } });
      return (r.permissions || []).map(p => p.type === 'anyone' ? { ...p, url: 'https://drive.google.com/drive/folders/' + enc(id) } : p);
    },
    async shareEmails(id, emails, message) {
      const out = [];
      for (const email of emails) {
        const query = { sendNotificationEmail: 'true', fields: 'id,type,role,emailAddress' };
        if (message) query.emailMessage = message;
        try { await json('POST', `/files/${enc(id)}/permissions`, { query, body: { type: 'user', role: 'reader', emailAddress: email } }); out.push({ email, ok: true }); }
        catch (e) { out.push({ email, ok: false, error: e.message, status: e.status }); }
      }
      return out;
    },
    async setLinkSharing(id, on) {
      const perms = await a.listPermissions(id);
      const ex = perms.find(p => p.type === 'anyone');
      if (on && !ex) await json('POST', `/files/${enc(id)}/permissions`, { query: { fields: 'id,type,role' }, body: { type: 'anyone', role: 'reader', allowFileDiscovery: false } });
      if (!on && ex) await a.removePermission(id, ex.id);
      return on ? { scope: 'anyone' } : null;
    },
    removePermission: (id, pid) => json('DELETE', `/files/${enc(id)}/permissions/${enc(pid)}`),
  };
  return a;
}

/* ===================== OneDrive (Microsoft Graph) adapter ===================== */
const mapPerm = (p) => {
  const role = (p.roles && p.roles[0]) || 'read';
  const roleName = role === 'owner' ? 'owner' : role === 'write' ? 'writer' : 'reader';
  if (p.link) return { id: p.id, type: p.link.scope === 'anonymous' ? 'anyone' : p.link.scope === 'organization' ? 'organization' : 'link', role: roleName, url: p.link.webUrl };
  const u = (p.grantedToV2 && (p.grantedToV2.user || p.grantedToV2.siteUser)) || (p.grantedTo && p.grantedTo.user) || {};
  const email = (p.invitation && p.invitation.email) || u.email || u.loginName || '';
  return { id: p.id, type: 'user', role: roleName, emailAddress: email, displayName: u.displayName || email };
};
const oNode = (it) => ({
  id: it.id, name: it.name, isFolder: !!it.folder, mimeType: it.folder ? FOLDER_MIME : (it.file && it.file.mimeType) || '',
  size: it.size || 0, createdTime: it.createdDateTime, modifiedTime: it.lastModifiedDateTime, version: it.eTag || it.cTag || it.lastModifiedDateTime, webUrl: it.webUrl,
});

function onedriveAdapter({ fetchImpl, holder, auth }) {
  let rootId = null, user = null;
  const enc = encodeURIComponent;
  const authed = async (url, init = {}, retried = false) => {
    const token = await holder.get();
    let res;
    try { res = await fetchImpl(url, { ...init, headers: { ...(init.headers || {}), Authorization: 'Bearer ' + token } }); }
    catch (e) { if (e && e.name === 'AbortError') throw e; throw new CloudError('network', 'network', 0); }
    if (res.status === 401 && !retried) { await holder.force(); return authed(url, init, true); }
    return res;
  };
  const fail = async (res) => {
    let b = null; try { b = await res.json(); } catch (e) { /* empty */ }
    const e = b && b.error;
    const code = isAdminConsentError(JSON.stringify(b || '')) ? 'admin-consent' : res.status === 404 ? 'not-found' : (res.status === 409 || res.status === 412) ? 'conflict' : 'http';
    if (code === 'conflict') return new ConflictError((e && e.message) || 'conflict');
    return new CloudError(code, (e && e.message) || ('HTTP ' + res.status), res.status, b);
  };
  const json = async (method, path, { query, body, signal } = {}) => {
    const url = path.startsWith('http') ? path : GRAPH + path + (query ? '?' + new URLSearchParams(query) : '');
    const init = { method, signal };
    if (body !== undefined) { init.body = JSON.stringify(body); init.headers = { 'Content-Type': 'application/json' }; }
    const res = await authed(url, init);
    if (res.status === 204) return null;
    if (!res.ok) throw await fail(res);
    return res.json();
  };
  const SELECT = 'id,name,size,folder,file,webUrl,eTag,cTag,createdDateTime,lastModifiedDateTime';
  const children = async (id) => {
    const out = []; let url = `/me/drive/items/${enc(id)}/children`, query = { $top: '1000', $select: SELECT };
    while (url) { const r = await json('GET', url, { query }); out.push(...(r.value || [])); url = r['@odata.nextLink']; query = undefined; }
    return out.map(oNode);
  };
  const rawPut = async (url, headers, body) => {
    const res = await authed(url, { method: 'PUT', headers, body });
    if (!res.ok) throw await fail(res);
    return oNode(await res.json());
  };

  const a = {
    id: 'onedrive', label: 'OneDrive', chunkSize: ONEDRIVE_CHUNK, mailBy: 'Microsoft',
    get user() { return user; },
    async signIn() {
      await auth.signIn();
      const me = await json('GET', '/me', { query: { $select: 'displayName,mail,userPrincipalName' } });
      user = { displayName: me.displayName, emailAddress: me.mail || me.userPrincipalName }; holder.setUser(user); return user;
    },
    resumeUser(u) { user = u; },
    signOut() { const p = auth.signOut(); user = null; rootId = null; return p; },
    async quota() { try { const d = await json('GET', '/me/drive', { query: { $select: 'quota' } }); return d.quota ? { usage: d.quota.used, limit: d.quota.total } : null; } catch (e) { return null; } },
    async ensureRoot() { const r = await json('GET', '/me/drive/special/approot', { query: { $select: 'id' } }); rootId = r.id; return rootId; },
    async findChild(parentId, name) { return (await children(parentId)).find(n => n.name === name) || null; },
    async ensureFolder(name, parentId) {
      const hit = await a.findChild(parentId, name);
      if (hit && hit.isFolder) return hit;
      return oNode(await json('POST', `/me/drive/items/${enc(parentId)}/children`, { body: { name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' } }));
    },
    async listProjects() { return (await children(rootId)).filter(n => n.isFolder); },
    async createProject(name) {
      if (await a.findChild(rootId, name)) throw new CloudError('exists', 'project exists', 409);
      return a.ensureFolder(name, rootId);
    },
    children,
    async listTree(folderId) {
      const walk = async (id) => {
        const kids = await children(id);
        await Promise.all(kids.map(async k => { if (k.isFolder) k.children = await walk(k.id); }));
        kids.sort((x, y) => (y.isFolder - x.isFolder) || x.name.localeCompare(y.name, undefined, { numeric: true }));
        return kids;
      };
      return walk(folderId);
    },
    async rename(id, name) { return oNode(await json('PATCH', `/me/drive/items/${enc(id)}`, { body: { name } })); },
    trash: (id) => json('DELETE', `/me/drive/items/${enc(id)}`), // → OneDrive recycle bin
    openUrl: (n) => n.webUrl,

    /** Overwrite uses If-Match (eTag) → 412 → ConflictError. Create uses conflictBehavior=fail → 409 → ConflictError. */
    async writeText({ parentId, name, text, mime = 'application/json', id, version }) {
      const headers = { 'Content-Type': mime + '; charset=UTF-8' };
      if (id) {
        if (version) headers['If-Match'] = version;
        return rawPut(`${GRAPH}/me/drive/items/${enc(id)}/content`, headers, text);
      }
      return rawPut(`${GRAPH}/me/drive/items/${enc(parentId)}:/${enc(name)}:/content?@microsoft.graph.conflictBehavior=fail`, headers, text);
    },
    async readBlob(id, signal) {
      const res = await authed(`${GRAPH}/me/drive/items/${enc(id)}/content`, { signal });
      if (!res.ok) throw await fail(res);
      return res.blob();
    },
    async stat(id) { return oNode(await json('GET', `/me/drive/items/${enc(id)}`, { query: { $select: SELECT } })); },
    /** Graph delta on the project folder (works on personal OneDrive; school tenants may refuse → caller falls back to eTag compare). */
    async changeProbe(folderId) {
      const seed = await json('GET', `/me/drive/items/${enc(folderId)}/delta`, { query: { token: 'latest' } });
      let link = seed['@odata.deltaLink'];
      if (!link) throw new CloudError('http', 'delta unsupported', 501);
      return {
        async check() {
          let changed = false, url = link;
          for (;;) {
            const r = await json('GET', url);
            if (r.value && r.value.length) changed = true;
            if (r['@odata.nextLink']) { url = r['@odata.nextLink']; continue; }
            if (r['@odata.deltaLink']) link = r['@odata.deltaLink'];
            return changed;
          }
        },
      };
    },

    /* upload session: fragments are 320 KiB multiples; the uploadUrl is pre-authorised, so NO Authorization header */
    isValidUploadUri: isGraphUploadUri,
    async startUpload({ name, parentId, overwrite }) {
      const r = await json('POST', `/me/drive/items/${enc(parentId)}:/${enc(name)}:/createUploadSession`, { body: { item: { '@microsoft.graph.conflictBehavior': overwrite ? 'replace' : 'rename', name } } });
      if (!r.uploadUrl) throw new CloudError('http', 'no uploadUrl', 500);
      if (!isGraphUploadUri(r.uploadUrl)) throw new CloudError('http', 'unexpected upload url', 502);
      return r.uploadUrl;
    },
    async queryUpload(uri, size, signal) {
      if (!isGraphUploadUri(uri)) throw new CloudError('http', 'refusing upload uri', 400);
      let res; try { res = await fetchImpl(uri, { method: 'GET', signal }); } catch (e) { if (e && e.name === 'AbortError') throw e; throw new CloudError('network', 'network', 0); }
      if (!res.ok) throw await fail(res);
      return { done: false, next: parseNextExpected((await res.json()).nextExpectedRanges) };
    },
    async uploadChunk(uri, blob, start, total, signal) {
      if (!isGraphUploadUri(uri)) throw new CloudError('http', 'refusing upload uri', 400);
      const r = chunkRange(start, total, blob.size || 1);
      let res; try { res = await fetchImpl(uri, { method: 'PUT', headers: { 'Content-Range': r.header }, body: blob, signal }); } catch (e) { if (e && e.name === 'AbortError') throw e; throw new CloudError('network', 'network', 0); }
      if (res.status === 200 || res.status === 201) { let f = null; try { f = await res.json(); } catch (e) { /* */ } return { done: true, file: f && oNode(f) }; }
      if (res.status === 202) return { done: false, next: parseNextExpected((await res.json()).nextExpectedRanges) };
      throw await fail(res);
    },

    /* sharing */
    async listPermissions(id) { return ((await json('GET', `/me/drive/items/${enc(id)}/permissions`)).value || []).map(mapPerm); },
    async shareEmails(id, emails, message) {
      const out = [];
      for (const email of emails) {
        const body = { requireSignIn: true, sendInvitation: true, roles: ['read'], recipients: [{ email }] };
        if (message) body.message = message;
        try { await json('POST', `/me/drive/items/${enc(id)}/invite`, { body }); out.push({ email, ok: true }); }
        catch (e) { out.push({ email, ok: false, error: e.message, status: e.status }); }
      }
      return out;
    },
    async setLinkSharing(id, on) {
      const links = (await a.listPermissions(id)).filter(p => p.type === 'anyone' || p.type === 'organization');
      if (!on) { for (const p of links) await a.removePermission(id, p.id); return null; }
      if (links.length) return { scope: links[0].type };
      try { await json('POST', `/me/drive/items/${enc(id)}/createLink`, { body: { type: 'view', scope: 'anonymous' } }); return { scope: 'anyone' }; }
      catch (e) {
        if (e.status !== 403 && e.status !== 400) throw e;
        await json('POST', `/me/drive/items/${enc(id)}/createLink`, { body: { type: 'view', scope: 'organization' } });
        return { scope: 'organization', fallback: true };
      }
    },
    removePermission: (id, pid) => json('DELETE', `/me/drive/items/${enc(id)}/permissions/${enc(pid)}`),
  };
  return a;
}

/* ===================== Project handle ===================== */
class Project {
  constructor(cloud, adapter, node) {
    this.cloud = cloud; this.adapter = adapter; this.id = node.id; this.name = node.name; this.node = node;
    this.webUrl = node.webUrl; this._dirs = new Map([['', node.id]]); this._locks = new Map();
    // Sharing targets files/ (what the share UI lists and uploads into), not the project root:
    // board/, crit/, models/ and project.json are the tools' own working data.
    const fid = () => this.folderId('files');
    this.share = {
      folderId: fid,
      emails: async (emails, msg) => adapter.shareEmails(await fid(), emails, msg),
      setLink: async (on) => adapter.setLinkSharing(await fid(), on),
      list: async () => adapter.listPermissions(await fid()),
      remove: async (permId) => adapter.removePermission(await fid(), permId),
    };
  }
  /** Id of a folder path under the project ("files", "board/sub"); created on demand. */
  async folderId(dirPath = '') {
    const parts = dirPath ? normalizePath(dirPath) : [];
    let acc = '', parent = this.id;
    for (const p of parts) {
      acc = acc ? acc + '/' + p : p;
      if (!this._dirs.has(acc)) this._dirs.set(acc, (await this.adapter.ensureFolder(p, parent)).id);
      parent = this._dirs.get(acc);
    }
    return parent;
  }
  async _split(path, create) {
    const parts = normalizePath(path); const name = parts.pop();
    const dir = parts.join('/');
    if (!create && dir && !this._dirs.has(dir)) {
      let parent = this.id, acc = '';
      for (const p of parts) { acc = acc ? acc + '/' + p : p; if (!this._dirs.has(acc)) { const n = await this.adapter.findChild(parent, p); if (!n || !n.isFolder) throw new CloudError('not-found', 'no folder ' + acc, 404); this._dirs.set(acc, n.id); } parent = this._dirs.get(acc); }
    }
    return { parentId: await (create ? this.folderId(dir) : (dir ? this._dirs.get(dir) : this.id)), name };
  }
  async stat(path) {
    const { parentId, name } = await this._split(path, false);
    const n = await this.adapter.findChild(parentId, name);
    if (!n) throw new CloudError('not-found', 'not found: ' + path, 404);
    return n;
  }
  /** → { data, version, id }.  Throws CloudError('not-found'). */
  async readJson(path) {
    const n = await this.stat(path);
    const blob = await this.adapter.readBlob(n.id);
    let data; try { data = JSON.parse(await blob.text()); } catch (e) { throw new CloudError('http', 'not valid JSON: ' + path); }
    const fresh = n.version;
    return { data, version: fresh, id: n.id };
  }
  /** opts.version: string = must match current version; null = must not exist yet; undefined = overwrite (creates if absent).
      → { version, id }. Throws ConflictError. */
  async writeJson(path, data, opts = {}) {
    // serialise writes to the same path within this page (Drive has no If-Match on update, so this closes the same-tab race)
    const key = path; const prev = this._locks.get(key) || Promise.resolve();
    const run = prev.catch(() => {}).then(() => this._writeJson(path, data, opts));
    this._locks.set(key, run.catch(() => {}));
    return run;
  }
  async _writeJson(path, data, opts) {
    const text = JSON.stringify(data, null, 2);
    const { parentId, name } = await this._split(path, true);
    const existing = await this.adapter.findChild(parentId, name);
    if (opts.version === null) { if (existing) throw new ConflictError('already exists: ' + path); }
    else if (typeof opts.version === 'string' && !existing) throw new ConflictError('file vanished: ' + path);
    const n = await this.adapter.writeText({ parentId, name, text, id: existing && existing.id, version: typeof opts.version === 'string' ? opts.version : undefined });
    return { version: n.version, id: n.id };
  }
  async manifest() { return (await this.readJson(MANIFEST)).data; }
  /** Read-modify-write project.json, retrying on conflicts. mutator(m) edits m (or returns a new object). */
  async updateManifest(mutator, attempts = 6) {
    return retryOnConflict(async () => {
      let cur, version;
      try { const r = await this.readJson(MANIFEST); cur = r.data; version = r.version; } catch (e) { if (e.code !== 'not-found') throw e; cur = newManifest(this.name); version = null; }
      const next = applyManifestUpdate(cur, mutator);
      const w = await this.writeJson(MANIFEST, next, { version });
      return { manifest: next, version: w.version };
    }, attempts).then(r => r.manifest);
  }
  /** Convenience: record a tool's entry in the manifest. */
  registerTool(tool, entry = {}) { return this.updateManifest(m => { m.tools[tool] = { ...(m.tools[tool] || {}), ...entry, updated: new Date().toISOString() }; }); }

  /** Resumable upload with retry/resume. opts: { onProgress(sent,total), signal, mimeType } → file node. */
  async uploadBlob(path, blob, opts = {}) {
    const { parentId, name } = await this._split(path, true);
    const ad = this.adapter, size = blob.size, signal = opts.signal;
    const uri = await ad.startUpload({ name, parentId, size, mimeType: opts.mimeType || blob.type, overwrite: !!opts.overwrite });
    let offset = 0;
    while (true) {
      if (signal && signal.aborted) throw abortErr();
      const r = chunkRange(offset, size, ad.chunkSize);
      let res;
      for (let attempt = 1; ; attempt++) {
        try { res = await ad.uploadChunk(uri, blob.slice(r.start, r.end), r.start, size, signal); break; }
        catch (e) {
          if (e && e.name === 'AbortError') throw e;
          if (!retryable(e && e.status) || attempt >= MAX_RETRIES) throw e; // incl. auth-expired (401): never retried blindly
          await sleep(backoff(attempt, Math.random()), signal);
          try { const q = await ad.queryUpload(uri, size, signal); if (q.done) { res = q; break; } if (q.next !== r.start) { offset = q.next; res = null; break; } } catch (e2) { if (e2 && e2.name === 'AbortError') throw e2; }
        }
      }
      if (!res) continue;
      if (res.done) { opts.onProgress && opts.onProgress(size, size); return res.file; }
      offset = res.next; opts.onProgress && opts.onProgress(offset, size);
    }
  }
  async downloadBlob(path, signal) { return this.adapter.readBlob((await this.stat(path)).id, signal); }
  /** Children of a folder path ('' = project root). */
  async list(dirPath = '') { return this.adapter.children(await this.folderId(dirPath)); }
  /** Nested tree of a folder path. */
  async tree(dirPath = 'files') { return this.adapter.listTree(await this.folderId(dirPath)); }
  rename(newName) { return this.adapter.rename(this.id, newName); }
  openUrl() { return this.adapter.openUrl({ ...this.node, isFolder: true }); }
}

/* ===================== Cloud (entry point) ===================== */
const LAST_KEY = 'atelier-cloud-last';
const hasDoc = typeof document !== 'undefined';

/** opts: { googleClientId, msClientId, rootName = 'Atelier 4·2 Share',
            overrides?: { google?: { fetch, signIn? }, onedrive?: { fetch, signIn? } },   // tests / ?mock=1
            queueStore?, isOffline?: () => boolean, pollMs?: 20000 } */
export function createCloud(opts = {}) {
  const rootName = opts.rootName || 'Atelier 4·2 Share';
  const ov = opts.overrides || {};
  const pollMs = opts.pollMs || 20000;
  const mock = !!opts.mock || Object.keys(ov).length > 0;       // overrides = ?mock=1 or tests: keep every key separate
  const ss = makeSession(opts.sessionKey || (mock ? MOCK_SESSION_KEY : SESSION_KEY));
  const pref = makePref(PROVIDER_KEY + (mock ? MOCK_SUFFIX : ''));
  const lastKey = LAST_KEY + (mock ? MOCK_SUFFIX : '');
  const qstore = opts.queueStore || (typeof indexedDB !== 'undefined' ? idbQueueStore() : memoryQueueStore());
  let adapter = null, holder = null, auth = null, providerId = null, rootId = null, flushing = false;
  const projectCache = new Map();
  const listeners = {};
  const emit = (ev, data) => (listeners[ev] || []).slice().forEach(cb => { try { cb(data); } catch (e) { /* listener errors never break the cloud */ } });

  const providers = () => [
    { id: 'google', label: 'Google Drive', configured: !!(opts.googleClientId || ov.google) },
    { id: 'onedrive', label: 'OneDrive', configured: !!(opts.msClientId || ov.onedrive) },
  ];

  function build(id) {
    if (!providers().find(p => p.id === id && p.configured)) throw new CloudError('auth-required', 'provider not configured: ' + id);
    let au;
    const h = tokenHolder(id, () => au.refresh(), () => emit('auth-expired', { provider: id }), ss);
    const o = ov[id];
    if (o) {
      au = {
        signIn: async () => { if (o.signIn) await o.signIn(); h.set('mock-token', Date.now() + 3600e3); },
        refresh: async () => { if (o.refuseRefresh && o.refuseRefresh()) throw new CloudError('auth-expired', 'mock: refresh refused'); h.set('mock-token', Date.now() + 3600e3); return 'mock-token'; },
        signOut() {},
      };
    } else au = id === 'google' ? googleAuth(opts.googleClientId, h) : msAuth(opts.msClientId, h);
    const fetchImpl = o ? o.fetch : (u, i) => fetch(u, i);
    const ad = id === 'google' ? googleAdapter({ fetchImpl, holder: h, auth: au, rootName }) : onedriveAdapter({ fetchImpl, holder: h, auth: au });
    return { ad, h, au };
  }
  const isOffline = () => (opts.isOffline ? !!opts.isOffline() : (typeof navigator !== 'undefined' && navigator.onLine === false));

  /* ---------- project handle extras (need cloud scope) ---------- */
  function decorate(p) {
    /** Write JSON; when offline / network down it is queued (IndexedDB) and sent later. → { version } | { queued: true } */
    p.saveJson = async (path, data, o = {}) => {
      if (!isOffline()) {
        try { return await p.writeJson(path, data, o); } catch (e) { if (e.code !== 'network') throw e; }
      }
      await cloud.enqueue({ kind: 'json', projectId: p.id, projectName: p.name, path, data, version: o.version });
      return { queued: true };
    };
    p.saveBlob = async (path, blob, o = {}) => {
      if (!isOffline()) {
        try { return await p.uploadBlob(path, blob, o); } catch (e) { if (e.code !== 'network') throw e; }
      }
      await cloud.enqueue({ kind: 'blob', projectId: p.id, projectName: p.name, path, blob });
      return { queued: true };
    };
    /** Poll for changes made elsewhere (other devices). onChange({added, modified, removed, tree}). → { stop, poll, rebase(tree) } */
    p.watch = (onChange, wo = {}) => cloud.watchProject(p.id, onChange, wo);
    return p;
  }
  const mkProject = (node) => decorate(new Project(cloud, adapter, node));

  const cloud = {
    providers,
    get preferred() { return pref.get(); },
    get provider() { return providerId; },
    get adapter() { return adapter; },
    get user() { return adapter ? adapter.user : null; },
    get signedIn() { return !!adapter; },
    get offline() { return isOffline(); },

    /** Events: 'auth-expired' ({provider}), 'auth-restored', 'queue' (status), 'online'. Returns an unsubscribe fn. */
    on(ev, cb) { (listeners[ev] = listeners[ev] || []).push(cb); return () => { listeners[ev] = (listeners[ev] || []).filter(x => x !== cb); }; },

    /** Reuse a session from sessionStorage (same tab, any Atelier tool). → user | null. No popup. */
    async restore() {
      const s = ss.get();
      if (!s || !s.provider || !s.token || s.expiresAt <= Date.now() + 60000) return null;
      if (!providers().find(p => p.id === s.provider && p.configured)) return null;
      const b = build(s.provider);
      if (!b.h.load()) return null;
      adapter = b.ad; holder = b.h; auth = b.au; providerId = s.provider;
      adapter.resumeUser(s.user || null);
      try { rootId = await adapter.ensureRoot(); } catch (e) { cloud.signOutLocal(); return null; }
      cloud.flushQueue();
      return adapter.user;
    },
    /** Popup sign-in. Throws CloudError code 'admin-consent' for school tenants that block the app. */
    async signIn(id) {
      const b = build(id);
      adapter = b.ad; holder = b.h; auth = b.au; providerId = id;
      try { await adapter.signIn(); rootId = await adapter.ensureRoot(); }
      catch (e) { adapter = null; holder = null; auth = null; providerId = null; throw e; }
      pref.set(id);
      cloud.flushQueue();
      return adapter.user;
    },
    /** The single "다시 로그인" fallback after a silent refresh failed: interactive popup, keeps the session object. */
    async reauth() {
      if (!auth) throw new CloudError('auth-required', 'not signed in');
      await auth.signIn(); emit('auth-restored', { provider: providerId }); cloud.flushQueue();
      return adapter.user;
    },
    signOutLocal() { if (holder) holder.clear(); adapter = null; holder = null; auth = null; providerId = null; rootId = null; projectCache.clear(); },
    /** Revokes the token (Google: loads GSI first if the page was reloaded), then forgets the session. */
    signOut() { const p = adapter ? adapter.signOut() : null; cloud.signOutLocal(); return Promise.resolve(p).catch(() => {}); },
    quota: () => (adapter ? adapter.quota() : null),

    _need() { if (!adapter) throw new CloudError('auth-required', 'not signed in'); return adapter; },
    async listProjects() { return cloud._need().listProjects(); },
    /** Creates the project folder, files/ board/ crit/ models/ and project.json. Throws code 'exists'. */
    async createProject(name) {
      const node = await cloud._need().createProject(name);
      const p = mkProject(node);
      for (const f of FOLDERS) await p.folderId(f);
      await p.writeJson(MANIFEST, newManifest(name), { version: null });
      projectCache.set(p.id, p); cloud.rememberProject(p);
      return p;
    },
    /** Open an existing project by id or listProjects() node; makes sure the convention folders exist. */
    async openProject(idOrNode) {
      const ad = cloud._need();
      const id = typeof idOrNode === 'string' ? idOrNode : idOrNode.id;
      if (projectCache.has(id)) return projectCache.get(id);
      const node = typeof idOrNode === 'string' ? (await ad.listProjects()).find(n => n.id === idOrNode) : idOrNode;
      if (!node) throw new CloudError('not-found', 'project not found', 404);
      const p = mkProject(node);
      for (const f of FOLDERS) await p.folderId(f);
      projectCache.set(id, p); cloud.rememberProject(p);
      return p;
    },

    /* ---------- per-device memory (no tokens) ---------- */
    rememberProject(p, tool) {
      try {
        const prev = JSON.parse(localStorage.getItem(lastKey) || 'null') || {};
        localStorage.setItem(lastKey, JSON.stringify({ provider: providerId, projectId: p.id, name: p.name, tool: tool || (prev.projectId === p.id ? prev.tool : null) || null, at: Date.now() }));
      } catch (e) { /* unavailable */ }
    },
    /** → { provider, projectId, name, tool, at } | null (this device only). */
    lastProject() { try { return JSON.parse(localStorage.getItem(lastKey) || 'null'); } catch (e) { return null; } },
    forgetLastProject() { try { localStorage.removeItem(lastKey); } catch (e) { /* unavailable */ } },

    /* ---------- change watching (other devices) ---------- */
    /** Polls every 20 s while the tab is visible and right away on visibilitychange→visible / 'online'.
        Uses Drive changes (start page token) or Graph delta as a cheap probe, then compares id+version snapshots
        (the modifiedTime/eTag fallback). onChange({ added, modified, removed, tree }). → { stop, poll, rebase(tree) } */
    watchProject(projectId, onChange, wo = {}) {
      const ad = cloud._need();
      let snap = null, probe = null, running = false, stopped = false, probeTried = false;
      const poll = async () => {
        if (running || stopped || isOffline()) return;
        running = true;
        try {
          if (!snap) { snap = snapshotOf(await ad.listTree(projectId)); }
          if (!probeTried) { probeTried = true; try { probe = ad.changeProbe ? await ad.changeProbe(projectId) : null; } catch (e) { probe = null; } return; }
          let changed = true;
          if (probe) { try { changed = await probe.check(); } catch (e) { probe = null; changed = true; } }
          if (!changed) return;
          const tree = await ad.listTree(projectId);
          const next = snapshotOf(tree), d = diffSnapshots(snap, next);
          snap = next;
          if (d.added.length || d.modified.length || d.removed.length) onChange({ ...d, tree });
        } catch (e) { /* offline or auth-expired (already signalled): try again next tick */ }
        finally { running = false; }
      };
      const vis = () => { if (!hasDoc || document.visibilityState === 'visible') poll(); };
      const timer = setInterval(vis, wo.pollMs || pollMs);
      if (hasDoc) document.addEventListener('visibilitychange', vis);
      if (typeof window !== 'undefined') window.addEventListener('online', vis);
      poll();
      return {
        poll, rebase(tree) { snap = snapshotOf(tree); },
        stop() { stopped = true; clearInterval(timer); if (hasDoc) document.removeEventListener('visibilitychange', vis); if (typeof window !== 'undefined') window.removeEventListener('online', vis); },
      };
    },

    /* ---------- offline queue (IndexedDB) ---------- */
    async enqueue(rec) {
      await qstore.put({ ...rec, provider: providerId, state: 'pending', tries: 0, created: Date.now() });
      emit('queue', await cloud.queueStatus());
      if (!isOffline()) cloud.flushQueue();
    },
    async queueStatus() {
      const all = (await qstore.all()).filter(r => !r.provider || r.provider === providerId);
      return { pending: all.filter(r => r.state === 'pending').length, conflicts: all.filter(r => r.state === 'conflict').length, failed: all.filter(r => r.state === 'failed').length, items: all.map(r => ({ id: r.id, kind: r.kind, path: r.path, projectName: r.projectName, state: r.state })) };
    },
    /** Send everything queued. Stops quietly while offline. Conflicting JSON writes stay queued as state 'conflict'. */
    async flushQueue() {
      if (!adapter || flushing || isOffline()) return;
      flushing = true;
      try {
        for (const rec of await qstore.all()) {
          if (rec.provider && rec.provider !== providerId) continue;
          if (rec.state !== 'pending') continue;
          try {
            const p = await cloud.openProject(rec.projectId);
            if (rec.kind === 'blob') await p.uploadBlob(rec.path, rec.blob, { overwrite: !!rec.overwrite });
            else await p.writeJson(rec.path, rec.data, rec.overwrite ? {} : { version: rec.version });
            await qstore.del(rec.id);
          } catch (e) {
            if (e.code === 'conflict') { rec.state = 'conflict'; await qstore.put(rec); }
            else if (e.code === 'network' || e.code === 'auth-expired' || e.code === 'auth-required') break; // stays pending; reauth() flushes again
            else { rec.tries = (rec.tries || 0) + 1; if (rec.tries >= 5) rec.state = 'failed'; await qstore.put(rec); }
          }
          emit('queue', await cloud.queueStatus());
        }
      } finally { flushing = false; emit('queue', await cloud.queueStatus()); }
    },
    /** Resolve a 'conflict' or 'failed' item:
        'overwrite'  send it anyway (JSON: last write wins; blob: replace the stored file),
        'keep-both'  JSON: save it as "<name> (conflict <stamp>).json" next to the other version,
        'retry'      failed items: try again from zero,
        'discard'    drop it. */
    async resolveQueued(id, how) {
      const rec = (await qstore.all()).find(r => r.id === id);
      if (!rec) return;
      if (how === 'discard') await qstore.del(id);
      else if (how === 'keep-both') { rec.path = conflictCopyPath(rec.path); rec.version = null; rec.overwrite = false; rec.state = 'pending'; rec.tries = 0; await qstore.put(rec); }
      else if (how === 'retry') { rec.state = 'pending'; rec.tries = 0; await qstore.put(rec); }
      else { rec.state = 'pending'; rec.overwrite = true; rec.tries = 0; await qstore.put(rec); }
      await cloud.flushQueue();
      emit('queue', await cloud.queueStatus());
    },
  };
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => { emit('online', {}); cloud.flushQueue(); });
  return cloud;
}
