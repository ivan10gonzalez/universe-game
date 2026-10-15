import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable, Writable } from 'node:stream';
import { createManagementApp } from '../server.js';

const rootPassword = 'SuperMasterDemo2026!';
const password = 'CuentaPrueba2026!';
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=';
async function request(app, url, { method = 'GET', body, cookie, headers = {} } = {}) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]);
  req.url = url; req.method = method; req.socket = { remoteAddress: '127.0.0.1' };
  req.headers = { host: 'localhost', 'content-type': 'application/json', 'x-management-request': '1', ...(cookie ? { cookie } : {}), ...headers };
  const chunks = [], responseHeaders = {};
  const res = new Writable({ write(chunk, encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
  res.statusCode = 200;
  res.setHeader = (key, value) => { responseHeaders[key.toLowerCase()] = value; };
  res.writeHead = (status, values = {}) => { res.statusCode = status; for (const [key, value] of Object.entries(values)) res.setHeader(key, value); };
  const done = new Promise((resolve, reject) => { res.on('finish', resolve); res.on('error', reject); });
  await app(req, res); await done;
  const text = Buffer.concat(chunks).toString(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.statusCode, headers: responseHeaders, data };
}
async function login(app, username, secret = password) {
  const result = await request(app, '/api/management/login', { method: 'POST', body: { username, password: secret } });
  assert.equal(result.status, 200, JSON.stringify(result.data)); assert.match(result.headers['set-cookie'], /HttpOnly; SameSite=Strict/);
  return { cookie: result.headers['set-cookie'].split(';')[0], user: result.data.user };
}
const base = site => `/api/management/sites/${site}`;

test('Roles, hierarchy, tenant boundaries and persistence', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'management-test-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let app = createManagementApp({ dataDir: directory, bootstrapPassword: rootPassword });
  const root = await login(app, 'super_master', rootPassword);
  const universe = await login(app, 'universe_admin', 'UniverseAdmin2026!');
  let siteA, siteB, masterA, masterB, agent, child, sibling, grandchild;
  await t.test('Unauthenticated and removed legacy routes', async () => {
    assert.equal((await request(app, '/api/management/me')).status, 401);
    for (const url of ['/api/admin/users', '/api/login', '/jugadores', '/games/joker/index.html', '/data/management.json', '/server.js', '/public/players.js']) assert.equal((await request(app, url)).status, 404, url);
    for (const url of ['/', '/admin', '/management.js', '/management.css']) assert.equal((await request(app, url)).status, 200, url);
    assert.equal((await request(app, '/management.js')).headers['cache-control'], 'no-store');
  });
  await t.test('Only Super Master creates sites and only Masters at that level', async () => {
    assert.equal((await request(app, '/api/management/sites', { method: 'POST', cookie: universe.cookie, body: { name: 'Forbidden' } })).status, 403);
    const a = await request(app, '/api/management/sites', { method: 'POST', cookie: root.cookie, body: { name: 'Sitio A' } }); assert.equal(a.status, 201); siteA = a.data.site.id;
    const b = await request(app, '/api/management/sites', { method: 'POST', cookie: root.cookie, body: { name: 'Sitio B' } }); assert.equal(b.status, 201); siteB = b.data.site.id;
    assert.equal((await request(app, base(siteA) + '/users', { method: 'POST', cookie: root.cookie, body: { username: 'forbidden', password, role: 'agent' } })).status, 403);
    for (const [site, name] of [[siteA, 'masterA'], [siteB, 'masterB']]) {
      const created = await request(app, base(site) + '/users', { method: 'POST', cookie: root.cookie, body: { username: name, password, role: 'master' } }); assert.equal(created.status, 201); assert.equal(created.data.user.role, 'master');
    }
    masterA = await login(app, 'masterA'); masterB = await login(app, 'masterB');
    const mine = await request(app, '/api/management/me', { cookie: masterA.cookie }); assert.deepEqual(mine.data.sites.map(s => s.id), [siteA]);
  });
  await t.test('An agent creates agents, and those agents create their own children', async () => {
    async function create(actor, username) {
      const response = await request(app, base(siteA) + '/users', { method: 'POST', cookie: actor.cookie, body: { username, password, role: 'agent' } });
      assert.equal(response.status, 201, JSON.stringify(response.data)); assert.equal(response.data.user.parentId, actor.user.id); return login(app, username);
    }
    agent = await create(masterA, 'agentA'); sibling = await create(masterA, 'agentSibling'); child = await create(agent, 'childA'); grandchild = await create(child, 'grandchildA');
    const visible = await request(app, base(siteA) + '/users', { cookie: agent.cookie });
    assert.deepEqual(visible.data.users.map(u => u.username).sort(), ['agentA', 'childA', 'grandchildA']);
    assert.deepEqual((await request(app, base(siteA) + '/users', { cookie: sibling.cookie })).data.users.map(u => u.username), ['agentSibling']);
    assert.equal((await request(app, base(siteA) + '/summary', { cookie: child.cookie })).data.accounts, 2);
  });
  await t.test('Privilege escalation and cross-site API calls are blocked', async () => {
    for (const actor of [masterA, agent, child]) {
      for (const section of ['users', 'banners', 'summary', 'settings', 'activity']) assert.equal((await request(app, base(siteB) + '/' + section, { cookie: actor.cookie })).status, 403);
      for (const extra of [{ role: 'super' }, { role: 'master' }, { parentId: sibling.user.id }, { siteId: siteB }, { permissions: ['all'] }]) assert.equal((await request(app, base(siteA) + '/users', { method: 'POST', cookie: actor.cookie, body: { username: 'baduser', password, ...extra } })).status, 403);
    }
    for (const section of ['banners', 'settings', 'activity']) assert.equal((await request(app, base(siteA) + '/' + section, { cookie: agent.cookie })).status, 403);
    assert.equal((await request(app, base(siteA) + '/settings', { method: 'PATCH', cookie: agent.cookie, body: { name: 'Bad' } })).status, 403);
  });
  await t.test('Master and Super Master share full sections; agents have exactly the reduced menu', async () => {
    const mine = async actor => (await request(app, '/api/management/me', { cookie: actor.cookie })).data.sections.map(item => item.id);
    const agentSections = ['statistics', 'users', 'reports', 'chips', 'games', 'finance', 'summary'];
    assert.deepEqual(await mine(agent), agentSections);
    assert.deepEqual(await mine(child), agentSections);
    const full = await mine(masterA), top = await mine(root);
    assert.deepEqual(top, [...full, 'new-site', 'sites']);
    for (const section of ['banners', 'tournaments', 'categories', 'chat', 'activity', 'settings', 'support']) {
      assert.ok(full.includes(section));
      assert.equal((await request(app, base(siteA) + '/sections/' + section, { cookie: agent.cookie })).status, 403);
      for (const actor of [root, masterA]) assert.equal((await request(app, base(siteA) + '/sections/' + section, { cookie: actor.cookie })).status, 200);
    }
    for (const section of ['chips', 'games', 'finance']) {
      const report = await request(app, base(siteA) + '/sections/' + section, { cookie: agent.cookie });
      assert.equal(report.status, 200); assert.equal(report.data.status, 'not_connected'); assert.deepEqual(report.data.entries, []);
      assert.equal((await request(app, base(siteB) + '/sections/' + section, { cookie: agent.cookie })).status, 403);
    }
  });
  let bannerA;
  await t.test('Banners and settings stay within the selected site', async () => {
    const a = await request(app, base(siteA) + '/banners', { method: 'POST', cookie: masterA.cookie, body: { title: 'Imagen A', image, order: 1, active: true } }); assert.equal(a.status, 201); bannerA = a.data.banner.id;
    assert.equal((await request(app, base(siteB) + '/banners', { cookie: masterB.cookie })).data.banners.length, 0);
    assert.equal((await request(app, base(siteB) + '/banners/' + bannerA, { method: 'DELETE', cookie: masterB.cookie })).status, 404);
    assert.equal((await request(app, base(siteA) + '/banners/' + bannerA, { method: 'PATCH', cookie: root.cookie, body: { title: 'Editado', order: 2, active: false } })).status, 200);
    const update = await request(app, base(siteB) + '/settings', { method: 'PATCH', cookie: root.cookie, body: { name: 'Sitio B nuevo', interface: 'base' } }); assert.equal(update.status, 200);
    assert.equal((await request(app, base(siteA) + '/settings', { cookie: masterA.cookie })).data.site.name, 'Sitio A');
    assert.equal((await request(app, base(siteB) + '/settings', { cookie: masterB.cookie })).data.site.name, 'Sitio B nuevo');
    assert.equal((await request(app, base(siteA) + '/banners', { method: 'POST', cookie: masterA.cookie, body: { title: 'Bad', image: 'data:image/svg+xml;base64,PHN2Zz4=', order: 1, active: true } })).status, 400);
  });
  await t.test('Password resets obey hierarchy and immediately invalidate sessions', async () => {
    for (const target of [masterA, sibling]) assert.equal((await request(app, base(siteA) + `/users/${target.user.id}/password`, { method: 'POST', cookie: agent.cookie, body: { password: 'NuevaClave2026!' } })).status, 403);
    assert.equal((await request(app, base(siteA) + `/users/${child.user.id}/password`, { method: 'POST', cookie: agent.cookie, body: { password: 'NuevaClave2026!' } })).status, 200);
    assert.equal((await request(app, '/api/management/me', { cookie: child.cookie })).status, 401);
    child = await login(app, 'childA', 'NuevaClave2026!');
    assert.equal((await request(app, base(siteA) + `/users/${agent.user.id}/password`, { method: 'POST', cookie: root.cookie, body: { password } })).status, 200);
    assert.equal((await request(app, '/api/management/me', { cookie: agent.cookie })).status, 401);
    agent = await login(app, 'agentA');
    assert.equal((await request(app, base(siteA) + `/users/${masterA.user.id}/password`, { method: 'POST', cookie: root.cookie, body: { password: 'MasterNuevo2026!' } })).status, 200);
    assert.equal((await request(app, '/api/management/me', { cookie: masterA.cookie })).status, 401); masterA = await login(app, 'masterA', 'MasterNuevo2026!');
  });
  await t.test('Activity, input validation, CSRF, password changes and logout', async () => {
    const events = await request(app, base(siteA) + '/activity', { cookie: masterA.cookie }); assert.ok(events.data.events.length); assert.ok(events.data.events.every(e => e.siteId === siteA));
    assert.equal((await request(app, base(siteA) + '/users', { method: 'POST', cookie: masterA.cookie, body: { username: 'x', password } })).status, 400);
    assert.equal((await request(app, base(siteA) + '/users', { method: 'POST', cookie: masterA.cookie, body: { username: 'agentA', password } })).status, 409);
    assert.equal((await request(app, base(siteA) + '/users', { method: 'POST', cookie: masterA.cookie, headers: { origin: 'https://other.example' }, body: { username: 'other', password } })).status, 403);
    assert.equal((await request(app, '/api/management/logout', { method: 'POST', cookie: root.cookie, headers: { 'x-management-request': '' }, body: {} })).status, 403);
    const change = await request(app, '/api/management/password', { method: 'POST', cookie: grandchild.cookie, body: { currentPassword: password, newPassword: 'MiClaveNueva2026!' } }); assert.equal(change.status, 200);
    assert.equal((await request(app, '/api/management/me', { cookie: grandchild.cookie })).status, 401);
    const signed = await login(app, 'grandchildA', 'MiClaveNueva2026!');
    assert.equal((await request(app, '/api/management/logins', { cookie: signed.cookie })).data.entries.length, 2);
    await request(app, '/api/management/logout', { method: 'POST', cookie: signed.cookie }); assert.equal((await request(app, '/api/management/me', { cookie: signed.cookie })).status, 401);
  });
  await t.test('Restart preserves data and passwords; bootstrap never resets accounts', async () => {
    const stored = fs.readFileSync(path.join(directory, 'management.json'), 'utf8'); assert.ok(!stored.includes(rootPassword)); assert.ok(!stored.includes('MasterNuevo2026!'));
    app = createManagementApp({ dataDir: directory, bootstrapPassword: 'IgnoredPassword2026!' });
    const rootAgain = await login(app, 'super_master', rootPassword); const masterAgain = await login(app, 'masterA', 'MasterNuevo2026!');
    assert.equal((await request(app, '/api/management/me', { cookie: root.cookie })).status, 401);
    assert.equal((await request(app, base(siteA) + '/banners', { cookie: rootAgain.cookie })).data.banners[0].title, 'Editado');
    assert.equal((await request(app, base(siteA) + '/users', { cookie: masterAgain.cookie })).data.users.length, 5);
  });
  await t.test('Repeated failed logins are rate-limited', async () => {
    for (let i = 0; i < 10; i++) assert.equal((await request(app, '/api/management/login', { method: 'POST', body: { username: 'unknown', password: 'bad' } })).status, 401);
    assert.equal((await request(app, '/api/management/login', { method: 'POST', body: { username: 'unknown', password: 'bad' } })).status, 429);
  });
});

test('Migration copies only administrative identities and leaves legacy bytes unchanged', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'management-import-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const salt = crypto.randomBytes(16).toString('hex'), passwordHash = salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
  const original = JSON.stringify({ users: [{ id: 'admin', username: 'oldMaster', role: 'admin', passwordHash, balance: 99 }, { id: 'agent', username: 'oldAgent', role: 'agent', parentId: 'admin', passwordHash, balance: 50 }, { id: 'player', username: 'oldPlayer', role: 'player', passwordHash, balance: 10 }], banners: [{ title: 'OLD BANNER' }], balanceMovements: [{ amount: 100 }] });
  fs.writeFileSync(path.join(directory, 'universe.json'), original);
  const app = createManagementApp({ dataDir: directory, bootstrapPassword: rootPassword });
  const master = await login(app, 'oldMaster'), agent = await login(app, 'oldAgent'); assert.equal(master.user.role, 'master'); assert.equal(agent.user.parentId, master.user.id);
  assert.equal((await request(app, '/api/management/login', { method: 'POST', body: { username: 'oldPlayer', password } })).status, 401);
  const stored = fs.readFileSync(path.join(directory, 'management.json'), 'utf8');
  for (const term of ['oldPlayer', 'balance', 'OLD BANNER', 'balanceMovements']) assert.ok(!stored.includes(term));
  assert.equal(fs.readFileSync(path.join(directory, 'universe.json'), 'utf8'), original);
});


