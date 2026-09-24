import { api, el } from './common.js';
const content = document.querySelector('#playerContent');
const page = location.pathname.split('/')[2] || 'home';
let user;
async function logout() { await api('/api/logout', { method: 'POST' }); location.assign('/jugadores'); }
const names = { home: 'Inicio', slots: 'Slots', casino: 'Casino en vivo', deportes: 'Deportes', caballos: 'CABALLOS', crazzy: 'CrazZy Win!' };
const formatBalance = value => Number(value).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' F';
const toast = message => { const node = document.querySelector('#toast'); node.textContent = message; node.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => node.hidden = true, 4000); };
async function refresh() { ({ user } = await api('/api/me')); if (user.role !== 'player') return location.replace('/admin'); document.querySelector('#balance').textContent = formatBalance(user.balance); document.querySelector('#balance').title = 'Saldo de fichas virtuales'; }
const menu = document.querySelector('#playerMenu'), backdrop = document.querySelector('#drawerBackdrop'), menuButton = document.querySelector('#menuToggle');
function setMenu(open) { menu.classList.toggle('open', open); menu.inert = !open; backdrop.hidden = !open; menuButton.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('menu-open', open); if (open) menu.querySelector('a.active').focus(); else menuButton.focus(); }
menuButton.addEventListener('click', () => setMenu(!menu.classList.contains('open')));
backdrop.addEventListener('click', () => setMenu(false));
menu.querySelector(`[data-page="${page}"]`)?.classList.add('active');
document.addEventListener('keydown', event => { if (!menu.classList.contains('open')) return; if (event.key === 'Escape') setMenu(false); if (event.key === 'Tab') { const nodes = [...menu.querySelectorAll('a,button')]; if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); } else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); } } });
document.querySelector('#drawerLogout').addEventListener('click', logout);
document.querySelector('#refreshBalance').addEventListener('click', async event => { event.currentTarget.disabled = true; try { await refresh(); toast('Saldo actualizado'); } catch (e) { toast(e.message); } finally { document.querySelector('#refreshBalance').disabled = false; } });
const dialog = document.querySelector('#accountDialog'), dialogContent = document.querySelector('#dialogContent');
document.querySelector('#closeDialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog && (event.clientX < dialog.getBoundingClientRect().left || event.clientX > dialog.getBoundingClientRect().right || event.clientY < dialog.getBoundingClientRect().top || event.clientY > dialog.getBoundingClientRect().bottom)) dialog.close(); });
const popup = el('div', 'account-dropdown'); popup.hidden = true; document.querySelector('.player-header').append(popup);
let activePopup = '';
function closePopup() { popup.hidden = true; activePopup = ''; document.querySelectorAll('[data-dialog]').forEach(b => b.setAttribute('aria-expanded', 'false')); }
function action(label, callback, cls = '') { const b = el('button', cls, label); b.type = 'button'; b.addEventListener('click', callback); return b; }
function openDialog(title) { closePopup(); dialog.className = ''; dialogContent.replaceChildren(el('h2', '', title)); dialog.showModal(); }
function messageDialog(title, message) { openDialog(title); dialogContent.append(el('p', '', message)); }
function passwordDialog() {
  openDialog('Cambiar contraseña'); const form = el('form', 'player-form');
  for (const [name, label] of [['currentPassword','Contraseña actual'],['password','Nueva contraseña'],['confirmation','Repetir contraseña']]) { const l = el('label', '', label), input = el('input'); input.name = name; input.type = 'password'; input.required = true; input.maxLength = 128; input.autocomplete = name === 'currentPassword' ? 'current-password' : 'new-password'; l.append(input); form.append(l); }
  const status = el('p'); status.setAttribute('role','status'); const save = el('button', 'player-submit', 'GUARDAR'); form.append(status,save);
  form.addEventListener('submit', async event => { event.preventDefault(); if(save.disabled) return; const values = Object.fromEntries(new FormData(form)); if(values.password !== values.confirmation) { status.textContent = 'Las contraseñas no coinciden.'; return; } save.disabled = true; try { await api('/api/account/password', {method:'POST',body:JSON.stringify(values)}); form.reset(); status.textContent = 'Contraseña actualizada.'; } catch(e) { status.textContent=e.message; } finally {save.disabled=false;} }); dialogContent.append(form);
}
async function loginHistory() { openDialog('Historial de ingresos'); const status=el('p','','Cargando…');dialogContent.append(status);try { const { entries }=await api('/api/account/logins'); status.textContent=entries.length?'Tus últimos ingresos:':'No hay ingresos registrados.';const list=el('ul','login-history');for(const date of entries)list.append(el('li','',new Date(date).toLocaleString('es-AR')));dialogContent.append(list); } catch(e){status.textContent=e.message;} }
function support() { openDialog('Soporte'); dialog.className='support-dialog'; const body=el('div','support-body');body.append(el('p','','Todavía no hay un canal de soporte configurado.'));const composer=el('div','support-composer'),input=el('input');input.placeholder='Escribe un mensaje…';input.disabled=true;input.ariaLabel='Mensaje a soporte';const send=action('➤',()=>{});send.disabled=true;send.ariaLabel='Enviar mensaje';composer.append(input,send);dialogContent.append(body,composer); }
const profileActions = [
  ['Cambiar contraseña',passwordDialog],
  ['Cambiar Idioma',()=>{openDialog('Cambiar idioma'); const select=el('select');select.ariaLabel='Idioma';select.append(el('option','','Español'));dialogContent.append(select,el('p','','Español es el idioma disponible actualmente.'));}],
  ['Historial de Saldo',()=>messageDialog('Historial de saldo','No hay movimientos de fichas registrados.')],
  ['Historial Deportes',()=>messageDialog('Historial de deportes','No hay apuestas deportivas registradas.')],
  ['Historial de Ingresos',loginHistory],
  ['Reglamento Deportes',()=>messageDialog('Reglamento de deportes','Disponible cuando se configure el proveedor de deportes.')],
  ['Contactar a mi Agente',()=>messageDialog('Contactar a mi agente','El canal de contacto con tu agente todavía no está configurado.')],
  ['Cerrar sesión',logout]
];
document.querySelectorAll('[data-dialog]').forEach(button => { button.setAttribute('aria-expanded','false'); button.addEventListener('click',()=>{
  const type=button.dataset.dialog;if(type==='chat'){support();return;}if(activePopup===type){closePopup();return;}closePopup();activePopup=type;popup.replaceChildren();popup.classList.toggle('notification-dropdown',type==='notifications');
  const items=type==='profile'?profileActions:[['· Mesa de ayuda ·',support],['· Notificaciones ·',()=>messageDialog('Notificaciones','No tenés notificaciones.')]];
  for(const [label,callback] of items)popup.append(action(label,callback));popup.hidden=false;button.setAttribute('aria-expanded','true');
}); });
document.addEventListener('click',event=>{if(!popup.contains(event.target)&&!event.target.closest('[data-dialog]'))closePopup();});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closePopup();});
function loginDialog() {
  openDialog('Bienvenido');dialog.className='player-login-dialog';const form=el('form','player-form');
  for(const [name,label,type] of [['username','Nombre de usuario','text'],['password','Contraseña','password']]) {const l=el('label','',label),input=el('input');input.name=name;input.type=type;input.required=true;input.autocomplete=name==='username'?'username':'current-password';l.append(input);form.append(l);}
  const error=el('p','login-feedback');error.setAttribute('role','status');const buttons=el('div','player-form-actions'),cancel=action('CANCELAR',()=>dialog.close()),submit=el('button','player-submit','INGRESAR');buttons.append(cancel,submit);form.append(error,buttons);
  form.addEventListener('submit',async event=>{event.preventDefault();if(submit.disabled)return;submit.disabled=true;submit.classList.add('loading');form.setAttribute('aria-busy','true');error.textContent='';try{const result=await api('/api/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});location.assign(result.redirect);}catch(e){error.textContent=e.message;submit.disabled=false;submit.classList.remove('loading');form.removeAttribute('aria-busy');}});dialogContent.append(form);
}
document.querySelector('#openPlayerLogin').addEventListener('click',loginDialog);
function carousel(banners, style) {
  if (!banners.length) return null;
  const section = el('section', style); section.setAttribute('aria-label', 'Banners de ' + (style === 'hero' ? 'Inicio' : 'Slots'));
  let current = 0;
  const slide = el('div', 'banner-slide'); section.append(slide);
  const dots = el('div', 'carousel-dots');
  function render() {
    const banner = banners[current]; slide.replaceChildren();
    const image = el('img', 'banner-image'); image.src = banner.image; image.alt = banner.layout === 'image' ? banner.title : ''; slide.append(image);
    if (banner.layout === 'orbital' || banner.layout === 'brand') {
      const logo = el('img', banner.layout === 'orbital' ? 'orbital-logo' : 'brand-logo'); logo.src = '/assets/orbital-logo.svg'; logo.alt = 'Universe Game'; slide.append(logo);
      if (banner.layout === 'brand') { const copy = el('div', 'brand-copy'); copy.append(el('h1', '', banner.title), el('p', '', banner.subtitle)); slide.append(copy); }
    }
    [...dots.children].forEach((dot, i) => { dot.classList.toggle('active', i === current); dot.setAttribute('aria-current', i === current ? 'true' : 'false'); });
  }
  for (const [className, direction, label] of [['prev', -1, 'Banner anterior'], ['next', 1, 'Banner siguiente']]) { const button = el('button', 'carousel-arrow ' + className, direction === -1 ? '‹' : '›'); button.setAttribute('aria-label', label); button.disabled = banners.length < 2; button.addEventListener('click', () => { current = (current + direction + banners.length) % banners.length; render(); }); section.append(button); }
  banners.forEach((b, i) => { const dot = el('button'); dot.setAttribute('aria-label', 'Ver banner ' + (i + 1)); dot.addEventListener('click', () => { current = i; render(); }); dots.append(dot); }); section.append(dots); render(); return section;
}
function footer() {
  const fragment = document.createDocumentFragment();
  const social = el('section', 'social-strip'); social.append(el('p', '', '¡Síguenos en nuestras redes sociales!'));
  const icons = el('div', 'social-icons'); icons.setAttribute('aria-hidden', 'true'); for (const icon of ['f', '◎', 'in', '𝕏']) icons.append(el('span', '', icon)); social.append(icons, el('div', 'social-note', 'Canales oficiales próximamente')); fragment.append(social);
  const foot = el('footer', 'site-footer'), logo = el('img', 'wordmark'); logo.src = '/assets/wordmark.png'; logo.alt = 'Universe Game'; foot.append(logo, el('div', 'footer-rule'), el('p', 'copyright', '© Universe Game'), el('h2', 'footer-title', 'PRODUCTOS'), el('div', 'footer-rule'));
  const links = el('nav', 'footer-links'); for (const p of ['slots', 'casino', 'crazzy']) { const link = el('a', '', names[p]); link.href = '/jugadores/' + p; links.append(link); }
  foot.append(links, el('h2', 'footer-title', 'NOSOTROS'), el('div', 'footer-rule'), el('p', 'footer-about', 'Universe Game · Plataforma de entretenimiento con fichas virtuales. Sin dinero real.')); fragment.append(foot); return fragment;
}
function promo(image, title, description) {
  const link = el('a', 'promo'); link.href = '/jugadores/casino'; const img = el('img'); img.src = image; img.alt = ''; img.loading = 'lazy'; const copy = el('div', 'promo-copy'); const heading = el('h3'); title.split('|').forEach((line, index) => { if (index) heading.append(el('br')); heading.append(document.createTextNode(line)); }); copy.append(heading, el('p', '', description)); link.append(img, copy); return link;
}
function home(banners, promotions, sportsBanners) {
  const hero = carousel(banners, 'hero'); if (hero) content.append(hero);
  const sections = el('div', 'home-sections'), selection = el('section', 'selection'), grid = el('div', 'promo-grid');
  selection.append(el('h2', '', 'NUESTRA SELECCIÓN PARA TI')); for (const banner of promotions) grid.append(promo(banner.image, banner.title, banner.subtitle)); selection.append(grid); sections.append(selection);
  const sports = el('section', 'sports-section'); sports.append(el('h2', '', 'APUESTAS DEPORTIVAS')); for (const banner of sportsBanners) { const link = el('a', 'sports-promo'); link.href = '/jugadores/deportes'; const img = el('img'); img.src = banner.image; img.alt = ''; img.loading = 'lazy'; const copy = el('div', 'sports-copy', banner.title); copy.append(el('b', '', banner.subtitle)); link.append(img, copy); sports.append(link); } sections.append(sports);
  for (const [title, cls] of [['TRAGAMONEDAS', ''], ['MESAS EN VIVO SELECCIONADAS', 'live']]) { const section = el('section', 'empty-home-section ' + cls); section.append(el('h2', '', title), el('div', 'empty-space')); sections.append(section); }
  content.append(sections, footer());
}
function catalog(banners) {
  const banner = carousel(banners, 'slots-banner'); if (banner) content.append(banner);
  const toolbar = el('div', 'catalog-toolbar'), favorites = el('button', '', '❤️ Favoritos'), recent = el('button', '', '⟳ Recientes'), form = el('form', 'catalog-search');
  const input = el('input'); input.type = 'search'; input.setAttribute('aria-label', 'Buscar juegos'); const search = el('button', '', '⌕'); search.setAttribute('aria-label', 'Buscar'); form.append(input, search); toolbar.append(favorites, recent, form);
  const providers = el('div', 'provider-toolbar'), select = el('select'); select.setAttribute('aria-label', 'Proveedores'); select.disabled = true; const option = el('option', '', 'Sin proveedores'); select.append(option); providers.append(select, el('span', '', '0 juegos'));
  const empty = el('div', 'catalog-empty'); empty.setAttribute('role', 'status'); empty.textContent = 'No hay juegos disponibles por el momento.';
  let filter = '';
  function renderEmpty() { empty.textContent = input.value.trim() ? 'No hay resultados: el catálogo está vacío.' : filter === 'favorites' ? 'Todavía no tenés juegos favoritos.' : filter === 'recent' ? 'Todavía no hay juegos recientes.' : 'No hay juegos disponibles por el momento.'; favorites.classList.toggle('selected', filter === 'favorites'); recent.classList.toggle('selected', filter === 'recent'); favorites.setAttribute('aria-pressed', String(filter === 'favorites')); recent.setAttribute('aria-pressed', String(filter === 'recent')); }
  favorites.addEventListener('click', () => { filter = filter === 'favorites' ? '' : 'favorites'; renderEmpty(); }); recent.addEventListener('click', () => { filter = filter === 'recent' ? '' : 'recent'; renderEmpty(); }); form.addEventListener('submit', event => { event.preventDefault(); renderEmpty(); }); input.addEventListener('input', renderEmpty); renderEmpty();
  content.append(toolbar, providers, empty);
}
try {
  const response = await fetch('/api/me', { credentials: 'same-origin' });
  if (response.ok) { ({user} = await response.json()); if(user.role !== 'player') { location.replace('/admin'); } document.querySelector('#balance').textContent = formatBalance(user.balance); }
  else if(response.status !== 401) throw new Error('No se pudo consultar la sesión.');
  document.querySelector('.account-bar').hidden = !user; document.querySelector('#openPlayerLogin').hidden = !!user; document.querySelector('#drawerLogout').hidden = !user;
  if (page === 'home') { const results = await Promise.all(['home', 'selection', 'sports'].map(destination => api('/api/banners?destination=' + destination))); home(...results.map(result => result.banners)); }
  else if (page === 'slots' || page === 'casino') catalog(page === 'slots' ? (await api('/api/banners?destination=slots')).banners : []);
  else { const blank = el('section', 'blank-view'); blank.setAttribute('aria-label', names[page]); blank.append(el('h1', 'blank-heading', names[page])); const back = el('a', '', '← Volver al inicio'); back.href = '/jugadores'; blank.append(back); content.append(blank); }
} catch (error) { content.append(el('p', 'catalog-empty', error.message)); }
