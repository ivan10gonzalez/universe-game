// Shared by API and browser so the visible menu and enforced permissions agree.
const basic = [
  ['users', 'Usuarios', '\uf4fe'],
  ['reports', 'Reportes Globales', '\uf5dc'],
  ['chips', 'Reportes de Fichas', '\uf51e'],
  ['games', 'Reportes de Juegos', '\uf522'],
  ['finance', 'Finanzas', '\uf4c0'],
  ['summary', 'Mi resumen', '\uf571']
];
const management = [
  ['banners', 'Banners Inicio / Slots', '\uf1de'],
  ['tournaments', 'Torneos', '\uf091'],
  ['categories', 'Categorías', '\uf013'],
  ['chat', 'Chat Soporte', '\uf086'],
  ['activity', 'Registro de actividad', '\uf1da'],
  ['settings', 'Settings', '\uf013'],
  ['support', 'Soporte', '\uf0e0']
];
export function sectionsFor(role) {
  if (!['super', 'master', 'agent'].includes(role)) return [];
  const items = role === 'agent' ? [['statistics', 'Estadísticas', '\uf200'], ...basic] : [['statistics', 'Estadísticas', '\uf200'], ...basic, ...management];
  if (role === 'super') items.push(['new-site', 'Nuevo sitio', '\uf067'], ['sites', 'Sitios', '\uf0ac']);
  return items.map(([id, label, icon]) => ({ id, label, icon }));
}
export const canOpenSection = (role, section) => sectionsFor(role).some(item => item.id === section);
