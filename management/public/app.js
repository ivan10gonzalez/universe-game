import { sectionsFor, canOpenSection } from '/management-permissions.js';
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const roles = { super: 'Super Master', master: 'Master', agent: 'Agente' };
  let me = null, sites = [], siteId = null, view = 'users', version = 0, onSubmit = null, toastTimer;
  const route = (site, section) => `/api/management/sites/${encodeURIComponent(site)}/${section}`;
  async function api(url, method = 'GET', data) {
    const response = await fetch(url, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Management-Request': '1' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401 && !url.endsWith('/login')) showLogin();
      throw new Error(body.error || 'No se pudo completar la operación.');
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
    $('#selected-site').textContent = currentSite()?.name || 'Seleccioná un sitio';
  }
  async function loadSession() {
    const data = await api('/api/management/me'); me = data.user; sites = data.sites;
    let remembered = null; try { remembered = sessionStorage.getItem(`management-site:${me.id}`); } catch { /* Storage can be disabled. */ }
    siteId = me.role === 'super' ? (sites.some(s => s.id === remembered) ? remembered : null) : me.siteId;
    $('#login-view').hidden = true; $('#panel').hidden = false;
    await openView(me.role === 'super' && !siteId ? 'sites' : 'users');
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
    openView('users');
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
        $('#content').innerHTML = heading('Sitios', 'Elegí el sitio sobre el que querés trabajar.', '<button id="create-site" class="red">+ NUEVO SITIO</button>') + (sites.length ? `<div class="site-grid">${sites.map(s => `<article class="card site-card ${s.id === siteId ? 'selected' : ''}"><h2>${e(s.name)}</h2><p class="muted">Interfaz Base · Gestión de cuentas y contenidos</p><button data-select-site="${e(s.id)}">${s.id === siteId ? 'SITIO SELECCIONADO' : 'ADMINISTRAR SITIO'}</button><code>${e(s.id)}</code></article>`).join('')}</div>` : '<section class="card empty">Todavía no hay sitios.<br>La creación de nuevas plataformas estará disponible próximamente.</section>');
        $('#create-site').addEventListener('click', newSitePreview);
        $('#content').querySelectorAll('[data-select-site]').forEach(button => button.addEventListener('click', () => selectSite(button.dataset.selectSite)));
        return;
      }
      if (!scoped) { $('#content').innerHTML = heading('Seleccioná un sitio') + '<section class="card empty">Abrí <strong>Sitios</strong>, al final del menú, y elegí cuál querés administrar.</section>'; return; }
      const siteName = currentSite()?.name || '';
      if (next === 'users') {
        const data = await api(route(scoped, 'users')); if (!active()) return;
        const list = data.users, isSuper = me.role === 'super';
        $('#content').innerHTML = `<h1 class="sr-only">Usuarios de ${e(siteName)}</h1><div class="user-toolbar"><button class="red" id="create-user"><span class="fa" aria-hidden="true">&#xf234;</span> NUEVO ${isSuper ? 'MASTER' : 'AGENTE'}</button><button class="red" id="structure">ESTRUCTURA</button></div><section class="card users-card"><form class="search" id="user-search-form"><label class="sr-only" for="user-search">Nombre de usuario</label><input id="user-search" type="search" placeholder="Nombre de usuario"><button>BUSCAR</button></form><div class="tabs user-filters" aria-label="Filtrar cuentas"><button type="button" data-role="all" class="selected" aria-pressed="true">TODOS</button><button type="button" data-role="master" aria-pressed="false">MASTERS</button><button type="button" data-role="agent" aria-pressed="false">AGENTES</button></div><div class="table-wrap"><table class="users"><thead><tr><th>Nombre de Usuario</th><th>Rol</th><th class="parent-column">Responsable</th><th>Acciones</th></tr></thead><tbody id="user-rows"></tbody></table></div><p class="count" id="user-count"></p></section>`;
        let roleFilter = 'all';
        const actor = me;
        const canReset = u => u.id !== actor.id && (isSuper ? ['master', 'agent'].includes(u.role) : u.role === 'agent');
        function paintUsers() {
          const needle = $('#user-search').value.trim().toLowerCase(), filtered = list.filter(u => u.username.toLowerCase().includes(needle) && (roleFilter === 'all' || u.role === roleFilter));
          $('#user-rows').innerHTML = filtered.map(u => `<tr><td class="username">${e(u.username)}</td><td><span class="role ${e(u.role)}">${roles[u.role]}</span></td><td class="parent-column">${e(list.find(p => p.id === u.parentId)?.username || (u.role === 'master' ? 'Super Master' : '—'))}</td><td class="table-actions">${canReset(u) ? `<button data-reset="${e(u.id)}" aria-label="Restablecer contraseña de ${e(u.username)}" title="Restablecer contraseña"><span class="fa" aria-hidden="true">&#xf084;</span></button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">No hay cuentas para mostrar.</td></tr>';
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
        $('#create-user').addEventListener('click', () => {
          openDialog(isSuper ? 'Master' : 'Agente', `<div class="create-tabs"><span>Ingreso</span></div><div class="credential-fields"><label class="credential-label"><span class="fa field-icon" aria-hidden="true">&#xf007;</span><span class="floating-label">Nombre de Usuario</span><input name="username" autocomplete="off" pattern="[a-zA-Z0-9_.-]{3,50}" minlength="3" maxlength="50" required></label><label class="credential-label"><button type="button" class="password-toggle fa" aria-label="Mostrar contraseña" aria-pressed="false">&#xf070;</button><span class="floating-label">Contraseña</span><input name="password" aria-label="Contraseña" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label></div><p class="create-note">${isSuper ? 'Master de ' + e(siteName) : 'Depende de ' + e(me.username) + ' · Puede crear subagentes'}</p>`, async fields => {
            await api(route(scoped, 'users'), 'POST', { username: fields.get('username'), password: fields.get('password'), role: isSuper ? 'master' : 'agent' }); notify('Cuenta creada. Ya puede ingresar con esos datos.'); await openView('users');
          }, 'account-create');
          dialog.querySelector('[name="username"]').focus();
          const toggle = dialog.querySelector('.password-toggle');
          toggle.addEventListener('click', () => {
            const input = dialog.querySelector('[name="password"]'), visible = input.type === 'password';
            input.type = visible ? 'text' : 'password'; toggle.textContent = visible ? '\uf06e' : '\uf070';
            toggle.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña'); toggle.setAttribute('aria-pressed', String(visible));
          });
        });
        $('#structure').addEventListener('click', () => {
          function branch(parent, depth = 0) { if (depth > 100) return '<li>La estructura continúa.</li>'; return list.filter(u => u.parentId === parent).map(u => `<li>${e(u.username)} <small>· ${roles[u.role]}</small><ul>${branch(u.id, depth + 1)}</ul></li>`).join(''); }
          const roots = list.filter(u => !list.some(p => p.id === u.parentId));
          openDialog('Estructura de cuentas', `<p>${e(siteName)}</p><ul class="tree">${roots.map(u => `<li>${e(u.username)} <small>· ${roles[u.role]}</small><ul>${branch(u.id)}</ul></li>`).join('') || '<li>No hay cuentas.</li>'}</ul>`, null);
        }); return;
      }
      if (next === 'summary' || next === 'reports' || next === 'statistics') {
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
