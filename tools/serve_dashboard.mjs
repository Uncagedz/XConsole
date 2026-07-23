import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, resolve, sep } from 'node:path';

const root = resolve(process.env.XCONSOLE_DASHBOARD_ROOT ?? 'apps/dashboard/dist');
const indexFile = resolve(root, 'index.html');
const port = Number(process.env.PORT ?? 4173);
const gatewayBase = String(
  process.env.XCONSOLE_GATEWAY_URL
    ?? process.env.VITE_GATEWAY_API_URL
    ?? '',
).trim().replace(/\/+$/, '');
const hopByHopHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);
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

function proxyApi(request, response) {
  if (!gatewayBase) {
    response.writeHead(503, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({
      error: {
        type: 'configuration',
        message: 'The dashboard gateway URL is not configured.',
      },
    }));
    return;
  }

  let target;
  try {
    target = new URL(request.url ?? '/api', `${gatewayBase}/`);
  } catch {
    response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      error: {
        type: 'configuration',
        message: 'The configured dashboard gateway URL is invalid.',
      },
    }));
    return;
  }

  const headers = { ...request.headers };
  for (const header of hopByHopHeaders) delete headers[header];
  headers.host = target.host;
  headers['x-forwarded-host'] = request.headers.host ?? '';
  headers['x-forwarded-proto'] = 'https';

  const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = send(target, {
    method: request.method,
    headers,
  }, (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    for (const header of hopByHopHeaders) delete responseHeaders[header];
    response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', (error) => {
    if (response.headersSent) {
      response.destroy(error);
      return;
    }
    response.writeHead(502, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(JSON.stringify({
      error: {
        type: 'gateway',
        message: 'The XConsole gateway is unavailable.',
      },
    }));
  });
  request.pipe(upstream);
}

const server = createServer((request, response) => {
  const method = request.method ?? 'GET';
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    proxyApi(request, response);
    return;
  }

  if (!['GET', 'HEAD'].includes(method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end();
    return;
  }

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
  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  console.log(`XConsole dashboard listening on port ${listeningPort}; gateway proxy ${gatewayBase ? 'configured' : 'missing'}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
