import { api, el, logout } from './common.js';
const $ = s => document.querySelector(s);
const dashboard = $('#dashboard');
const screen = el('main', 'panel-screen hidden'); dashboard.after(screen);
let currentUser, users = [], filter = 'all', query = '', page = 1, pageSize = 10;
const money = value => Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2 });
function closeMenu() { $('#sideMenu').classList.remove('open'); $('#menuOverlay').classList.add('hidden'); }
function show(view) { dashboard.classList.toggle('hidden', view !== 'dashboard'); $('#bannerManager').classList.add('hidden'); screen.classList.toggle('hidden', view === 'dashboard'); closeMenu(); window.scrollTo(0, 0); }
document.addEventListener('show-banners', () => screen.classList.add('hidden'));
function button(text, action, className = 'panel-button') { const b = el('button', className, text); b.type = 'button'; b.addEventListener('click', action); return b; }
function field(label, name, type = 'text') { const l = el('label', 'panel-field', label), input = el('input'); input.name = name; input.type = type; input.maxLength = 160; l.append(input); return l; }
function empty(text) { return el('p', 'panel-empty', text); }
const dialog = el('dialog', 'user-dialog');
dialog.innerHTML = `<form id="newUserForm" novalidate><div class="role-tabs" aria-label="Tipo de cuenta"><button type="button" data-role="player">♟ Jugador</button><button type="button" data-role="agent">♟ Agente</button></div><h2 class="sr-only">Crear cuenta</h2><div class="form-tabs" role="tablist"></div><div class="user-fields"></div><p class="form-feedback" role="status"></p><footer><button type="button" class="panel-button outline" id="cancelUser">CANCELAR</button><button class="panel-button" type="submit" id="saveUser">ACEPTAR</button></footer></form>`;
document.body.append(dialog);
const form = $('#newUserForm'), tabs = dialog.querySelector('.form-tabs'), content = dialog.querySelector('.user-fields'), feedback = dialog.querySelector('.form-feedback');
let role = 'player', selectedTab = 'Ingreso', saving = false;
const panels = {};
panels.Ingreso = el('section');
const username = field('Nombre de usuario', 'username'), password = field('Contraseña', 'password', 'password');
username.querySelector('input').autocomplete = 'off'; password.querySelector('input').autocomplete = 'new-password';
password.append(button('Mostrar contraseña', e => { const i = password.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; e.currentTarget.textContent = i.type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña'; }, 'password-toggle'));
panels.Ingreso.append(username, password, el('small', '', 'Contraseña: mínimo 8 caracteres.'));
panels['Datos personales'] = el('section');
for (const [label, name, type] of [['Nombre completo','fullName','text'],['Documento','document','text'],['Correo electrónico','email','email'],['Teléfono','phone','tel']]) panels['Datos personales'].append(field(label,name,type));
panels.Permisos = el('section'); panels.Permisos.append(empty('No hay proveedores configurados. Aparecerán aquí cuando se agreguen desde el panel.'));
panels.Comisiones = el('section'); panels.Comisiones.append(empty('Sin proveedores configurados para asignar comisiones.'));
Object.values(panels).forEach(p => content.append(p));
function renderTabs() {
  tabs.replaceChildren();
  for (const name of ['Ingreso', 'Datos personales', 'Permisos', ...(role === 'agent' ? ['Comisiones'] : [])]) {
    const b = button(name, () => { selectedTab = name; renderTabs(); }, name === selectedTab ? 'selected' : ''); b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(name === selectedTab)); tabs.append(b);
  }
  for (const [name, panel] of Object.entries(panels)) panel.hidden = name !== selectedTab;
  dialog.querySelectorAll('[data-role]').forEach(b => { b.classList.toggle('selected', b.dataset.role === role); b.setAttribute('aria-pressed', String(b.dataset.role === role)); });
}
dialog.querySelectorAll('[data-role]').forEach(b => b.addEventListener('click', () => { if (saving) return; role = b.dataset.role; selectedTab = 'Ingreso'; renderTabs(); }));
function openUser(type = 'player') { form.reset(); role = type; selectedTab = 'Ingreso'; feedback.textContent = ''; password.querySelector('input').type = 'password'; password.querySelector('button').textContent = 'Mostrar contraseña'; renderTabs(); dialog.showModal(); document.body.classList.add('modal-open'); username.querySelector('input').focus(); }
dialog.addEventListener('close', () => document.body.classList.remove('modal-open'));
dialog.addEventListener('cancel', e => { if (saving) e.preventDefault(); });
$('#cancelUser').addEventListener('click', () => dialog.close());
form.addEventListener('submit', async e => {
  e.preventDefault(); if (saving) return;
  const values = Object.fromEntries(new FormData(form));
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(values.username.trim()) || values.password.length < 8 || values.password.length > 128) { selectedTab = 'Ingreso'; renderTabs(); feedback.textContent = 'Revisá el usuario (3–40 caracteres) y la contraseña (8–128).'; return; }
  saving = true; form.setAttribute('aria-busy','true'); form.querySelectorAll('button').forEach(b => b.disabled = true); $('#saveUser').textContent = 'GUARDANDO…'; feedback.textContent = '';
  try { await api('/api/panel/users', { method:'POST', body:JSON.stringify({ ...values, role }) }); dialog.close(); await showUsers(); screen.prepend(el('p','panel-notice','Cuenta creada correctamente. Saldo inicial: 0,00 fichas.')); }
  catch (error) { feedback.textContent = error.message; }
  finally { saving = false; form.removeAttribute('aria-busy'); form.querySelectorAll('button').forEach(b => b.disabled = false); $('#saveUser').textContent = 'ACEPTAR'; }
});
const quick = document.querySelectorAll('.quick-actions button'); quick[0].addEventListener('click', () => openUser()); quick[1].addEventListener('click', () => openUser('agent'));
async function showUsers() { show('users'); screen.replaceChildren(empty('Cargando usuarios…')); try { ({ users } = await api('/api/panel/users')); renderUsers(); } catch(e) { screen.replaceChildren(empty(e.message)); } }
function renderUsers() {
  screen.replaceChildren();
  const actions = el('div','panel-actions'); actions.append(button('NUEVO USUARIO', () => openUser(), 'red-btn'), button('ESTRUCTURA', showStructure, 'red-btn')); screen.append(actions);
  const card = el('section','panel-card'); const search = el('form','panel-search'), input = field('Nombre de usuario','search'); input.querySelector('input').value = query;
  const submit = el('button','panel-button','BUSCAR'); search.append(input,submit); search.addEventListener('submit', e => { e.preventDefault(); query = input.querySelector('input').value; page = 1; renderUsers(); }); card.append(search);
  const filters = el('div','list-tabs'); for (const [key,label] of [['all','TODOS'],['agent','AGENTES'],['player','JUGADORES'],['hidden','OCULTOS']]) filters.append(button(label, () => { filter=key;page=1;renderUsers(); }, filter === key ? 'selected' : '')); card.append(filters);
  const selected = users.filter(u => u.username.toLowerCase().includes(query.toLowerCase()) && (filter === 'hidden' ? u.hidden : !u.hidden && (filter === 'all' || u.role === filter)));
  const pages = Math.max(1, Math.ceil(selected.length/pageSize)); page = Math.min(page,pages);
  const table = el('table','user-table'); table.innerHTML = '<thead><tr><th>Nombre de usuario</th><th>Fichas</th><th>Acciones</th></tr></thead>'; const body = el('tbody');
  selected.slice((page-1)*pageSize,page*pageSize).forEach(u => {
    const row = el('tr'), name=el('td','username',u.username), roleLabel=el('small','user-role',u.role==='admin'?'Administrador':u.role==='agent'?'Agente':'Jugador');name.append(roleLabel);
    const actions=el('td','balance-actions');
    if(u.role!=='admin')for(const [operation,label,symbol] of [['credit','Cargar fichas','+'],['debit','Retirar fichas','−']]){const b=button(symbol,()=>openBalance(u,operation),'balance-action');b.ariaLabel=`${label} a ${u.username}`;b.title=label;actions.append(b);}
    else actions.append(el('span','', '—'));
    row.append(name,el('td','',money(u.balance)),actions);body.append(row);
  });
  if (!selected.length) { const row=el('tr'),cell=el('td','panel-empty','Ningún dato disponible en esta tabla');cell.colSpan=3;row.append(cell);body.append(row); } table.append(body);card.append(table);
  const pagination = el('div','pagination'); const previous=button('‹',()=>{page--;renderUsers();}),next=button('›',()=>{page++;renderUsers();});previous.disabled=page===1;next.disabled=page===pages; previous.ariaLabel='Página anterior'; next.ariaLabel='Página siguiente';pagination.append(previous,el('span','',`${page} / ${pages}`),next);
  const size = el('label','','Mostrar registros '),select=el('select');for(const n of [10,25,50]){const option=el('option','',String(n));option.value=n;select.append(option);}select.value=pageSize;select.addEventListener('change',()=>{pageSize=Number(select.value);page=1;renderUsers();});size.append(select);pagination.append(size);card.append(pagination);screen.append(card);
}
const balanceDialog=el('dialog','balance-dialog');document.body.append(balanceDialog);
let balanceBusy=false;
balanceDialog.addEventListener('cancel',e=>{if(balanceBusy)e.preventDefault();});
function openBalance(account,operation) {
  const requestId=crypto.randomUUID();balanceDialog.replaceChildren();
  const title=operation==='credit'?'Cargar fichas':'Retirar fichas';balanceDialog.append(el('h2','',title),el('p','',account.username),el('p','',`Saldo actual: ${money(account.balance)} fichas`));
  const f=el('form','balance-form'),amount=field('Importe en fichas','amount');const input=amount.querySelector('input');input.inputMode='decimal';input.placeholder='0,00';input.required=true;input.maxLength=12;
  const status=el('p','form-feedback');status.setAttribute('role','status');const actions=el('div','panel-actions');const cancel=button('CANCELAR',()=>balanceDialog.close(),'panel-button outline'),submit=el('button','panel-button','CONFIRMAR');actions.append(cancel,submit);f.append(amount,status,actions);balanceDialog.append(f);
  f.addEventListener('submit',async e=>{e.preventDefault();if(balanceBusy)return;const value=input.value.trim();if(!/^\d{1,9}(?:[.,]\d{1,2})?$/.test(value)||Number(value.replace(',','.'))<=0){status.textContent='Ingresá un importe mayor a cero, con hasta dos decimales.';return;}balanceBusy=true;submit.disabled=cancel.disabled=true;input.disabled=true;submit.textContent='GUARDANDO…';status.textContent='';
    try{const result=await api('/api/panel/users/'+account.id+'/balance',{method:'POST',body:JSON.stringify({operation,amount:value,requestId})});if(result.actor){currentUser=result.actor;$('#adminBalance').textContent=money(currentUser.balance);}balanceDialog.close();await showUsers();screen.prepend(el('p','panel-notice',`${title}: ${money(Number(value.replace(',','.')))} · ${account.username}. Saldo: ${money(result.user.balance)} fichas.`));}
    catch(error){status.textContent=error.message;}finally{balanceBusy=false;submit.disabled=cancel.disabled=false;input.disabled=false;submit.textContent='CONFIRMAR';}
  });balanceDialog.showModal();input.focus();
}
function showStructure() { show('structure'); screen.replaceChildren(el('h1','','Estructura de usuarios')); const card=el('section','panel-card');card.append(el('h2','',currentUser.username)); for(const u of users)card.append(el('p','',`${u.role==='admin'?'Administrador':u.role==='agent'?'Agente':'Jugador'} · ${u.username}`));card.append(button('VOLVER',renderUsers));screen.append(card); }
function showReport(player = false) {
  show('reports');screen.replaceChildren(el('h1','',player?'Reporte Global por Jugador':'Reporte Global'));
  const card=el('section','panel-card'),f=el('form','report-form'),period=el('select');period.ariaLabel='Período';for(const t of ['Hoy','Ayer','Este mes','Personalizado'])period.append(el('option','',t));f.append(period);
  const dates=el('div','report-dates');for(const [label,name,type] of [['Fecha inicial','start','date'],['Hora inicial','startTime','time'],['Fecha final','end','date'],['Hora final','endTime','time']]){const l=field(label,name,type);l.querySelector('input').required=true;if(type==='time')l.querySelector('input').value='00:00';dates.append(l);}f.append(dates);
  function range(){const start=new Date(),end=new Date();start.setHours(0,0,0,0);end.setHours(0,0,0,0);end.setDate(end.getDate()+1);if(period.value==='Ayer'){start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);}if(period.value==='Este mes')start.setDate(1);const local=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;f.elements.start.value=local(start);f.elements.end.value=local(end);}period.addEventListener('change',()=>{if(period.value!=='Personalizado')range();});range();
  if(player)f.append(field('Nombre de usuario','username'));const submit=el('button','panel-button','BUSCAR');f.append(submit);const result=el('div');result.innerHTML=`<table class="user-table"><thead><tr><th>Categoría</th><th>Netwin</th><th>${player?'Rake':'Comisión'}</th></tr></thead></table>`;const status=empty('Ningún dato disponible en esta tabla');status.setAttribute('role','status');result.append(status);f.addEventListener('submit',e=>{e.preventDefault();status.textContent=new Date(f.elements.start.value+'T'+f.elements.startTime.value)>=new Date(f.elements.end.value+'T'+f.elements.endTime.value)?'La fecha final debe ser posterior a la inicial.':'Sin actividad de juegos registrada en el período seleccionado.';});card.append(f,result);screen.append(card);
}
function baseScreen(title) {
  show('base'); screen.replaceChildren(el('h1','',title)); const card=el('section','panel-card'); screen.append(card); return card;
}
function soon(title) { baseScreen(title).append(empty('Pronto')); }
function settings() {
  const card=baseScreen('Settings');
  card.append(el('h2','','Identidad de tu casino'),el('p','settings-note','Vista de muestra. Los cambios todavía no se guardan ni se aplican a la plataforma.'));
  const name=field('Nombre del casino','casinoName');name.querySelector('input').placeholder='Tu casino aquí';
  const logo=field('URL del logo','casinoLogo','url');logo.querySelector('input').placeholder='https://ejemplo.com/mi-logo.png';
  const layout=el('label','panel-field','Interfaz principal'),select=el('select');select.name='casinoInterface';select.append(el('option','','Interfaz clásica'));layout.append(select);
  const form=el('form','settings-form');form.addEventListener('submit',e=>e.preventDefault());form.append(name,logo,layout);
  const save=button('Guardar · próximamente',()=>{});save.disabled=true;form.append(save);card.append(form);
}
function reportBase(title, columns, message) {
  const card=baseScreen(title),form=el('form','report-form'),dates=el('div','report-dates');
  dates.append(field('Fecha inicial','start','date'),field('Fecha final','end','date'));form.append(dates,field('Nombre de usuario','username'));
  const submit=el('button','panel-button','BUSCAR');form.append(submit);const status=empty(message);status.setAttribute('role','status');
  form.addEventListener('submit',e=>{e.preventDefault();const start=form.elements.start.value,end=form.elements.end.value;status.textContent=start&&end&&start>end?'Revisá el período: la fecha final debe ser posterior a la inicial.':message;});
  const table=el('table','user-table'),head=el('thead'),row=el('tr');columns.forEach(c=>row.append(el('th','',c)));head.append(row);table.append(head);card.append(form,table,status);
}
function summary() {
  const card=baseScreen('Mi resumen');card.append(el('h2','',currentUser?.username||'Mi cuenta'),el('p','',`Saldo disponible: ${money(currentUser?.balance||0)} fichas`),empty('Sin movimientos registrados.'));
}
for(const item of document.querySelectorAll('.menu-item')) {
  const label=item.querySelector('span')?.textContent;
  let action;
  if(label==='Estadísticas')action=()=>show('dashboard');
  if(label==='Usuarios')action=showUsers;
  if(label==='Reportes Globales') { const sub=el('div','report-submenu');sub.hidden=true;sub.append(button('Reporte por Agente',()=>showReport()),button('Reporte por Jugador',()=>showReport(true)));item.after(sub);item.setAttribute('aria-expanded','false');action=()=>{sub.hidden=!sub.hidden;item.setAttribute('aria-expanded',String(!sub.hidden));}; }
  if(label==='Settings')action=settings;
  if(label==='Torneos')action=()=>soon('Torneos');
  if(['Soporte','Chat Soporte','Registro de actividad'].includes(label))action=()=>soon(label);
  if(label==='Reportes de Fichas')action=()=>reportBase(label,['Fecha','Usuario','Movimiento','Fichas'],'Sin movimientos de fichas registrados.');
  if(label==='Reportes de Juegos')action=()=>reportBase(label,['Fecha','Usuario','Juego','Resultado'],'Sin actividad de juegos registrada.');
  if(label==='Finanzas')action=()=>reportBase(label,['Fecha','Concepto','Importe'],'Sin operaciones financieras registradas.');
  if(label==='Mi resumen')action=summary;
  if(label==='Categorías')action=()=>{const card=baseScreen(label);card.append(el('h2','','Catálogo de juegos'),empty('No hay categorías ni proveedores configurados.'));};
  if(action){item.tabIndex=0;item.setAttribute('role','button');const activate=()=>{document.querySelectorAll('.menu-item').forEach(i=>i.classList.toggle('active',i===item));action();};item.addEventListener('click',activate);item.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate();}});}
}
// No real gaming activity is available until providers are configured.
for(const card of dashboard.querySelectorAll('.dashboard-card:not(.quick-card)')) { const title=card.querySelector('.blue-title');card.replaceChildren(title,empty('Sin actividad registrada')); }
const fake=$('.fake-input');const quickInput=el('input','quick-username');quickInput.placeholder='Nombre de usuario';quickInput.ariaLabel='Nombre de usuario';fake.replaceWith(quickInput);
for(const b of document.querySelectorAll('.quick-input-row .round-btn')) {b.title=b.textContent==='+'?'Cargar fichas':'Retirar fichas';b.setAttribute('aria-label',b.title);b.addEventListener('click',async()=>{try{const result=await api('/api/panel/users');const account=result.users.find(u=>u.username.toLowerCase()===quickInput.value.trim().toLowerCase()&&u.role!=='admin');if(account)openBalance(account,b.textContent==='+'?'credit':'debit');else{query=quickInput.value;await showUsers();screen.prepend(el('p','panel-notice','Buscá el usuario y elegí + para cargar o − para retirar fichas.'));}}catch(error){show('users');screen.replaceChildren(empty(error.message));}});}
try { ({user:currentUser}=await api('/api/me')); if(currentUser.role==='agent'){quick[1].hidden=true;dialog.querySelector('[data-role="agent"]').hidden=true;} }catch(e){screen.append(empty(e.message));}

const accountButton = button('▾', () => { accountMenu.hidden = !accountMenu.hidden; accountButton.setAttribute('aria-expanded', String(!accountMenu.hidden)); }, 'account-toggle');
accountButton.ariaLabel = 'Abrir menú de cuenta'; accountButton.setAttribute('aria-expanded','false');
const caret = $('.caret-fa'); if(caret) caret.replaceWith(accountButton);
const accountMenu = el('div','account-menu'); accountMenu.hidden = true;
accountMenu.append(button('Mi cuenta', () => { accountMenu.hidden=true;accountButton.setAttribute('aria-expanded','false');show('account');screen.replaceChildren(el('h1','','Mi cuenta'));const card=el('section','panel-card');card.append(el('h2','',currentUser.username),el('p','',currentUser.role==='admin'?'Administrador':'Agente'),el('p','',`Saldo: ${money(currentUser.balance)} fichas`));screen.append(card); }),button('Salir',logout));
$('.toolbar-right').append(accountMenu);
document.addEventListener('click',e=>{if(!accountMenu.contains(e.target)&&!accountButton.contains(e.target)){accountMenu.hidden=true;accountButton.setAttribute('aria-expanded','false');}});
