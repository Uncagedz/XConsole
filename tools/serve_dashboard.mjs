import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';

const root = resolve('apps/dashboard/dist');
const indexFile = resolve(root, 'index.html');
const port = Number(process.env.PORT ?? 4173);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

if (!existsSync(indexFile)) {
  throw new Error(`Dashboard build is missing: ${indexFile}`);
}

const server = createServer((request, response) => {
  const method = request.method ?? 'GET';
  if (!['GET', 'HEAD'].includes(method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/health') {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    });
    response.end(method === 'HEAD' ? undefined : 'ok');
    return;
  }

  let requested;
  try {
    requested = decodeURIComponent(pathname);
  } catch {
    response.writeHead(400);
    response.end();
    return;
  }

  const candidate = resolve(root, `.${requested}`);
  const insideRoot = candidate === root || candidate.startsWith(`${root}${sep}`);
  const isFile = insideRoot && existsSync(candidate) && statSync(candidate).isFile();
  const file = isFile ? candidate : indexFile;
  const extension = extname(file).toLowerCase();
  const immutableAsset = file.includes(`${sep}assets${sep}`);

  response.writeHead(200, {
    'Cache-Control': immutableAsset
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
    'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(file).pipe(response);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`XConsole dashboard listening on port ${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
