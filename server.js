import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagementApp } from './management/server.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const app = createManagementApp({
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
  bootstrapPassword: process.env.SUPER_MASTER_PASSWORD || 'SuperMasterDemo2026!',
  secureCookies: process.env.NODE_ENV === 'production'
});
const server = http.createServer(app);
server.listen(Number(process.env.PORT || 3000), process.env.HOST || '0.0.0.0', () => {
  console.log('Panel de sitios disponible. Usuario inicial: super_master. Los datos se guardan en management.json.');
});
