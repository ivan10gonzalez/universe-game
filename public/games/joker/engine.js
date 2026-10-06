/* Modelo didáctico original: cinco símbolos equiprobables, cinco columnas.
   Solo paga la fila central, desde la izquierda. No replica un proveedor. */
(function (root) {
  const SYMBOLS = ['ruby', 'emerald', 'orb', 'star', 'mask'];
  const MULTIPLIERS = { 3: 15, 4: 50, 5: 100 };
  function evaluate(row, stake) {
    if (!Array.isArray(row) || row.length !== 5 || row.some(s => !SYMBOLS.includes(s))) throw new Error('Fila inválida');
    if (!Number.isSafeInteger(stake) || stake < 1) throw new Error('Importe inválido');
    let count = 1;
    while (count < 5 && row[count] === row[0]) count++;
    return { count, multiplier: MULTIPLIERS[count] || 0, payout: stake * (MULTIPLIERS[count] || 0) };
  }
  function randomIndex() {
    // Rechazo para evitar sesgo de módulo; no se alteran resultados por jugador.
    const bytes = new Uint32Array(1), limit = 4294967295;
    do { globalThis.crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
    return bytes[0] % SYMBOLS.length;
  }
  function draw(index = randomIndex) {
    return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => SYMBOLS[index()]));
  }
  function round(balance, stake, index) {
    if (!Number.isSafeInteger(balance) || balance < stake || !Number.isSafeInteger(stake) || stake < 1) throw new Error('Fichas insuficientes');
    const grid = draw(index), result = evaluate(grid.map(column => column[1]), stake);
    return { grid, ...result, balance: balance - stake + result.payout };
  }
  const api = { SYMBOLS, MULTIPLIERS, evaluate, draw, round };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AulaAzar = api;
})(globalThis);
