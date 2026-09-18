import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import crypto from 'node:crypto';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'universe-test-'));
let child, base;
async function start(dataDir = directory) {
  child = spawn(process.execPath, ['server.js'], { env: { ...process.env, DATA_DIR: dataDir, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  for (let i = 0; i < 150; i++) { const port = /Puerto: (\d+)/.exec(output)?.[1]; if (port) { base = 'http://127.0.0.1:' + port; return; } if (child.exitCode !== null) throw new Error(output); await delay(30); }
  throw new Error('Servidor no inició: ' + output);
}
async function stop() { if (child && child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await new Promise(resolve => child.once('exit', resolve)); } }
async function request(route, method = 'GET', input, cookie, headers = {}) {
  const r = await fetch(base + route, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', 'X-Universe-Request': '1', ...(cookie ? { Cookie: cookie } : {}), ...headers }, ...(input === undefined ? {} : { body: JSON.stringify(input) }) });
  const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data, headers: r.headers, cookie: r.headers.get('set-cookie')?.split(';')[0] };
}
const login = (role, password = role === 'admin' ? 'UniverseAdmin2026!' : 'UniversePlayer2026!', username = 'universe_' + role) => request('/api/login', 'POST', { username, password });
const imageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

test('Autenticación, autorización, banners y persistencia real', async t => {
  try {
    await start();
    await t.test('protege rutas privadas, archivos fuente y datos', async () => {
      assert.equal((await request('/admin')).headers.get('location'), '/');
      assert.equal((await request('/jugadores/slots')).headers.get('location'), '/');
      assert.equal((await request('/api/me')).status, 401);
      assert.equal((await request('/api/admin/banners')).status, 401);
      for (const route of ['/server.js', '/data/universe.json', '/.git/config', '/package.json']) assert.equal((await request(route)).status, 404);
    });
    await t.test('rechaza contraseñas incorrectas y origen externo', async () => {
      assert.equal((await login('admin', 'incorrecta')).status, 401);
      assert.equal((await request('/api/login', 'POST', { username: 'universe_admin', password: 'UniverseAdmin2026!' }, null, { Origin: 'https://example.org' })).status, 403);
    });
    let admin = await login('admin'), player = await login('player');
    await t.test('resuelve ambos roles y utiliza cookies HttpOnly', async () => {
      assert.equal(admin.status, 200); assert.equal(player.status, 200);
      assert.equal(admin.data.redirect, '/admin'); assert.equal(player.data.redirect, '/jugadores');
      assert.match(admin.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
      assert.equal((await request('/api/me', 'GET', undefined, player.cookie)).data.user.balance, 10000);
      assert.equal((await request('/admin', 'GET', undefined, player.cookie)).headers.get('location'), '/jugadores');
      assert.equal((await request('/jugadores', 'GET', undefined, admin.cookie)).headers.get('location'), '/admin');
      assert.equal((await request('/api/admin/banners', 'GET', undefined, player.cookie)).status, 403);
      assert.equal((await request('/api/admin/banners', 'POST', {}, player.cookie)).status, 403);
      assert.equal('passwordHash' in player.data.user, false);
    });
    let home, slots;
    await t.test('sube banners separados por destino, los ordena y sirve la imagen', async () => {
      home = (await request('/api/admin/banners', 'POST', { destination: 'home', title: 'Inicio de prueba', order: 5, active: true, imageData }, admin.cookie)).data.banner;
      slots = (await request('/api/admin/banners', 'POST', { destination: 'slots', title: 'Slots de prueba', order: 2, active: true, imageData }, admin.cookie)).data.banner;
      assert.ok(home.id); assert.ok(slots.id);
      const homeList = (await request('/api/banners?destination=home', 'GET', undefined, player.cookie)).data.banners;
      assert.ok(homeList.some(b => b.id === home.id)); assert.ok(!homeList.some(b => b.id === slots.id));
      assert.equal((await request(home.image, 'GET', undefined, player.cookie)).status, 200);
      assert.equal((await request(home.image)).status, 401);
      assert.equal((await request('/api/admin/banners', 'POST', { destination: 'home', title: 'Mal archivo', order: 0, active: true, imageData: 'data:image/png;base64,SGVsbG9JbnZhbGlk' }, admin.cookie)).status, 400);
    });
    await t.test('edita, activa y elimina sin resucitar los banners borrados', async () => {
      assert.equal((await request('/api/admin/banners/' + home.id, 'PUT', { ...home, title: 'Editado', order: 1, active: false }, admin.cookie)).status, 200);
      assert.ok(!(await request('/api/banners?destination=home', 'GET', undefined, player.cookie)).data.banners.some(b => b.id === home.id));
      assert.equal((await request('/api/admin/banners/' + home.id, 'PUT', { ...home, title: 'Editado', order: 1, active: true }, admin.cookie)).status, 200);
      assert.equal((await request('/api/admin/banners/' + slots.id, 'DELETE', undefined, admin.cookie)).status, 200);
    });
    await t.test('logout invalida la sesión en el servidor', async () => {
      await request('/api/logout', 'POST', {}, player.cookie);
      assert.equal((await request('/api/me', 'GET', undefined, player.cookie)).status, 401);
    });
    await stop();
    const dbPath = path.join(directory, 'universe.json');
    const before = JSON.parse(fs.readFileSync(dbPath)); before.users.find(u => u.role === 'player').balance = 875.25;
    fs.writeFileSync(dbPath, JSON.stringify(before)); await start();
    await t.test('reinicio: ambos logins, saldo, hashes, banners e imágenes persisten', async () => {
      admin = await login('admin'); player = await login('player'); assert.equal(admin.status, 200); assert.equal(player.status, 200); assert.equal(player.data.user.balance, 875.25);
      const after = JSON.parse(fs.readFileSync(dbPath)); assert.equal(after.users.length, 2); assert.equal(after.users[0].passwordHash, before.users[0].passwordHash); assert.equal(after.users[1].passwordHash, before.users[1].passwordHash);
      assert.ok(after.banners.some(b => b.id === home.id && b.title === 'Editado')); assert.ok(!after.banners.some(b => b.id === slots.id));
      assert.equal((await request(home.image, 'GET', undefined, player.cookie)).status, 200);
    });
    await stop();
    await t.test('un nombre preexistente no se sobrescribe y la contraseña modificada se conserva', async () => {
      const conflictDir = fs.mkdtempSync(path.join(os.tmpdir(), 'universe-conflict-'));
      const salt = '0123456789abcdef', hash = salt + ':' + crypto.scryptSync('Existente123!', salt, 64).toString('hex');
      fs.writeFileSync(path.join(conflictDir, 'universe.json'), JSON.stringify({ users: [{ id: 'existing', username: 'universe_admin', role: 'admin', balance: 55, passwordHash: hash }], banners: [] }));
      await start(conflictDir); const conflict = JSON.parse(fs.readFileSync(path.join(conflictDir, 'universe.json')));
      assert.equal(conflict.users[0].passwordHash, hash); assert.equal(conflict.users[0].balance, 55);
      assert.equal((await login('admin', 'UniverseAdmin2026!', 'universe_admin_2')).status, 200); assert.equal((await login('admin', 'Existente123!')).status, 200);
      await stop(); fs.rmSync(conflictDir, { recursive: true });
    });
  } finally { await stop(); fs.rmSync(directory, { recursive: true, force: true }); }
});
