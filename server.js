import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const dbPath = path.join(dataDir, 'universe.json');
const uploads = path.join(dataDir, 'uploads');
fs.mkdirSync(uploads, { recursive: true, mode: 0o700 });
const db = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath, 'utf8')) : { users: [], banners: [], demoAccounts: {} };
if (!Array.isArray(db.users) || !Array.isArray(db.banners)) throw new Error('Base inválida. Se conserva el archivo; restaure una copia válida.');
db.demoAccounts ||= {};
function save() {
  const temp = dbPath + '.tmp';
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(db, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, dbPath);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}
function verify(password, stored) {
  const [salt, value] = String(stored).split(':');
  if (!salt || !/^[a-f0-9]{128}$/.test(value || '')) return false;
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(hashPassword(password, salt).split(':')[1], 'hex'));
}
for (const [role, preferred, password, balance] of [
  ['admin', 'universe_admin', 'UniverseAdmin2026!', 0],
  ['player', 'universe_player', 'UniversePlayer2026!', 10000]
]) {
  if (db.demoAccounts[role] && db.users.some(u => u.id === db.demoAccounts[role])) continue;
  let username = preferred, suffix = 2;
  while (db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) username = preferred + '_' + suffix++;
  const user = { id: crypto.randomUUID(), username, passwordHash: hashPassword(password), role, balance, createdAt: new Date().toISOString() };
  db.users.push(user); db.demoAccounts[role] = user.id;
  console.log(`Cuenta demo ${role} creada: ${username}`);
}
// Seed once. Deleting or deactivating banners never causes them to reappear.
if (!db.bannerSeeded) {
  db.banners.push(
    { id: crypto.randomUUID(), destination: 'home', title: 'Universe Game', image: '/assets/galaxy.webp', layout: 'orbital', active: true, order: 0 },
    { id: crypto.randomUUID(), destination: 'slots', title: 'UNIVERSE GAME', subtitle: 'Tu universo de entretenimiento', image: '/assets/galaxy.webp', layout: 'brand', active: true, order: 0 }
  ); db.bannerSeeded = true;
}
// Import the existing promotional artwork once into managed uploads.
if (!db.promoSeeded) {
  for (const [destination, source, title, subtitle, order] of [
    ['selection', 'roulette.webp', 'PREMIUM|LIVE ROULETTE', 'Una nueva experiencia en tu universo', 0],
    ['selection', 'cards.webp', 'BLACKJACK Y|BACCARAT', 'Toda la emoción de las mesas', 1],
    ['sports', 'sports.webp', 'LAS MEJORES LIGAS', 'PRÓXIMAMENTE', 0]
  ]) {
    const name = crypto.randomUUID() + '.webp';
    fs.copyFileSync(path.join(root, 'public/assets', source), path.join(uploads, name));
    db.banners.push({ id: crypto.randomUUID(), destination, title, subtitle, order, image: '/uploads/' + name, active: true, layout: 'promo' });
  }
  db.promoSeeded = true;
}
save();
const sessions = new Map(), attempts = new Map();
const dummyHash = hashPassword(crypto.randomBytes(20).toString('hex'));
const tokenHash = token => crypto.createHash('sha256').update(token).digest('hex');
function session(req) {
  const token = /(?:^|;\s*)universe_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const key = token && tokenHash(token), s = key && sessions.get(key);
  if (!s || s.expires < Date.now()) { if (key) sessions.delete(key); return null; }
  return { key, user: db.users.find(u => u.id === s.userId) };
}
const publicUser = u => ({ id: u.id, username: u.username, role: u.role, balance: u.balance, currency: 'fichas' });
function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
function redirect(res, url) { res.writeHead(303, { Location: url }); res.end(); }
function cookie(req, value, age) { return `universe_session=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${req.socket.encrypted || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`; }
async function body(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Se requiere JSON.'), { status: 415 });
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 6 * 1024 * 1024) throw Object.assign(new Error('Imagen demasiado grande (máximo 4 MB).'), { status: 413 }); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString()); if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Invalid object'); return value; } catch { throw Object.assign(new Error('JSON inválido.'), { status: 400 }); }
}
function imageUpload(data) {
  if (typeof data !== 'string') throw new Error('Seleccioná una imagen.');
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!m) throw new Error('Usá una imagen PNG, JPG o WebP.');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > 4 * 1024 * 1024 || bytes.length < 12) throw new Error('La imagen debe ocupar entre 12 bytes y 4 MB.');
  const valid = m[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) : m[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new Error('El archivo no corresponde a una imagen válida.');
  const name = crypto.randomUUID() + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(uploads, name), bytes, { mode: 0o600 });
  return '/uploads/' + name;
}
function cleanUnusedUpload(image) {
  if (!image || !/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/.test(image) || db.banners.some(b => b.image === image)) return;
  try { fs.unlinkSync(path.join(uploads, path.basename(image))); } catch (error) { if (error.code !== 'ENOENT') console.error('No se pudo limpiar una imagen sin uso:', error.message); }
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function file(res, filename, cache = false) {
  if (!fs.existsSync(filename) || !fs.statSync(filename).isFile()) return json(res, 404, { error: 'No encontrado.' });
  res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': cache ? 'public, max-age=3600' : 'no-store' });
  fs.createReadStream(filename).pipe(res);
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' https://cdnjs.cloudflare.com https://fonts.googleapis.com; font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost'), route = decodeURIComponent(url.pathname);
    const auth = session(req), user = auth?.user;
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host)) return json(res, 403, { error: 'Origen no autorizado.' });
      if (req.headers['x-universe-request'] !== '1') return json(res, 403, { error: 'Solicitud no autorizada.' });
    }
    if (route === '/api/health' && req.method === 'GET') return json(res, 200, { ok: true, service: 'universe-game' });
    if (route === '/api/login' && req.method === 'POST') {
      const ip = req.socket.remoteAddress;
      const attempt = attempts.get(ip);
      if (attempt && attempt.until > Date.now() && attempt.count >= 15) return json(res, 429, { error: 'Demasiados intentos. Esperá 15 minutos.' });
      const input = await body(req);
      if (typeof input.username !== 'string' || typeof input.password !== 'string' || input.username.length > 100 || input.password.length > 256) return json(res, 400, { error: 'Usuario o contraseña inválidos.' });
      const found = db.users.find(u => u.username.toLowerCase() === input.username.trim().toLowerCase());
      const valid = verify(input.password, found?.passwordHash || dummyHash);
      if (!found || !valid) {
        attempts.set(ip, { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 900000 });
        return json(res, 401, { error: 'Usuario o contraseña incorrectos.' });
      }
      attempts.delete(ip); if (auth) sessions.delete(auth.key);
      found.loginHistory = [...(found.loginHistory || []), new Date().toISOString()].slice(-50); save();
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(tokenHash(token), { userId: found.id, expires: Date.now() + 28800000 });
      res.setHeader('Set-Cookie', cookie(req, token, 28800));
      return json(res, 200, { user: publicUser(found), redirect: found.role !== 'player' ? '/admin' : '/jugadores' });
    }
    if (route === '/api/logout' && req.method === 'POST') {
      if (auth) sessions.delete(auth.key);
      res.setHeader('Set-Cookie', cookie(req, '', 0)); return json(res, 200, { ok: true });
    }
    if (route.startsWith('/api/')) {
      if (route === '/api/banners' && req.method === 'GET') return json(res, 200, { banners: db.banners.filter(b => b.active && b.destination === url.searchParams.get('destination')).sort((a, b) => a.order - b.order) });
      if (!user) return json(res, 401, { error: 'Iniciá sesión para continuar.' });
      if (route === '/api/me' && req.method === 'GET') return json(res, 200, { user: publicUser(user) });
      if (route === '/api/account/logins' && req.method === 'GET') return json(res, 200, { entries: [...(user.loginHistory || [])].reverse() });
      if (route === '/api/account/password' && req.method === 'POST') {
        const input = await body(req);
        if (typeof input.currentPassword !== 'string' || input.currentPassword.length > 256 || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) return json(res, 400, { error: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' });
        if (!verify(input.currentPassword, user.passwordHash)) return json(res, 400, { error: 'La contraseña actual no es correcta.' });
        user.passwordHash = hashPassword(input.password); save();
        for (const [key, value] of sessions) if (value.userId === user.id && key !== auth.key) sessions.delete(key);
        return json(res, 200, { ok: true });
      }
      if (route === '/api/panel/users') {
        if (!['admin', 'agent'].includes(user.role)) return json(res, 403, { error: 'Acceso no autorizado.' });
        if (req.method === 'GET') return json(res, 200, { users: db.users.filter(u => u.role !== 'admin' && (user.role === 'admin' || u.parentId === user.id)).map(u => ({ ...publicUser(u), hidden: !!u.hidden, parentId: u.parentId || null })) });
        if (req.method === 'POST') {
          const input = await body(req);
          if (!['player', 'agent'].includes(input.role) || (user.role === 'agent' && input.role !== 'player')) return json(res, 403, { error: 'No podés crear este tipo de cuenta.' });
          if (typeof input.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,40}$/.test(input.username.trim()) || typeof input.password !== 'string' || input.password.length < 8 || input.password.length > 128) return json(res, 400, { error: 'Usá un usuario de 3 a 40 letras, números, puntos o guiones y una contraseña de 8 a 128 caracteres.' });
          if (db.users.some(u => u.username.toLowerCase() === input.username.trim().toLowerCase())) return json(res, 409, { error: 'Ese usuario ya existe.' });
          const profile = {};
          for (const key of ['fullName', 'document', 'email', 'phone']) {
            if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > 160)) return json(res, 400, { error: 'Revisá los datos personales.' });
            profile[key] = (input[key] || '').trim();
          }
          if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) return json(res, 400, { error: 'Revisá el correo electrónico.' });
          const created = { id: crypto.randomUUID(), username: input.username.trim(), passwordHash: hashPassword(input.password), role: input.role, balance: 0, parentId: user.id, profile, permissions: [], createdAt: new Date().toISOString() };
          db.users.push(created); save(); return json(res, 201, { user: publicUser(created) });
        }
      }
      if (route.startsWith('/api/admin/')) {
        if (user.role !== 'admin') return json(res, 403, { error: 'Acceso exclusivo para administradores.' });
        if (route === '/api/admin/banners' && req.method === 'GET') return json(res, 200, { banners: [...db.banners].sort((a, b) => a.order - b.order) });
        const id = route.split('/')[4], existing = db.banners.find(b => b.id === id);
        if (route === '/api/admin/banners' && req.method === 'POST' || /^\/api\/admin\/banners\/[^/]+$/.test(route) && req.method === 'PUT') {
          if (req.method === 'PUT' && !existing) return json(res, 404, { error: 'Banner no encontrado.' });
          const input = await body(req);
          if (!['home', 'slots', 'selection', 'sports'].includes(input.destination) || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120 || !Number.isInteger(input.order) || input.order < 0 || input.order > 9999 || typeof input.active !== 'boolean' || (input.subtitle !== undefined && (typeof input.subtitle !== 'string' || input.subtitle.length > 160))) return json(res, 400, { error: 'Revisá destino, título y orden del banner.' });
          if (!existing && db.banners.length >= 60) return json(res, 400, { error: 'Máximo 60 banners.' });
          let image = existing?.image;
          try { if (input.imageData) image = imageUpload(input.imageData); else if (!existing) throw new Error('Seleccioná una imagen.'); } catch (e) { return json(res, 400, { error: e.message }); }
          const banner = { id: existing?.id || crypto.randomUUID(), destination: input.destination, title: input.title.trim(), subtitle: input.subtitle || '', order: input.order, active: input.active, image, layout: input.imageData ? 'image' : existing?.layout || 'image' };
          if (existing) db.banners[db.banners.indexOf(existing)] = banner; else db.banners.push(banner);
          save(); cleanUnusedUpload(existing?.image); return json(res, existing ? 200 : 201, { banner });
        }
        if (/^\/api\/admin\/banners\/[^/]+$/.test(route) && req.method === 'DELETE') {
          if (!existing) return json(res, 404, { error: 'Banner no encontrado.' });
          db.banners.splice(db.banners.indexOf(existing), 1); save(); cleanUnusedUpload(existing.image); return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: 'Ruta API no encontrada.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'Método no permitido.' });
    if (route === '/' || route === '/index.html') return file(res, path.join(root, 'index.html'));
    if (route === '/admin' || route === '/admin.html') {
      if (!user) return redirect(res, '/');
      if (!['admin', 'agent'].includes(user.role)) return redirect(res, '/jugadores');
      return file(res, path.join(root, 'admin.html'));
    }
    if (/^\/jugadores(?:\/(slots|casino|deportes|caballos|crazzy))?\/?$/.test(route)) {
      if (user && user.role !== 'player') return redirect(res, '/admin');
      return file(res, path.join(root, 'players.html'));
    }
    if (route.startsWith('/uploads/')) {
      if (!user && !db.banners.some(b => b.active && b.image === route)) return json(res, 401, { error: 'Iniciá sesión.' });
      if (!/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/.test(route)) return json(res, 404, { error: 'No encontrado.' });
      return file(res, path.join(uploads, path.basename(route)));
    }
    const filename = path.resolve(root, 'public', '.' + route);
    if (!filename.startsWith(path.join(root, 'public') + path.sep)) return json(res, 404, { error: 'No encontrado.' });
    return file(res, filename, true);
  } catch (e) { console.error(e.message); if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'No se pudo completar la solicitud.' }); else res.end(); }
});
setInterval(() => { for (const [key, s] of sessions) if (s.expires < Date.now()) sessions.delete(key); for (const [key, a] of attempts) if (a.until < Date.now()) attempts.delete(key); }, 60000).unref();
server.listen(process.env.PORT || 3000, '0.0.0.0', () => console.log('Universe Game listo. Puerto: ' + server.address().port + '. Datos: ' + dataDir));