test('Player creation, personal data and permissions remain inside the account tree', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'management-players-')); t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  let app = createManagementApp({ dataDir: directory, bootstrapPassword: rootPassword });
  const root = await login(app, 'super_master', rootPassword), master = await login(app, 'universe_admin', 'UniverseAdmin2026!');
  const site = master.user.siteId;
  async function create(actor, name, role, extra = {}) {
    return request(app, base(site) + '/users', { method: 'POST', cookie: actor.cookie, body: { username: name, password, role, ...extra } });
  }
  for (const role of ['player', 'agent']) assert.equal((await create(root, 'forbidden_' + role, role)).status, 403);
  assert.equal((await create(master, 'parent_agent', 'agent', { commissionPeriod: 'weekly' })).status, 201);
  const agent = await login(app, 'parent_agent');
  assert.equal((await create(agent, 'child_agent', 'agent')).status, 201);
  const child = await login(app, 'child_agent');
  assert.equal((await create(master, 'sibling_agent', 'agent')).status, 201);
  const sibling = await login(app, 'sibling_agent');
  const profile = { fullName: 'Persona de prueba', document: 'DEMO', email: 'demo@example.com', phone: '000000' };
  for (const [actor, name] of [[master,'player_master'], [agent,'player_agent'], [child,'player_child']]) {
    const created = await create(actor, name, 'player', { profile });
    assert.equal(created.status, 201); assert.equal(created.data.user.role, 'player'); assert.equal(created.data.user.parentId, actor.user.id); assert.deepEqual(created.data.user.profile, profile);
  }
  const player = await login(app, 'player_child');
  assert.deepEqual((await request(app, '/api/management/me', { cookie: player.cookie })).data.sections, []);
  for (const section of ['users', 'summary', 'settings', 'activity', 'banners', 'sections/statistics']) assert.equal((await request(app, base(site) + '/' + section, { cookie: player.cookie })).status, 403);
  assert.equal((await create(player, 'illegal_agent', 'agent')).status, 403);
  assert.equal((await create(child, 'illegal_master', 'master')).status, 403);
  assert.equal((await create(agent, 'bad_email', 'player', { profile: { email: 'incorrecto' } })).status, 400);
  assert.equal((await create(agent, 'bad_commission', 'player', { commissionPeriod: 'weekly' })).status, 400);
  const players = (await request(app, base(site) + '/users', { cookie: agent.cookie })).data.users;
  assert.deepEqual(players.filter(u => u.role === 'player').map(u => u.username).sort(), ['player_agent', 'player_child']);
  const resetUrl = base(site) + '/users/' + player.user.id + '/password';
  assert.equal((await request(app, resetUrl, { method: 'POST', cookie: sibling.cookie, body: { password } })).status, 403);
  assert.equal((await request(app, resetUrl, { method: 'POST', cookie: child.cookie, body: { password: 'JugadorNuevo2026!' } })).status, 200);
  assert.equal((await request(app, '/api/management/me', { cookie: player.cookie })).status, 401);
  app = createManagementApp({ dataDir: directory, bootstrapPassword: rootPassword });
  const persisted = await login(app, 'player_child', 'JugadorNuevo2026!'); assert.deepEqual(persisted.user.profile, profile);
  assert.equal((await login(app, 'parent_agent')).user.commissionPeriod, 'weekly');
});
