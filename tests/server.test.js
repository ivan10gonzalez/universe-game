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
      assert.equal((await request('/jugadores')).status, 200);
      assert.equal((await request('/jugadores/slots')).status, 200);
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
    await t.test('el administrador ve las dos cuentas iniciales en Usuarios', async () => {
      const list=(await request('/api/panel/users','GET',undefined,admin.cookie)).data.users;
      assert.ok(list.some(u=>u.username==='universe_admin' && u.role==='admin'));
      assert.ok(list.some(u=>u.username==='universe_player' && u.role==='player'));
      assert.ok(list.every(u=>!('passwordHash' in u)));
    });
    let home, slots;
    await t.test('sube banners separados por destino, los ordena y sirve la imagen', async () => {
      home = (await request('/api/admin/banners', 'POST', { destination: 'home', title: 'Inicio de prueba', order: 5, active: true, imageData }, admin.cookie)).data.banner;
      slots = (await request('/api/admin/banners', 'POST', { destination: 'slots', title: 'Slots de prueba', order: 2, active: true, imageData }, admin.cookie)).data.banner;
      assert.ok(home.id); assert.ok(slots.id);
      const homeList = (await request('/api/banners?destination=home', 'GET', undefined, player.cookie)).data.banners;
      assert.ok(homeList.some(b => b.id === home.id)); assert.ok(!homeList.some(b => b.id === slots.id));
      assert.equal((await request(home.image, 'GET', undefined, player.cookie)).status, 200);
      assert.equal((await request(home.image)).status, 200);
      assert.equal((await request('/api/admin/banners', 'POST', { destination: 'home', title: 'Mal archivo', order: 0, active: true, imageData: 'data:image/png;base64,SGVsbG9JbnZhbGlk' }, admin.cookie)).status, 400);
    });
    await t.test('edita, activa y elimina sin resucitar los banners borrados', async () => {
      assert.equal((await request('/api/admin/banners/' + home.id, 'PUT', { ...home, title: 'Editado', order: 1, active: false }, admin.cookie)).status, 200);
      assert.ok(!(await request('/api/banners?destination=home', 'GET', undefined, player.cookie)).data.banners.some(b => b.id === home.id));
      assert.equal((await request('/api/admin/banners/' + home.id, 'PUT', { ...home, title: 'Editado', order: 1, active: true }, admin.cookie)).status, 200);
      assert.equal((await request('/api/admin/banners/' + slots.id, 'DELETE', undefined, admin.cookie)).status, 200);
    });
    await t.test('imágenes inferiores editables y visibles sin sesión', async () => {
      const initial=(await request('/api/banners?destination=selection')).data.banners;assert.equal(initial.length,2);assert.ok(initial.every(b=>b.image.startsWith('/uploads/')));
      const b=initial[0];assert.equal((await request('/api/admin/banners/'+b.id,'PUT',{...b,imageData,title:'Nueva selección'},admin.cookie)).status,200);
      const updated=(await request('/api/banners?destination=selection')).data.banners.find(x=>x.id===b.id);assert.notEqual(updated.image,b.image);assert.equal(updated.title,'Nueva selección');
      await request('/api/admin/banners/'+b.id,'PUT',{...updated,active:false},admin.cookie);assert.equal((await request(updated.image)).status,401);
      assert.equal((await request('/api/banners?destination=selection')).data.banners.length,1);
    });
    await t.test('contraseña propia e historial privado', async () => {
      assert.equal((await request('/api/account/logins')).status,401);
      const history=await request('/api/account/logins','GET',undefined,player.cookie);assert.ok(history.data.entries.length>0);
      const second=await login('player');
      assert.equal((await request('/api/account/password','POST',{currentPassword:'mal',password:'NuevaClave123!'},player.cookie)).status,400);
      assert.equal((await request('/api/account/password','POST',{currentPassword:'UniversePlayer2026!',password:'NuevaClave123!'},player.cookie)).status,200);
      assert.equal((await request('/api/me','GET',undefined,second.cookie)).status,401);
      assert.equal((await login('player','NuevaClave123!')).status,200);
      assert.equal((await login('player')).status,401);
      await request('/api/account/password','POST',{currentPassword:'NuevaClave123!',password:'UniversePlayer2026!'},player.cookie);
    });
    await t.test('carga y retiro: importes, permisos y reintentos sin duplicados', async () => {
      const id=player.data.user.id,route='/api/panel/users/'+id+'/balance';
      const input={operation:'credit',amount:'25,50',requestId:crypto.randomUUID()};
      assert.equal((await request(route,'POST',input,player.cookie)).status,403);
      const loaded=await request(route,'POST',input,admin.cookie);assert.equal(loaded.data.user.balance,10025.5);
      assert.equal((await request(route,'POST',input,admin.cookie)).data.user.balance,10025.5);
      assert.equal((await request(route,'POST',{...input,amount:'26'},admin.cookie)).status,409);
      assert.equal((await request(route,'POST',{...input,amount:'0',requestId:crypto.randomUUID()},admin.cookie)).status,400);
      assert.equal((await request(route,'POST',{...input,operation:'debit',amount:'99999',requestId:crypto.randomUUID()},admin.cookie)).status,400);
      assert.equal((await request(route,'POST',{...input,operation:'debit',amount:'10.25',requestId:crypto.randomUUID()},admin.cookie)).data.user.balance,10015.25);
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
    await t.test('alta de usuarios: datos, roles, aislamiento y persistencia', async () => {
      const input = {username:'nuevo_jugador',password:'ClaveSegura123!',role:'player',fullName:'Cuenta de prueba',permissions:['unconfigured'],balance:999};
      assert.equal((await request('/api/panel/users','POST',input,player.cookie)).status,403);
      const created=await request('/api/panel/users','POST',input,admin.cookie);assert.equal(created.status,201);assert.equal(created.data.user.balance,0);
      assert.equal((await request('/api/panel/users','POST',{...input,username:'NUEVO_JUGADOR'},admin.cookie)).status,409);
      assert.equal((await request('/api/panel/users','POST',{...input,username:'otro',role:'admin'},admin.cookie)).status,403);
      const agent=await request('/api/panel/users','POST',{...input,username:'nuevo_agente',role:'agent'},admin.cookie);assert.equal(agent.status,201);
      const session=await login('agent',input.password,'nuevo_agente');assert.equal(session.data.redirect,'/admin');
      assert.equal((await request('/api/admin/banners','GET',undefined,session.cookie)).status,403);
      assert.equal((await request('/api/panel/users','GET',undefined,session.cookie)).data.users.length,0);
      assert.equal((await request('/api/panel/users','POST',{...input,username:'otro_agente',role:'agent'},session.cookie)).status,403);
      assert.equal((await request('/api/panel/users','POST',{...input,username:'hijo_agente'},session.cookie)).status,201);
      const scoped=(await request('/api/panel/users','GET',undefined,session.cookie)).data.users;assert.equal(scoped.length,1);assert.equal(scoped[0].username,'hijo_agente');assert.equal('passwordHash' in scoped[0],false);
      const childRoute='/api/panel/users/'+scoped[0].id+'/balance';
      const transfer={operation:'credit',amount:'5',requestId:crypto.randomUUID()};
      assert.equal((await request(childRoute,'POST',transfer,session.cookie)).status,400);
      assert.equal((await request('/api/panel/users/'+created.data.user.id+'/balance','POST',transfer,session.cookie)).status,403);
      assert.equal((await request('/api/panel/users/'+agent.data.user.id+'/balance','POST',{...transfer,amount:'20',requestId:crypto.randomUUID()},admin.cookie)).status,200);
      assert.equal((await request(childRoute,'POST',transfer,session.cookie)).data.user.balance,5);
      assert.equal((await request('/api/me','GET',undefined,session.cookie)).data.user.balance,15);
      assert.equal((await request(childRoute,'POST',{operation:'debit',amount:'2',requestId:crypto.randomUUID()},session.cookie)).data.user.balance,3);
      assert.equal((await request('/api/me','GET',undefined,session.cookie)).data.user.balance,17);
      await stop();await start();
      const persisted=JSON.parse(fs.readFileSync(dbPath));assert.equal(persisted.users.find(u=>u.id===scoped[0].id).balance,3);assert.ok(persisted.balanceMovements.length>=5);
      assert.equal((await login('player',input.password,input.username)).status,200);
      const stored=JSON.parse(fs.readFileSync(dbPath)).users.find(u=>u.username===input.username);assert.equal(stored.profile.fullName,input.fullName);assert.deepEqual(stored.permissions,[]);assert.equal(stored.balance,0);
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
