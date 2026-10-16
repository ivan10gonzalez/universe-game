import {mountBrandingEditor} from '/branding-editor.js';
import { sectionsFor, canOpenSection } from '/management-permissions.js';
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roles = { super: 'Super Master', master: 'Master', agent: 'Agente', player: 'Jugador' };
  let me = null, sites = [], siteId = null, view = 'users', version = 0, onSubmit = null, toastTimer;
  const route = (site, section) => `/api/management/sites/${encodeURIComponent(site)}/${section}`;
  async function api(url, method = 'GET', data) {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Management-Request': '1' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401 && !url.endsWith('/login')) showLogin();
      throw Object.assign(new Error(body.error || 'No se pudo completar la operación.'),{status:response.status});
    }
    return body;
  }
  function notify(message) { clearTimeout(toastTimer); $('#notice').textContent = message; $('#notice').hidden = false; toastTimer = setTimeout(() => { $('#notice').hidden = true; }, 5000); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').inert = true; $('#content').inert = false; $('#backdrop').hidden = true; $('#menu-button').setAttribute('aria-expanded', 'false'); }
  function showLogin() {
    version++; me = null; sites = []; siteId = null; $('#panel').hidden = true; $('#login-view').hidden = false; $('#content').replaceChildren();
    $('#account-menu').hidden = true; closeDrawer(); $('#dialog').close();
  }
  function currentSite() { return sites.find(s => s.id === siteId); }
  function renderNav() {
    const items = sectionsFor(me.role);
    $('#navigation').innerHTML = items.map(({id: key, label, icon}) => `<button data-view="${key}" class="${view === key ? 'active ' : ''}${key === 'sites' ? 'sites-link' : key === 'new-site' ? 'new-site-link' : ''}" ${view === key ? 'aria-current="page"' : ''}><span class="fa" aria-hidden="true">${icon}</span>${label}<span class="fa nav-chevron" aria-hidden="true">&#xf105;</span></button>`).join('');
    $('#navigation').querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
      closeDrawer();
      if (button.dataset.view === 'new-site') newSitePreview(); else openView(button.dataset.view);
    }));
    $('#account-name').textContent = me.username;
    $('#identity').textContent = `${me.username} · ${roles[me.role]}`;
    $('.site-label').hidden = me.role !== 'super';
    $('#selected-site').textContent = currentSite()?.name || 'Seleccioná un sitio';
  }
  async function loadSession() {
    const data = await api('/api/management/me'); me = data.user; sites = data.sites;
    let remembered = null; try { remembered = sessionStorage.getItem(`management-site:${me.id}`); } catch { /* Storage can be disabled. */ }
    siteId = me.role === 'super' ? (sites.some(s => s.id === remembered) ? remembered : null) : me.siteId;
    $('#login-view').hidden = true; $('#panel').hidden = false;
    $('#account-name').textContent = me.username;
    if (me.role === 'player') {
      $('.site-label').hidden = true; $('#menu-button').hidden = true; $('#navigation').replaceChildren();
      $('#content').innerHTML = heading('Mi cuenta') + `<section class="card"><p>Usuario: <strong>${e(me.username)}</strong></p><p class="muted">Cuenta de jugador creada. La plataforma de juegos no está conectada a este panel todavía.</p></section>`;
      return;
    }
    $('#menu-button').hidden = false;
    await openView(me.role === 'super' && !siteId ? 'sites' : 'statistics');
  }
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true; button.classList.add('loading-button'); $('#login-error').textContent = '';
    try { await api('/api/management/login', 'POST', { username: form.elements.username.value, password: form.elements.password.value }); form.elements.password.value = ''; await loadSession(); }
    catch (error) { $('#login-error').textContent = error.message; }
    finally { button.disabled = false; button.classList.remove('loading-button'); }
  });
  $('#menu-button').addEventListener('click', () => {
    const open = !$('#drawer').classList.contains('open'); $('#drawer').classList.toggle('open', open); $('#drawer').inert = !open; $('#content').inert = open; $('#backdrop').hidden = !open; $('#menu-button').setAttribute('aria-expanded', String(open));
  });
  $('#backdrop').addEventListener('click', closeDrawer);
  $('#account-button').addEventListener('click', () => { const open = $('#account-menu').hidden; $('#account-menu').hidden = !open; $('#account-button').setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', event => { if (!event.target.closest('.account-wrap')) { $('#account-menu').hidden = true; $('#account-button').setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeDrawer(); $('#account-menu').hidden = true; $('#account-button').setAttribute('aria-expanded', 'false'); } });
  const dialog = $('#dialog');
  function openDialog(title, fields, callback, kind = '') {
    dialog.querySelector('.user-role-tabs')?.remove();
    $('#dialog-form').noValidate = false;
    dialog.className = kind;
    $('#dialog-title').textContent = title; $('#dialog-fields').innerHTML = fields; $('#dialog-error').textContent = ''; $('#dialog-submit').hidden = !callback; onSubmit = callback;
    dialog.showModal();
  }
  $('#close-dialog').addEventListener('click', () => dialog.close()); $('#cancel-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { onSubmit = null; $('#dialog-fields').replaceChildren(); });
  $('#dialog-form').addEventListener('submit', async event => {
    event.preventDefault(); if (!onSubmit) return;
    const submit = onSubmit, button = $('#dialog-submit'), fields = new FormData(event.currentTarget); button.disabled = true; $('#dialog-error').textContent = '';
    try { await submit(fields); dialog.close(); }
    catch (error) { $('#dialog-error').textContent = error.message; }
    finally { button.disabled = false; }
  });
  const passwordInput = (label, name = 'password', autocomplete = 'new-password') => `<label>${label}<input name="${name}" type="password" autocomplete="${autocomplete}" ${autocomplete === 'new-password' ? 'minlength="12"' : ''} maxlength="128" required></label>`;
  function heading(title, subtitle = '', action = '') { return `<div class="page-heading"><div><h1>${e(title)}</h1>${subtitle ? `<p>${e(subtitle)}</p>` : ''}</div>${action}</div>`; }
  function newSitePreview() {
    if (me?.role !== 'super') return;
    openDialog('Nuevo sitio', '<p>Elegí el diseño de la nueva plataforma.</p><div class="site-designs"><button type="button" disabled>Panel blanco</button><button type="button" disabled>Panel violeta</button><button type="button" disabled>Original</button></div><p class="muted">Próximamente. Estas opciones todavía no crean sitios ni plataformas.</p>', null);
  }
  function selectSite(id) {
    if (!sites.some(s => s.id === id)) return; dialog.close(); siteId = id;
    try { sessionStorage.setItem(`management-site:${me.id}`, id); } catch { /* No persistence required. */ }
    openView('statistics');
  }
  function openUser(initial = 'player') {
    const scoped = siteId;
    if (!scoped) { notify('Primero seleccioná un sitio.'); return; }
    const isSuper = me.role === 'super', available = isSuper ? ['master'] : ['player', 'agent'];
    let chosen = available.includes(initial) ? initial : available[0], tab = 'login';
    const drafts = Object.fromEntries(available.map(role => [role, { username: '', password: '', fullName: '', document: '', email: '', phone: '', commissionPeriod: 'monthly' }]));
    function saveDraft() {
      dialog.querySelectorAll('[data-draft]').forEach(input => { drafts[chosen][input.dataset.draft] = input.value; });
    }
    function renderForm() {
      const draft = drafts[chosen];
      $('#dialog-title').textContent = isSuper ? 'Nuevo Master' : 'Nuevo usuario';
      const rolesBar = dialog.querySelector('.user-role-tabs');
      rolesBar.innerHTML = available.map(role => `<button type="button" role="tab" aria-selected="${role === chosen}" data-create-role="${role}"><span class="fa" aria-hidden="true">&#xf234;</span> ${roles[role]}</button>`).join('');
      rolesBar.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { saveDraft(); chosen = button.dataset.createRole; tab = 'login'; renderForm(); }));
      const tabs = [['login','Ingreso'], ['personal','Datos personales'], ['permissions','Permisos'], ...(chosen === 'agent' ? [['commissions','Comisiones']] : [])];
      $('#dialog-fields').innerHTML = `<div class="user-form-tabs" role="tablist" aria-label="Datos de la cuenta">${tabs.map(([id,label]) => `<button type="button" role="tab" data-create-tab="${id}" aria-selected="${id === tab}" aria-controls="create-tab-content">${label}</button>`).join('')}</div><div id="create-tab-content" role="tabpanel" aria-label="${tabs.find(([id]) => id === tab)[1]}"></div>`;
      const body = $('#create-tab-content');
      function field(label, name, icon, type = 'text', max = 120) {
        return `<label class="credential-label"><span class="fa field-icon" aria-hidden="true">${icon}</span><span class="floating-label">${label}</span><input aria-label="${label}" data-draft="${name}" name="${name}" type="${type}" value="${e(draft[name])}" maxlength="${max}" autocomplete="${name === 'password' ? 'new-password' : 'off'}"></label>`;
      }
      if (tab === 'login') body.innerHTML = `<div class="credential-fields">${field('Nombre de Usuario','username','&#xf007;','text',50)}${field('Contraseña','password','&#xf070;','password',128)}</div>`;
      if (tab === 'personal') body.innerHTML = `<div class="credential-fields personal-fields">${field('Nombre completo','fullName','&#xf007;')}${field('Documento','document','&#xf2c2;','text',60)}${field('Email','email','&#xf0e0;','email',180)}${field('Teléfono','phone','&#xf3cd;','tel',40)}</div>`;
      if (tab === 'permissions') body.innerHTML = '<div class="provider-permissions"><section><h3>Deportes</h3><p>No hay proveedores configurados.</p></section><section><h3>Casino</h3><p>No hay proveedores configurados.</p></section></div>';
      if (tab === 'commissions') body.innerHTML = `<div class="commission-fields"><label>Liquidar automáticamente<select data-draft="commissionPeriod"><option value="monthly" ${draft.commissionPeriod === 'monthly' ? 'selected' : ''}>Mensual</option><option value="weekly" ${draft.commissionPeriod === 'weekly' ? 'selected' : ''}>Semanal</option></select></label><section><h3>Deportes</h3><p>No hay proveedores configurados.</p></section><section><h3>Casino</h3><p>No hay proveedores configurados.</p></section><p class="muted">Se guarda la preferencia. Todavía no se ejecutan liquidaciones.</p></div>`;
      $('#dialog-fields').querySelectorAll('[data-create-tab]').forEach(button => button.addEventListener('click', () => { saveDraft(); tab = button.dataset.createTab; renderForm(); }));
      if (tab === 'login') {
        const input = body.querySelector('[name="password"]'), icon = input.closest('label').querySelector('.field-icon');
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'password-toggle fa'; toggle.innerHTML = '&#xf070;'; toggle.setAttribute('aria-label','Mostrar contraseña'); toggle.setAttribute('aria-pressed','false'); icon.replaceWith(toggle);
        toggle.addEventListener('click', () => { const show = input.type === 'password'; input.type = show ? 'text' : 'password'; toggle.innerHTML = show ? '&#xf06e;' : '&#xf070;'; toggle.setAttribute('aria-pressed',String(show)); toggle.setAttribute('aria-label',show ? 'Ocultar contraseña' : 'Mostrar contraseña'); });
      }
    }
    openDialog(isSuper ? 'Nuevo Master' : 'Nuevo usuario', '', async () => {
      saveDraft(); const draft = drafts[chosen];
      if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(draft.username) || draft.password.length < 12 || draft.password.length > 128) {
        tab = 'login'; renderForm(); throw new Error('Completá un usuario de 3 a 50 caracteres y una contraseña de 12 a 128 caracteres.');
      }
      if (draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) { tab = 'personal'; renderForm(); throw new Error('Revisá el email.'); }
      await api(route(scoped, 'users'), 'POST', { username: draft.username, password: draft.password, role: chosen, profile: { fullName: draft.fullName, document: draft.document, email: draft.email, phone: draft.phone }, ...(chosen === 'agent' ? { commissionPeriod: draft.commissionPeriod } : {}) });
      notify('Cuenta creada correctamente.'); await openView('users');
    }, 'account-create tabbed-create');
    $('#dialog-form').noValidate = true;
    const bar = document.createElement('div'); bar.className = 'user-role-tabs'; bar.setAttribute('role','tablist'); bar.setAttribute('aria-label','Tipo de cuenta'); dialog.querySelector('header').append(bar);
    renderForm(); dialog.querySelector('[name="username"]').focus();
  }
  function zeroChart(title, labels) {
    const left = 34, right = 320, bottom = 141, top = 18;
    const x = i => left + i * (right - left) / Math.max(1, labels.length - 1);
    const horizontal = [0, .25, .5, .75, 1].map(v => { const y = bottom - v * (bottom - top); return `<line x1="${left}" x2="${right}" y1="${y}" y2="${y}"/><text x="29" y="${y + 4}" text-anchor="end">${v.toLocaleString('es-AR')}</text>`; }).join('');
    const vertical = labels.map((label,i) => `<line x1="${x(i)}" x2="${x(i)}" y1="${top}" y2="${bottom}"/><text transform="translate(${x(i)},153) rotate(-45)" text-anchor="end">${e(label)}</text>`).join('');
    const dots = labels.map((_,i) => `<circle cx="${x(i)}" cy="${bottom}" r="3"/>`).join('');
    return `<section class="card dashboard-card"><h2>${title}:</h2><svg class="zero-chart" viewBox="0 0 340 185" role="img" aria-label="${title}, todos los valores en cero"><g class="chart-grid">${horizontal}${vertical}</g><path class="chart-line" d="M${left} ${bottom}H${right}"/><g class="chart-dots">${dots}</g></svg></section>`;
  }
  function dashboard() {
    const today = new Date(), months = Array.from({length:12},(_,i)=>new Date(today.getFullYear(),today.getMonth()-11+i,1).toLocaleDateString('es-AR',{month:'short',year:'2-digit'}));
    const days = Array.from({length:today.getDate()},(_,i)=>String(i+1).padStart(2,'0'));
    const isSuper = me.role === 'super';
    $('#content').innerHTML = `<h1 class="sr-only">Estadísticas</h1><div class="dashboard"><section class="card dashboard-card quick-card"><h2>Carga rápida</h2><div class="quick-buttons">${isSuper ? '<button class="red" id="quick-master"><span class="fa" aria-hidden="true">&#xf0c0;</span> NUEVO MASTER</button>' : '<button class="red" id="quick-player"><span class="fa" aria-hidden="true">&#xf007;</span> NUEVO JUGADOR</button><button class="red" id="quick-agent"><span class="fa" aria-hidden="true">&#xf0c0;</span> NUEVO AGENTE</button>'}</div><div class="quick-search"><label class="sr-only" for="quick-username">Nombre de usuario</label><input id="quick-username" placeholder="Nombre de usuario" autocomplete="off"><button class="quick-action" data-quick="Cargar fichas" aria-label="Cargar fichas">+</button><button class="quick-action" data-quick="Retirar fichas" aria-label="Retirar fichas">−</button></div></section>${zeroChart('Netwin Mensual',months)}${zeroChart('Netwin Diario',days)}<section class="card dashboard-card top-agents"><h2>Top Agentes del mes</h2><p class="empty">Sin actividad registrada.</p></section></div>`;
    $('#quick-master')?.addEventListener('click',()=>openUser('master'));
    $('#quick-player')?.addEventListener('click',()=>openUser('player'));
    $('#quick-agent')?.addEventListener('click',()=>openUser('agent'));
    document.querySelectorAll('[data-quick]').forEach(button=>button.addEventListener('click',()=>openDialog(button.dataset.quick, `<p>${$('#quick-username').value.trim() ? 'Usuario: '+e($('#quick-username').value.trim()) : 'Seleccioná una cuenta desde Usuarios.'}</p><p>Los movimientos de fichas todavía no están conectados en este panel.</p>`,null)));
  }
  async function openRemote(next,scoped,active) {
    const site=currentSite(); let panel;
    try {panel=await api(route(scoped,'panel'));}
    catch(error){
      if(!active())return;
      if(error.status!==428)throw error;
      $('#content').innerHTML=heading('Conectar Panel Violeta','Ingresá con el Master de Violeta. La contraseña se envía a ese panel y no se guarda.')+`<section class="card"><form id="violet-connect"><label>Usuario Master<input name="username" required autocomplete="username" autocapitalize="none" value="master_violeta"></label><label>Contraseña<input name="password" required type="password" autocomplete="current-password"></label><p>La conexión dura esta sesión. Los cambios de imágenes se guardan en el sitio Violeta.</p><p role="alert" id="violet-error"></p><button>Conectar sitio</button></form></section>`;
      $('#violet-connect').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;$('#violet-error').textContent='Conectando…';try{await api(route(scoped,'connect'),'POST',{username:form.elements.username.value,password:form.elements.password.value});form.elements.password.value='';if(active())await openView(next);}catch(err){if(active())$('#violet-error').textContent=err.message;}finally{button.disabled=false;}};return;
    }
    if(!active())return;
    const links=`<p class="remote-links"><a href="${e(site.url)}" target="_blank" rel="noopener">Ver plataforma Violeta ↗</a> · <a href="${e(site.url)}/admin" target="_blank" rel="noopener">Abrir panel Violeta ↗</a></p>`;
    if(['banners','settings'].includes(next)){
      $('#content').innerHTML=heading(next==='banners'?'Banners y logo · Violeta':'Logo · Violeta','Estos cambios se aplican únicamente a la plataforma Violeta.')+links+'<section id="remote-branding"></section>';
      await mountBrandingEditor($('#remote-branding'),{endpoint:route(scoped,'branding'),header:'X-Management-Request',mode:next==='settings'?'logo':'all'});return;
    }
    if(next==='users'){
      $('#content').innerHTML=heading('Usuarios · Violeta','Cuentas actuales de la plataforma conectada.')+links+`<section class="card"><div class="table-wrap"><table class="users"><thead><tr><th>Usuario</th><th>Tipo</th></tr></thead><tbody>${[panel.user,...panel.users].map(u=>`<tr><td>${e(u.username)}</td><td>${e(roles[u.role])}</td></tr>`).join('')}</tbody></table></div><p>La creación de cuentas en el prototipo Violeta todavía no está habilitada.</p></section>`;return;
    }
    $('#content').innerHTML=heading(`${next==='statistics'?'Inicio':sectionsFor(me.role).find(s=>s.id===next)?.label||'Sitio'} · Violeta`)+links+`<section class="card"><h2>${next==='statistics'?'Sitio conectado':'Próximamente'}</h2><p>${next==='statistics'?'Podés consultar Usuarios y modificar Banners y logo desde el menú. Las imágenes son las mismas que administra el Master violeta.':'Esta sección todavía no tiene datos en la plataforma Violeta.'}</p></section>`;
  }
  async function openView(next) {
    if (!me) return;
    if (!canOpenSection(me.role, next)) { notify('No tenés acceso a esta sección.'); return; }
    view = next; renderNav(); const generation = ++version, scoped = siteId;
    const active = () => generation === version && me;
    $('#content').innerHTML = '<p class="loading" role="status">Cargando…</p>';
    try {
      if (next === 'sites') {
        if (me.role !== 'super') throw new Error('Acceso exclusivo del Super Master.');
        const data = await api('/api/management/me'); if (!active()) return; sites = data.sites;
        $('#content').innerHTML = heading('Sitios', 'Elegí el sitio sobre el que querés trabajar.', '<button id="create-site" class="red">+ NUEVO SITIO</button>') + (sites.length ? `<div class="site-grid">${sites.map(s => `<article class="card site-card ${s.id === siteId ? 'selected' : ''}"><h2>${e(s.name)}</h2><p class="muted">${s.external?'Interfaz Violeta · Plataforma conectada':'Panel blanco · Gestión de cuentas y contenidos'}</p><button data-select-site="${e(s.id)}">${s.id === siteId ? 'SITIO SELECCIONADO' : 'ADMINISTRAR SITIO'}</button><code>${e(s.id)}</code></article>`).join('')}</div>` : '<section class="card empty">Todavía no hay sitios.<br>La creación de nuevas plataformas estará disponible próximamente.</section>');
        $('#create-site').addEventListener('click', newSitePreview);
        $('#content').querySelectorAll('[data-select-site]').forEach(button => button.addEventListener('click', () => selectSite(button.dataset.selectSite)));
        return;
      }
      if (currentSite()?.external) { await openRemote(next,scoped,active); return; }
      if (!scoped) { $('#content').innerHTML = heading('Seleccioná un sitio') + '<section class="card empty">Abrí <strong>Sitios</strong>, al final del menú, y elegí cuál querés administrar.</section>'; return; }
      const siteName = currentSite()?.name || '';
      if (next === 'users') {
        const data = await api(route(scoped, 'users')); if (!active()) return;
        const list = data.users, isSuper = me.role === 'super';
        $('#content').innerHTML = `<h1 class="sr-only">Usuarios de ${e(siteName)}</h1><div class="user-toolbar"><button class="red" id="create-user"><span class="fa" aria-hidden="true">&#xf234;</span> NUEVO ${isSuper ? 'MASTER' : 'USUARIO'}</button><button class="red" id="structure">ESTRUCTURA</button></div><section class="card users-card"><form class="search" id="user-search-form"><label class="sr-only" for="user-search">Nombre de usuario</label><input id="user-search" type="search" placeholder="Nombre de usuario"><button>BUSCAR</button></form><div class="tabs user-filters" aria-label="Filtrar cuentas"><button type="button" data-role="all" class="selected" aria-pressed="true">TODOS</button><button type="button" data-role="agent" aria-pressed="false">AGENTES</button><button type="button" data-role="player" aria-pressed="false">JUGADORES</button>${isSuper ? '<button type="button" data-role="master" aria-pressed="false">MASTERS</button>' : ''}</div><div class="table-wrap"><table class="users"><thead><tr><th>Nombre de Usuario</th><th>Rol</th><th class="parent-column">Responsable</th><th>Acciones</th></tr></thead><tbody id="user-rows"></tbody></table></div><p class="count" id="user-count"></p></section>`;
        let roleFilter = 'all';
        const actor = me;
        const canReset = u => u.id !== actor.id && (isSuper ? ['master', 'agent', 'player'].includes(u.role) : ['agent', 'player'].includes(u.role));
        function paintUsers() {
          const needle = $('#user-search').value.trim().toLowerCase(), filtered = list.filter(u => u.username.toLowerCase().includes(needle) && (roleFilter === 'all' || u.role === roleFilter));
          $('#user-rows').innerHTML = filtered.map(u => `<tr><td class="username ${u.role === 'player' ? 'player-name' : ''}">${e(u.username)}</td><td><span class="role ${e(u.role)}">${roles[u.role]}</span></td><td class="parent-column">${e(list.find(p => p.id === u.parentId)?.username || (u.role === 'master' ? 'Super Master' : '—'))}</td><td class="table-actions">${canReset(u) ? `<button data-reset="${e(u.id)}" aria-label="Restablecer contraseña de ${e(u.username)}" title="Restablecer contraseña"><span class="fa" aria-hidden="true">&#xf084;</span></button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No hay cuentas para mostrar.</td></tr>';
          $('#user-count').textContent = `${filtered.length} cuenta${filtered.length === 1 ? '' : 's'} en tu alcance`;
          $('#user-rows').querySelectorAll('[data-reset]').forEach(button => button.addEventListener('click', () => {
            const target = list.find(u => u.id === button.dataset.reset);
            openDialog('Restablecer contraseña', `<p>Cuenta: <strong>${e(target.username)}</strong></p>${passwordInput('Nueva contraseña')}<p class="muted">Se cerrarán las sesiones abiertas de esta cuenta.</p>`, async fields => { await api(route(scoped, `users/${target.id}/password`), 'POST', { password: fields.get('password') }); notify('Contraseña restablecida.'); });
          }));
        }
        paintUsers(); $('#user-search').addEventListener('input', paintUsers);
        $('#user-search-form').addEventListener('submit', event => { event.preventDefault(); paintUsers(); });
        document.querySelectorAll('[data-role]').forEach(button => button.addEventListener('click', () => {
          roleFilter = button.dataset.role;
          document.querySelectorAll('[data-role]').forEach(item => { item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
          paintUsers();
        }));
        $('#create-user').addEventListener('click', () => openUser(isSuper ? 'master' : 'player'));
        $('#structure').addEventListener('click', () => {
          function branch(parent, depth = 0) { if (depth > 100) return '<li>La estructura continúa.</li>'; return list.filter(u => u.parentId === parent).map(u => `<li>${e(u.username)} <small>· ${roles[u.role]}</small><ul>${branch(u.id, depth + 1)}</ul></li>`).join(''); }
          const roots = list.filter(u => !list.some(p => p.id === u.parentId));
          openDialog('Estructura de cuentas', `<p>${e(siteName)}</p><ul class="tree">${roots.map(u => `<li>${e(u.username)} <small>· ${roles[u.role]}</small><ul>${branch(u.id)}</ul></li>`).join('') || '<li>No hay cuentas.</li>'}</ul>`, null);
        }); return;
      }
      if (next === 'statistics') { dashboard(); return; }
      if (next === 'summary' || next === 'reports') {
        const result = await api(route(scoped, 'summary')); if (!active()) return;
        $('#content').innerHTML = heading(next === 'summary' ? 'Mi resumen' : next === 'statistics' ? 'Estadísticas' : 'Reportes Globales', `${siteName} · Información de tu alcance`) + `<div class="summary-grid"><article class="metric"><small>Cuentas visibles</small><strong>${result.accounts}</strong></article><article class="metric"><small>Agentes</small><strong>${result.agents}</strong></article><article class="metric"><small>Dependientes directos</small><strong>${result.directChildren}</strong></article></div><section class="card"><p class="muted">${me.role === 'agent' ? 'Este resumen incluye tu cuenta y los agentes que dependen de ella.' : 'Este resumen corresponde exclusivamente al sitio seleccionado.'}</p></section>`; return;
      }
      if (['chips', 'games', 'finance'].includes(next)) {
        await api(route(scoped, 'sections/' + next)); if (!active()) return;
        const title = sectionsFor(me.role).find(item => item.id === next).label;
        const columns = next === 'chips' ? ['Fecha', 'Usuario', 'Movimiento', 'Fichas'] : next === 'games' ? ['Fecha', 'Usuario', 'Juego', 'Resultado'] : ['Fecha', 'Concepto', 'Importe'];
        $('#content').innerHTML = heading(title, siteName) + `<section class="card"><form id="report-form" class="report-form"><div class="report-dates"><label>Fecha inicial<input type="date" name="start"></label><label>Fecha final<input type="date" name="end"></label></div><label>Nombre de usuario<input name="username" maxlength="50"></label><button>BUSCAR</button></form><div class="table-wrap"><table class="users"><thead><tr>${columns.map(title => `<th>${e(title)}</th>`).join('')}</tr></thead></table></div><p class="empty" id="report-status" role="status">Sin datos: esta sección todavía no tiene una fuente de actividad conectada.</p></section>`;
        $('#report-form').addEventListener('submit', event => {
          event.preventDefault(); const form = event.currentTarget;
          $('#report-status').textContent = form.elements.start.value && form.elements.end.value && form.elements.start.value > form.elements.end.value ? 'La fecha final debe ser posterior a la inicial.' : 'Sin datos: esta sección todavía no tiene una fuente de actividad conectada.';
        }); return;
      }
      if (['tournaments', 'categories', 'chat'].includes(next)) {
        await api(route(scoped, 'sections/' + next)); if (!active()) return;
        const title = sectionsFor(me.role).find(item => item.id === next).label;
        $('#content').innerHTML = heading(title, siteName) + `<section class="card empty">${next === 'categories' ? 'No hay categorías configuradas.' : 'Pronto.'}</section>`; return;
      }
      if (next === 'banners') {
        const result = await api(route(scoped, 'banners')); if (!active()) return;
        $('#content').innerHTML = heading('Banners e imágenes', siteName, '<button id="create-banner" class="red">+ NUEVO BANNER</button>') + `<section class="card"><p class="muted">Imágenes del sitio seleccionado. PNG, JPG o WebP de hasta 1 MB.</p><div class="banner-grid">${result.banners.map(b => `<article class="banner-item"><img src="${e(b.image)}" alt="${e(b.title)}"><div><h3>${e(b.title)}</h3><p>Orden ${b.order} · ${b.active ? 'Activo' : 'Oculto'}</p><button data-edit-banner="${b.id}" class="small">Editar</button><button data-delete-banner="${b.id}" class="small outline">Eliminar</button></div></article>`).join('') || '<p class="empty">Todavía no hay banners en este sitio.</p>'}</div></section>`;
        function editBanner(banner) {
          openDialog(banner ? 'Editar banner' : 'Nuevo banner', `<p>Sitio: <strong>${e(siteName)}</strong></p><label>Título / texto alternativo<input name="title" maxlength="120" value="${e(banner?.title || '')}" required></label><label>Orden<input name="order" type="number" min="0" max="9999" value="${banner?.order || 0}" required></label><label class="check"><input type="checkbox" name="active" ${!banner || banner.active ? 'checked' : ''}> Activo</label><label>Imagen<input id="banner-file" name="image" type="file" accept="image/png,image/jpeg,image/webp" ${banner ? '' : 'required'}></label><img id="banner-preview" class="banner-preview" alt="Vista previa" ${banner ? `src="${e(banner.image)}"` : 'hidden'}>`, async fields => {
            const file = fields.get('image'); let data;
            if (file?.size) data = await readImage(file);
            await api(route(scoped, 'banners' + (banner ? '/' + banner.id : '')), banner ? 'PATCH' : 'POST', { title: fields.get('title'), order: Number(fields.get('order')), active: fields.get('active') === 'on', ...(data ? { image: data } : {}) }); notify('Banner guardado en ' + siteName + '.'); await openView('banners');
          });
          $('#banner-file').addEventListener('change', async event => {
            const file = event.target.files[0]; if (!file) return;
            try { const src = await readImage(file); const preview = $('#banner-preview'); if (preview) { preview.src = src; preview.hidden = false; } $('#dialog-error').textContent = ''; }
            catch (error) { $('#dialog-error').textContent = error.message; }
          });
        }
        $('#create-banner').addEventListener('click', () => editBanner(null));
        $('#content').querySelectorAll('[data-edit-banner]').forEach(button => button.addEventListener('click', () => editBanner(result.banners.find(b => b.id === button.dataset.editBanner))));
        $('#content').querySelectorAll('[data-delete-banner]').forEach(button => button.addEventListener('click', () => {
          const banner = result.banners.find(b => b.id === button.dataset.deleteBanner);
          openDialog('Eliminar banner', `<p>¿Eliminar «${e(banner.title)}» de ${e(siteName)}?</p>`, async () => { await api(route(scoped, 'banners/' + banner.id), 'DELETE'); notify('Banner eliminado.'); await openView('banners'); });
        })); return;
      }
      if (next === 'settings') {
        const result = await api(route(scoped, 'settings')); if (!active()) return;
        $('#content').innerHTML = heading('Settings', siteName) + `<section class="card"><form id="settings-form" class="settings-form"><label>Nombre del sitio<input name="name" maxlength="80" value="${e(result.site.name)}" required></label><label>Interfaz principal<select name="interface"><option value="base">Base</option></select></label><button>GUARDAR CAMBIOS</button></form></section>`;
        $('#settings-form').addEventListener('submit', async event => {
          event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
          try { const result = await api(route(scoped, 'settings'), 'PATCH', { name: form.elements.name.value, interface: 'base' }); sites = sites.map(s => s.id === scoped ? result.site : s); renderNav(); notify('Configuración guardada.'); }
          catch (error) { notify(error.message); } finally { button.disabled = false; }
        }); return;
      }
      if (next === 'activity') {
        const result = await api(route(scoped, 'activity')); if (!active()) return;
        $('#content').innerHTML = heading('Registro de actividad', siteName) + `<section class="card"><ul class="activity">${result.events.map(event => `<li>${e(event.action)}<small>${e(event.actorName)} · ${e(new Date(event.at).toLocaleString('es-AR'))}</small></li>`).join('') || '<li>Sin actividad registrada.</li>'}</ul></section>`; return;
      }
      $('#content').innerHTML = heading('Soporte', siteName) + '<section class="card empty">Pronto.</section>';
    } catch (error) { if (active()) $('#content').innerHTML = `<section class="card error-card" role="alert">${e(error.message)}</section>`; }
  }
  async function readImage(file) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 1024 * 1024) throw new Error('Usá PNG, JPG o WebP de hasta 1 MB.');
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('No se pudo leer la imagen.')); reader.readAsDataURL(file); });
  }
  $('#account-menu').querySelectorAll('button').forEach(button => button.addEventListener('click', async () => {
    $('#account-menu').hidden = true; $('#account-button').setAttribute('aria-expanded', 'false');
    try {
      if (button.dataset.account === 'logout') { await api('/api/management/logout', 'POST', {}); showLogin(); return; }
      if (button.dataset.account === 'password') {
        openDialog('Cambiar contraseña', passwordInput('Contraseña actual', 'currentPassword', 'current-password') + passwordInput('Nueva contraseña', 'newPassword') + passwordInput('Repetir nueva contraseña', 'confirmPassword'), async fields => {
          if (fields.get('newPassword') !== fields.get('confirmPassword')) throw new Error('Las contraseñas no coinciden.');
          await api('/api/management/password', 'POST', { currentPassword: fields.get('currentPassword'), newPassword: fields.get('newPassword') }); showLogin(); $('#login-error').textContent = 'Contraseña cambiada. Ingresá nuevamente.';
        }); return;
      }
      if (button.dataset.account === 'logins') {
        const result = await api('/api/management/logins');
        openDialog('Historial de ingresos', `<ul class="activity">${result.entries.map(date => `<li>${e(new Date(date).toLocaleString('es-AR'))}</li>`).join('') || '<li>No hay ingresos registrados.</li>'}</ul>`, null); return;
      }
      if (button.dataset.account === 'profile') { openDialog('Mi cuenta', `<dl class="info-grid"><dt>Usuario</dt><dd>${e(me.username)}</dd><dt>Rol</dt><dd>${roles[me.role]}</dd><dt>Sitio</dt><dd>${e(currentSite()?.name || 'Administración general')}</dd></dl>`, null); return; }
      openDialog('Información de contacto', '<p>Pronto.</p>', null);
    } catch (error) { notify(error.message); }
  }));
  loadSession().catch(error => { showLogin(); if (error.message !== 'Ingresá para continuar.') $('#login-error').textContent = error.message; });
})();
