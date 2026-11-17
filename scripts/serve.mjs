// Servidor estático mínimo para desenvolvimento e testes (sem dependências).
// Uso: node scripts/serve.mjs [porta]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.argv[3] || '.');
// Mesmos cabeçalhos da produção (vercel.json), para que os testes valham como no ar.
const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8').catch(() => '{}'));
const prodHeaders = Object.fromEntries((vercel.headers || []).filter(h => h.source === '/(.*)').flatMap(h => h.headers.map(x => [x.key, x.value])));
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon'
};

createServer(async (req, res) => {
  try {
    let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    let file = join(root, path);
    if (!file.startsWith(root)) throw new Error('fora da raiz');
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { ...prodHeaders, 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Não encontrado');
  }
}).listen(port, () => console.log(`Hub EMR em http://localhost:${port}`));
