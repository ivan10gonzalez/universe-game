// Run with a local checkout of Juegos- and its source commit. No credentials are copied.
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [sourcePath, sourceCommit] = process.argv.slice(2);
if (!sourcePath || !/^[a-f0-9]{40}$/.test(sourceCommit || '')) {
  throw new Error('Uso: node scripts/sync-joker.mjs <carpeta de Juegos-> <commit de 40 caracteres>');
}
const destination = resolve(dirname(fileURLToPath(import.meta.url)), '../public/games/joker');
const source = resolve(sourcePath);
const files = ['reference.css', 'reference.js', 'reels.js', 'engine.js',
  ...['frame.jpg', 'symbols.jpg', 'spin.jpg', 'bet.jpg', 'auto.jpg', 'hyper.jpg', 'rules.jpg', 'audio.mp3'].map(name => 'assets/reference-' + name)];
await mkdir(resolve(destination, 'assets'), { recursive: true });
for (const file of files) await copyFile(resolve(source, file), resolve(destination, file));
const html = (await readFile(resolve(source, 'teatro-del-azar.html'), 'utf8'))
  .replace('</head>', '<link rel="stylesheet" href="platform.css"></head>')
  .replace('<body>', '<body><header class="game-host-header"><a href="/jugadores/slots">← Volver a Slots</a><span>DEMO · FICHAS DE PRUEBA</span></header>')
  .replaceAll('href="index.html"', 'href="/jugadores/slots"')
  .replaceAll('Volver a ejemplos', 'Volver a Slots');
await writeFile(resolve(destination, 'index.html'), html);
await writeFile(resolve(destination, 'source.json'), JSON.stringify({
  repository: 'https://github.com/ivan10gonzalez/Juegos-', commit: sourceCommit,
  note: 'Demo educativa independiente. No utiliza el saldo, sesiones ni APIs de la plataforma.'
}, null, 2) + '\n');
console.log('Joker actualizado desde Juegos- ' + sourceCommit.slice(0, 7));
