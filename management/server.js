import { createVioletBridge } from './violet-bridge.js';
import fs from 'node:fs';
import { sectionsFor, canOpenSection } from './permissions.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const hash = (password, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
const verify = (password, stored) => {
  const [salt, value] = String(stored).split(':');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(value || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(hash(password, salt).split(':')[1], 'hex'));
};
const safeUser = ({ id, username, role, siteId, parentId, createdAt, profile, commissionPeriod }) => ({ id, username, role, siteId, parentId, createdAt, ...(profile ? { profile } : {}), ...(commissionPeriod ? { commissionPeriod } : {}) });
function text(value, name, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${name}: completá un valor de hasta ${max} caracteres.`);
  return value.trim();
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail(400, 'La contraseña debe tener entre 12 y 128 caracteres.');
  return value;
}
function username(value) {
  const name = text(value, 'Usuario', 50);
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(name)) fail(400, 'Usá de 3 a 50 letras, números, puntos, guiones o guiones bajos.');
  return name;
}
function image(value) {
  if (typeof value !== 'string') fail(400, 'Seleccioná una imagen.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) fail(400, 'Usá una imagen PNG, JPG o WebP.');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length < 12 || bytes.length > 1024 * 1024) fail(400, 'La imagen debe ocupar como máximo 1 MB.');
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' : match[1] === 'jpeg' ? bytes.subarray(0, 3).toString('hex') === 'ffd8ff' : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) fail(400, 'El archivo no corresponde al formato de imagen.');
  return `data:image/${match[1]};base64,${bytes.toString('base64')}`;
}
async function readBody(req, limit = 1500000) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'Se requiere JSON.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > limit) fail(413, 'La solicitud es demasiado grande.'); chunks.push(buffer); }
  try { const body = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(); return body; }
  catch { fail(400, 'JSON inválido.'); }
}
function validateStore(db) {
  if (db.version !== 1 || !['users', 'sites', 'banners', 'audit'].every(key => Array.isArray(db[key]))) throw new Error('management.json inválido. No se reemplazó el archivo.');
  const ids = new Set(), names = new Set(), sites = new Set(db.sites.map(s => s.id));
  for (const user of db.users) {
    if (!user.id || ids.has(user.id) || !['super', 'master', 'agent', 'player'].includes(user.role) || typeof user.username !== 'string' || names.has(user.username.toLowerCase()) || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash || '')) throw new Error('Cuentas de gestión inválidas.');
    ids.add(user.id); names.add(user.username.toLowerCase());
    if (user.role !== 'super' && !sites.has(user.siteId)) throw new Error('Cuenta sin sitio válido.');
  }
  if (!db.users.some(u => u.role === 'super')) throw new Error('Falta el Super Master.');
  for (const user of db.users) {
    const seen = new Set([user.id]); let current = user;
    while (current.parentId) {
      const parent = db.users.find(u => u.id === current.parentId);
      if (!parent || seen.has(parent.id) || parent.siteId !== user.siteId || ['super', 'player'].includes(parent.role)) throw new Error('Jerarquía de cuentas inválida.');
      seen.add(parent.id); current = parent;
    }
    if (['agent', 'player'].includes(user.role) && current.role !== 'master') throw new Error('Agente sin Master.');
  }
}
export function createManagementApp({ dataDir, bootstrapPassword, secureCookies = false, violetOrigin = process.env.VIOLET_ORIGIN || 'https://panel-violeta.onrender.com' }) {
  const violet = createVioletBridge({origin:violetOrigin});
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const databasePath = path.join(dataDir, 'management.json');
  let db;
  function persist(next) {
    const tmp = databasePath + '.tmp'; const fd = fs.openSync(tmp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(next, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, databasePath); db = next;
  }
  if (fs.existsSync(databasePath)) { db = JSON.parse(fs.readFileSync(databasePath, 'utf8')); validateStore(db); }
  else {
    const superUser = { id: id(), username: 'super_master', role: 'super', siteId: null, parentId: null, passwordHash: hash(password(bootstrapPassword)), createdAt: now() };
    const initial = { version: 1, users: [superUser], sites: [], banners: [], audit: [] };
    // Import only administrative identities. Legacy player records, balances,
    // transactions, banners, games and sessions are never read into this store.
    const legacyPath = path.join(dataDir, 'universe.json');
    if (fs.existsSync(legacyPath)) {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      if (!Array.isArray(legacy.users)) throw new Error('El archivo anterior no contiene cuentas válidas. No se modificó.');
      const admins = legacy.users.filter(u => u.role === 'admin');
      const agents = legacy.users.filter(u => u.role === 'agent');
      if (admins.length) {
        const site = { id: id(), name: 'Universe', interface: 'base', createdAt: now() }; initial.sites.push(site);
        const importIds = new Set([...admins, ...agents].map(u => u.id));
        for (const user of [...admins, ...agents]) {
          initial.users.push({ id: user.id, username: user.username, passwordHash: user.passwordHash, role: user.role === 'admin' ? 'master' : 'agent', siteId: site.id, parentId: user.role === 'admin' ? null : (importIds.has(user.parentId) ? user.parentId : admins[0].id), createdAt: user.createdAt || now() });
        }
      } else if (agents.length) throw new Error('No se importaron agentes sin una cuenta Master de origen. El archivo anterior se conserva.');
    }
    if (!initial.sites.length) {
      const site = { id: id(), name: 'Universe', interface: 'base', createdAt: now() }; initial.sites.push(site);
      initial.users.push({ id: id(), username: 'universe_admin', passwordHash: hash('UniverseAdmin2026!'), role: 'master', siteId: site.id, parentId: null, createdAt: now() });
    }
    validateStore(initial); persist(initial);
  }
  const sessions = new Map(), attempts = new Map();
  const dummyHash = hash(crypto.randomBytes(24).toString('hex'));
  const tokenHash = value => crypto.createHash('sha256').update(value).digest('hex');
  const sessionDuration = 8 * 60 * 60 * 1000;
  const cookie = (req, token, age = sessionDuration / 1000) => `management_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secureCookies || req.socket?.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;
  function session(req) {
    const token = /(?:^|;\s*)management_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const key = token && tokenHash(token), stored = key && sessions.get(key);
    if (!stored || stored.expires < Date.now()) { if (key) sessions.delete(key); return null; }
    const user = db.users.find(u => u.id === stored.userId);
    return user ? { key, user, stored } : null;
  }
  function revoke(userId) { for (const [key, value] of sessions) if (value.userId === userId) sessions.delete(key); }
  function descendant(target, actor) {
    if (target.siteId !== actor.siteId) return false;
    const seen = new Set(); let current = target;
    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id); if (current.parentId === actor.id) return true;
      current = db.users.find(u => u.id === current.parentId);
    }
    return false;
  }
  function visibleUsers(actor, siteId) {
    return db.users.filter(u => u.siteId === siteId && (actor.role !== 'agent' || u.id === actor.id || descendant(u, actor)));
  }
  function scopedSite(actor, siteId, onlyManagers = false) {
    if (actor.role === 'player') fail(403, 'Esta cuenta de jugador no tiene acceso al panel administrativo.');
    if (actor.role !== 'super' && actor.siteId !== siteId) fail(403, 'No tenés acceso a este sitio.');
    if (onlyManagers && actor.role === 'agent') fail(403, 'Esta sección es exclusiva para Masters.');
    const site = db.sites.find(s => s.id === siteId); if (!site) fail(404, 'Sitio no encontrado.'); return site;
  }
  function audit(next, actor, siteId, action, targetId = null) {
    next.audit.push({ id: id(), at: now(), actorId: actor.id, actorName: actor.username, siteId, action, targetId });
    // Retain the most recent 2,000 events per site; activity elsewhere cannot erase this site's history.
    const siteEvents = next.audit.filter(e => e.siteId === siteId);
    if (siteEvents.length > 2000) { const drop = new Set(siteEvents.slice(0, siteEvents.length - 2000).map(e => e.id)); next.audit = next.audit.filter(e => !drop.has(e.id)); }
  }
  function transact(actor, siteId, action, targetId, change) { const next = structuredClone(db); change(next); audit(next, actor, siteId, action, targetId); persist(next); }
  function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  return async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: ${violet.site.url}; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`);
    try {
      const url = new URL(req.url, 'http://localhost'), route = decodeURIComponent(url.pathname), method = req.method;
      if (method === 'GET' && route === '/api/health') return json(res, 200, { ok: true, service: 'site-management', version: 1 });
      if (['GET', 'HEAD'].includes(method) && ['/branding-editor.js','/branding-editor.css'].includes(route)) {
        res.writeHead(200, {'Content-Type':route.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','Cache-Control':'no-store'});
        return res.end(method==='HEAD'?undefined:fs.readFileSync(path.join(publicDir,route.slice(1))));
      }
      if (['GET', 'HEAD'].includes(method) && route === '/management-permissions.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(method === 'HEAD' ? undefined : fs.readFileSync(path.join(publicDir, '../permissions.js')));
      }
      const fonts = ['Roboto-Light.woff2', 'Roboto-Regular.woff2', 'Roboto-Medium.woff2', 'fa-solid-900.woff2'];
      if (['GET', 'HEAD'].includes(method) && fonts.some(name => route === '/fonts/' + name)) {
        res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=86400' });
        return res.end(method === 'HEAD' ? undefined : fs.readFileSync(path.join(publicDir, route.slice(1))));
      }
      if (['GET', 'HEAD'].includes(method) && ['/', '/admin', '/login', '/management.css', '/management.js'].includes(route)) {
        const file = route.endsWith('.css') ? 'app.css' : route.endsWith('.js') ? 'app.js' : 'index.html';
        const mime = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(method === 'HEAD' ? undefined : fs.readFileSync(path.join(publicDir, file)));
      }
      if (!route.startsWith('/api/management/')) return json(res, 404, { error: 'Ruta no disponible en el panel de gestión de sitios.' });
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.headers['x-management-request'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') fail(403, 'Solicitud no autorizada.');
        if (req.headers.origin) { let origin; try { origin = new URL(req.headers.origin); } catch { fail(403, 'Origen inválido.'); } if (origin.host !== req.headers.host || !['https:', 'http:'].includes(origin.protocol)) fail(403, 'Origen no autorizado.'); }
      }
      if (route === '/api/management/login' && method === 'POST') {
        const input = await readBody(req); const name = typeof input.username === 'string' ? input.username.trim().toLowerCase().slice(0, 100) : '';
        const key = `${req.socket?.remoteAddress || 'local'}:${name}`; const time = Date.now();
        for (const [k, a] of attempts) if (time - a.since > 15 * 60 * 1000) attempts.delete(k);
        const attempt = attempts.get(key) || { count: 0, since: time };
        if (attempt.count >= 10) fail(429, 'Demasiados intentos. Esperá 15 minutos.');
        const user = db.users.find(u => u.username.toLowerCase() === name);
        const candidate = typeof input.password === 'string' && input.password.length <= 128 ? input.password : '';
        const matches = verify(candidate, user?.passwordHash || dummyHash);
        if (!user || !matches) { attempt.count++; if (attempts.size < 10000 || attempts.has(key)) attempts.set(key, attempt); fail(401, 'Usuario o contraseña incorrectos.'); }
        attempts.delete(key); const token = crypto.randomBytes(32).toString('hex');
        for (const [k, s] of sessions) if (s.expires < time) sessions.delete(k);
        if (sessions.size > 10000) fail(503, 'Volvé a intentarlo más tarde.');
        transact(user, user.siteId, 'Ingreso a la cuenta', user.id, () => {});
        sessions.set(tokenHash(token), { userId: user.id, expires: time + sessionDuration });
        res.setHeader('Set-Cookie', cookie(req, token)); return json(res, 200, { user: safeUser(user) });
      }
      const auth = session(req); if (!auth) fail(401, 'Ingresá para continuar.'); const actor = auth.user;
      if (route === '/api/management/me' && method === 'GET') return json(res, 200, { user: safeUser(actor), sections: sectionsFor(actor.role), sites: [...db.sites.filter(s => actor.role === 'super' || s.id === actor.siteId), ...(actor.role==='super'?[violet.site]:[])] });
      const remote = /^\/api\/management\/sites\/connected-panel-violeta\/(connect|branding|panel)$/.exec(route);
      if(remote){
        if(actor.role!=='super')fail(403,'Solo el Super Master puede administrar otros sitios.');
        if(remote[1]==='connect'&&method==='POST')return json(res,200,await violet.connect(auth.stored,await readBody(req)));
        return json(res,200,await violet.request(auth.stored,remote[1],method,method==='POST'?await readBody(req,7200000):undefined));
      }
      if (route === '/api/management/logins' && method === 'GET') return json(res, 200, { entries: db.audit.filter(e => e.actorId === actor.id && e.action === 'Ingreso a la cuenta').slice(-50).reverse().map(e => e.at) });
      if (route === '/api/management/logout' && method === 'POST') { sessions.delete(auth.key); res.setHeader('Set-Cookie', cookie(req, '', 0)); return json(res, 200, { ok: true }); }
      if (route === '/api/management/password' && method === 'POST') {
        const input = await readBody(req); const newPassword = password(input.newPassword);
        if (typeof input.currentPassword !== 'string' || input.currentPassword.length > 128 || !verify(input.currentPassword, actor.passwordHash)) fail(400, 'La contraseña actual no es correcta.');
        transact(actor, actor.siteId, 'Cambio de contraseña propia', actor.id, next => { next.users.find(u => u.id === actor.id).passwordHash = hash(newPassword); });
        revoke(actor.id); res.setHeader('Set-Cookie', cookie(req, '', 0)); return json(res, 200, { ok: true, loginRequired: true });
      }
      if (route === '/api/management/sites' && method === 'POST') {
        if (actor.role !== 'super') fail(403, 'Solo el Super Master puede crear sitios.');
        const input = await readBody(req), name = text(input.name, 'Nombre del sitio', 80);
        if (db.sites.some(s => s.name.toLowerCase() === name.toLowerCase())) fail(409, 'Ya existe un sitio con ese nombre.');
        const site = { id: id(), name, interface: 'base', createdAt: now() };
        transact(actor, site.id, 'Creación de sitio', site.id, next => next.sites.push(site)); return json(res, 201, { site });
      }
      const sectionMatch = /^\/api\/management\/sites\/([^/]+)\/sections\/([^/]+)$/.exec(route);
      if (sectionMatch && method === 'GET') {
        const [, siteId, section] = sectionMatch;
        scopedSite(actor, siteId);
        if (!canOpenSection(actor.role, section) || ['sites', 'new-site'].includes(section)) fail(403, 'No tenés acceso a esta sección.');
        return json(res, 200, { section, status: ['chips', 'games', 'finance'].includes(section) ? 'not_connected' : 'coming_soon', entries: [] });
      }
      const match = /^\/api\/management\/sites\/([^/]+)\/(users|banners|settings|summary|activity)(?:\/([^/]+)(?:\/(password))?)?$/.exec(route);
      if (!match) fail(404, 'Ruta no encontrada.');
      const [, siteId, section, targetId, operation] = match;
      if (operation && section !== 'users') fail(404, 'Ruta no encontrada.');
      const site = scopedSite(actor, siteId, ['banners', 'settings', 'activity'].includes(section));
      if (section === 'users' && !targetId && method === 'GET') return json(res, 200, { users: visibleUsers(actor, siteId).map(safeUser) });
      if (section === 'users' && !targetId && method === 'POST') {
        const input = await readBody(req); const role = input.role || (actor.role === 'super' ? 'master' : 'agent');
        const allowedRoles = actor.role === 'super' ? ['master'] : ['agent', 'player'];
        if (!allowedRoles.includes(role) || input.parentId !== undefined || input.siteId !== undefined || input.permissions !== undefined) fail(403, 'El rol, sitio y responsable los decide el servidor.');
        const name = username(input.username), secret = password(input.password);
        if (db.users.some(u => u.username.toLowerCase() === name.toLowerCase())) fail(409, 'Ese nombre de usuario ya está en uso.');
        const profile = {};
        if (input.profile !== undefined && (!input.profile || typeof input.profile !== 'object' || Array.isArray(input.profile))) fail(400, 'Datos personales inválidos.');
        for (const [key, max] of [['fullName', 120], ['document', 60], ['email', 180], ['phone', 40]]) {
          const value = input.profile?.[key] ?? '';
          if (typeof value !== 'string' || value.length > max) fail(400, 'Datos personales inválidos.');
          profile[key] = value.trim();
        }
        if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) fail(400, 'Email inválido.');
        if (input.commissionPeriod !== undefined && (role !== 'agent' || !['monthly', 'weekly'].includes(input.commissionPeriod))) fail(400, 'Período de comisión inválido.');
        const user = { id: id(), username: name, passwordHash: hash(secret), role, siteId, parentId: actor.role === 'super' ? null : actor.id, createdAt: now(), profile, ...(role === 'agent' ? { commissionPeriod: input.commissionPeriod || 'monthly' } : {}) };
        transact(actor, siteId, `Creación de ${role === 'master' ? 'Master' : role === 'player' ? 'jugador' : 'agente'}`, user.id, next => next.users.push(user)); return json(res, 201, { user: safeUser(user) });
      }
      if (section === 'users' && targetId && operation === 'password' && method === 'POST') {
        const target = db.users.find(u => u.id === targetId && u.siteId === siteId);
        const allowed = target && target.id !== actor.id && (actor.role === 'super' ? ['master', 'agent', 'player'].includes(target.role) : ['agent', 'player'].includes(target.role) && (actor.role === 'master' || descendant(target, actor)));
        if (!allowed) fail(403, 'No podés restablecer esta cuenta.');
        const input = await readBody(req); const secret = password(input.password);
        transact(actor, siteId, 'Restablecimiento de contraseña', target.id, next => { next.users.find(u => u.id === target.id).passwordHash = hash(secret); });
        revoke(target.id); return json(res, 200, { ok: true });
      }
      if (section === 'summary' && !targetId && method === 'GET') {
        const users = visibleUsers(actor, siteId);
        return json(res, 200, { site, accounts: users.length, masters: users.filter(u => u.role === 'master').length, agents: users.filter(u => u.role === 'agent').length, players: users.filter(u => u.role === 'player').length, directChildren: users.filter(u => u.parentId === actor.id).length });
      }
      if (section === 'activity' && !targetId && method === 'GET') return json(res, 200, { events: db.audit.filter(e => e.siteId === siteId).slice(-100).reverse() });
      if (section === 'settings' && !targetId && method === 'GET') return json(res, 200, { site });
      if (section === 'settings' && !targetId && method === 'PATCH') {
        const input = await readBody(req), name = text(input.name, 'Nombre del sitio', 80);
        if (input.interface && input.interface !== 'base') fail(400, 'La única interfaz disponible es Base.');
        if (db.sites.some(s => s.id !== siteId && s.name.toLowerCase() === name.toLowerCase())) fail(409, 'Ese nombre ya está en uso.');
        transact(actor, siteId, 'Actualización de configuración', siteId, next => { next.sites.find(s => s.id === siteId).name = name; });
        return json(res, 200, { site: db.sites.find(s => s.id === siteId) });
      }
      if (section === 'banners' && !targetId && method === 'GET') return json(res, 200, { banners: db.banners.filter(b => b.siteId === siteId).sort((a, b) => a.order - b.order) });
      if (section === 'banners' && ['POST', 'PATCH'].includes(method) && (method === 'POST' ? !targetId : !!targetId)) {
        const input = await readBody(req); const existing = targetId ? db.banners.find(b => b.id === targetId && b.siteId === siteId) : null;
        if (targetId && !existing) fail(404, 'Banner no encontrado.');
        if (!targetId && db.banners.filter(b => b.siteId === siteId).length >= 20) fail(400, 'Máximo 20 banners por sitio en esta versión.');
        const title = text(input.title, 'Título', 120); const order = Number(input.order);
        if (!Number.isInteger(order) || order < 0 || order > 9999 || typeof input.active !== 'boolean') fail(400, 'Completá orden y estado correctamente.');
        const banner = { id: existing?.id || id(), siteId, title, order, active: input.active, image: input.image ? image(input.image) : existing?.image };
        if (!banner.image) fail(400, 'Seleccioná una imagen.');
        transact(actor, siteId, existing ? 'Edición de banner' : 'Creación de banner', banner.id, next => { if (existing) next.banners[next.banners.findIndex(b => b.id === existing.id)] = banner; else next.banners.push(banner); });
        return json(res, existing ? 200 : 201, { banner });
      }
      if (section === 'banners' && targetId && method === 'DELETE') {
        if (!db.banners.some(b => b.id === targetId && b.siteId === siteId)) fail(404, 'Banner no encontrado.');
        transact(actor, siteId, 'Eliminación de banner', targetId, next => { next.banners = next.banners.filter(b => b.id !== targetId); }); return json(res, 200, { ok: true });
      }
      fail(405, 'Operación no disponible.');
    } catch (error) {
      if (!error.status) console.error('Error del panel de gestión:', error.code || error.name);
      return json(res, error.status || 500, { error: error.status ? error.message : 'No se pudo guardar o completar la operación.' });
    }
  };
}
