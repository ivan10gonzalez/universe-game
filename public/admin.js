import { api, el, logout } from './common.js';
const sideMenu = document.querySelector('#sideMenu'), overlay = document.querySelector('#menuOverlay');
function closeMenu() { sideMenu.classList.remove('open'); overlay.classList.add('hidden'); }
document.querySelector('#menuBtn').addEventListener('click', () => { sideMenu.classList.add('open'); overlay.classList.remove('hidden'); }); overlay.addEventListener('click', closeMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
document.querySelector('#adminLogout').addEventListener('click', logout);
const dashboard = document.querySelector('#dashboard'), manager = document.querySelector('#bannerManager');
const bannerItem = [...document.querySelectorAll('.menu-item')].find(item => item.textContent.includes('Banners Inicio'));
function showBanners() { document.dispatchEvent(new Event('show-banners')); dashboard.classList.add('hidden'); manager.classList.remove('hidden'); closeMenu(); window.scrollTo(0, 0); reload().catch(report); }
bannerItem.setAttribute('role', 'button'); bannerItem.tabIndex = 0; bannerItem.addEventListener('click', showBanners); bannerItem.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showBanners(); } });
document.querySelector('#backDashboard').addEventListener('click', () => { manager.classList.add('hidden'); dashboard.classList.remove('hidden'); });
const form = document.querySelector('#bannerForm'), list = document.querySelector('#bannerList'), preview = document.querySelector('#bannerPreview'), message = document.querySelector('#bannerMessage');
const fields = Object.fromEntries(['Destination', 'Title', 'Subtitle', 'Order', 'Active', 'File'].map(name => [name.toLowerCase(), document.querySelector('#banner' + name)]));
let destination = 'home', banners = [], editing = null, imageData = null, uploadVersion = 0;
function report(error) { message.textContent = error.message || error; }
function reset() { uploadVersion++; document.querySelector('#saveBanner').disabled = false; form.reset(); fields.destination.value = destination; editing = null; imageData = null; preview.removeAttribute('src'); preview.classList.add('hidden'); document.querySelector('#formTitle').textContent = 'Nuevo banner'; message.textContent = ''; }
document.querySelector('#cancelEdit').addEventListener('click', reset);
document.querySelectorAll('[data-destination]').forEach(button => button.addEventListener('click', () => { destination = button.dataset.destination; document.querySelectorAll('[data-destination]').forEach(b => b.classList.toggle('selected', b === button)); reset(); render(); }));
fields.file.addEventListener('change', async () => {
  imageData = null; const version = ++uploadVersion; const saveButton = document.querySelector('#saveBanner'); saveButton.disabled = false; const file = fields.file.files[0];
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) { fields.file.value = ''; return report('Usá PNG, JPG o WebP de hasta 4 MB.'); }
  saveButton.disabled = true; const reader = new FileReader();
  reader.onload = async () => { const candidate = new Image(); candidate.src = reader.result; try { await candidate.decode(); if (version !== uploadVersion) return; imageData = reader.result; preview.src = imageData; preview.classList.remove('hidden'); report('Vista previa lista. Guardá para publicar el cambio.'); } catch { if (version === uploadVersion) { fields.file.value = ''; report('No se pudo leer esta imagen.'); } } finally { if (version === uploadVersion) saveButton.disabled = false; } };
  reader.onerror = () => { if (version === uploadVersion) { saveButton.disabled = false; report('No se pudo leer el archivo.'); } }; reader.readAsDataURL(file);
});
async function reload() { ({ banners } = await api('/api/admin/banners')); render(); }
function render() {
  list.replaceChildren(); const selected = banners.filter(b => b.destination === destination);
  if (!selected.length) list.append(el('p', '', 'No hay banners en este destino.'));
  for (const banner of selected) {
    const card = el('article', 'banner-card'), img = el('img'); img.src = banner.image; img.alt = banner.title; card.append(img, el('h3', '', banner.title), el('p', '', `Orden ${banner.order} · ${banner.active ? 'Activo' : 'Inactivo'}`));
    const actions = el('div', 'banner-card-actions');
    const edit = el('button', '', 'Editar'); edit.addEventListener('click', () => { uploadVersion++; document.querySelector('#saveBanner').disabled = false; editing = banner.id; imageData = null; fields.destination.value = banner.destination; fields.title.value = banner.title; fields.subtitle.value = banner.subtitle || ''; fields.order.value = banner.order; fields.active.checked = banner.active; fields.file.value = ''; preview.src = banner.image; preview.classList.remove('hidden'); document.querySelector('#formTitle').textContent = 'Editar banner'; message.textContent = ''; form.scrollIntoView({ block: 'center' }); fields.title.focus(); });
    const toggle = el('button', '', banner.active ? 'Desactivar' : 'Activar'); toggle.addEventListener('click', async () => { toggle.disabled = true; try { await api('/api/admin/banners/' + banner.id, { method: 'PUT', body: JSON.stringify({ ...banner, active: !banner.active }) }); await reload(); report('Estado guardado.'); } catch (e) { report(e); toggle.disabled = false; } });
    const remove = el('button', '', 'Eliminar'); remove.addEventListener('click', async () => { if (!confirm('¿Eliminar este banner?')) return; remove.disabled = true; try { await api('/api/admin/banners/' + banner.id, { method: 'DELETE' }); if (editing === banner.id) reset(); await reload(); report('Banner eliminado.'); } catch (e) { report(e); remove.disabled = false; } });
    actions.append(edit, toggle, remove); card.append(actions); list.append(card);
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (!editing && !imageData) return report('Seleccioná una imagen antes de guardar.');
  const save = document.querySelector('#saveBanner'); save.disabled = true;
  try {
    await api('/api/admin/banners' + (editing ? '/' + editing : ''), { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ destination: fields.destination.value, title: fields.title.value, subtitle: fields.subtitle.value, order: Number(fields.order.value), active: fields.active.checked, ...(imageData ? { imageData } : {}) }) });
    destination = fields.destination.value; document.querySelectorAll('[data-destination]').forEach(b => b.classList.toggle('selected', b.dataset.destination === destination)); reset(); await reload(); report('Banner guardado. Ya está disponible en la plataforma.');
  } catch (e) { report(e); } finally { save.disabled = false; }
});
try { const { user } = await api('/api/me'); if (!['admin', 'agent'].includes(user.role)) location.replace('/jugadores'); if (user.role === 'agent') bannerItem.hidden = true; document.querySelector('#adminBalance').textContent = Number(user.balance).toLocaleString('es-AR', {minimumFractionDigits: 2}); } catch (e) { report(e); }
