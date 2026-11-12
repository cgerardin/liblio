#!/usr/bin/env node
// Serveur de développement local pour Liblio.
//   node scripts/dev-server.mjs [port]
// Sert le site et permet à l'interface d'administration d'écrire directement
// les fichiers de data/ (collection, couvertures, photos) sur le disque, sans passer par GitHub.

import http from 'node:http';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8080);
const WRITABLE = ['data/'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function safePath(rel) {
  const p = path.resolve(ROOT, `.${path.posix.normalize(`/${rel}`)}`);
  if (!p.startsWith(ROOT + path.sep) && p !== ROOT) throw new Error('Chemin interdit');
  return p;
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/__dev/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    if (url.pathname === '/__dev/commit' && req.method === 'POST') {
      const { message, files } = JSON.parse(await readBody(req));
      for (const f of files) {
        const rel = path.posix.normalize(f.path);
        if (!WRITABLE.some((w) => rel.startsWith(w)) || rel.includes('..')) throw new Error(`Écriture interdite : ${f.path}`);
        const abs = safePath(rel);
        if (f.content == null) {
          await rm(abs, { force: true });
        } else {
          await mkdir(path.dirname(abs), { recursive: true });
          await writeFile(abs, Buffer.from(f.content, 'base64'));
        }
      }
      console.log(`✔ ${files.length} fichier(s) — ${String(message).split('\n')[0]}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      return res.end('ok');
    }

    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const abs = safePath(rel);
    const st = await stat(abs).catch(() => null);
    if (!st || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(await readFile(abs));
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(e.message || e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Liblio en local : http://localhost:${PORT}`);
});
