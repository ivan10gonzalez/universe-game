import { api } from './common.js';
const form = document.querySelector('#loginForm'), button = document.querySelector('#loginBtn'), error = document.querySelector('#loginError');
form.addEventListener('submit', async event => {
  event.preventDefault(); if (button.disabled) return; button.disabled = true; button.classList.add('is-loading'); button.textContent = 'INGRESANDO…'; form.setAttribute('aria-busy', 'true'); error.textContent = '';
  try { const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: form.username.value, password: form.password.value }) }); location.assign(result.redirect); }
  catch (e) { error.textContent = e.message; button.disabled = false; button.classList.remove('is-loading'); button.textContent = 'INGRESAR'; form.setAttribute('aria-busy', 'false'); }
});
