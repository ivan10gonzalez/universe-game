export async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', 'X-Universe-Request': '1', ...options.headers } });
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && url !== '/api/login') location.replace('/');
    throw new Error(result.error || 'No se pudo completar la solicitud.');
  }
  return result;
}
export async function logout() {
  try { await api('/api/logout', { method: 'POST', body: '{}' }); location.replace('/'); } catch (error) { alert(error.message); }
}
export function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
