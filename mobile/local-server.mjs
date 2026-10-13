// Loopback-only HTTPS entry point to the existing Wamp installation.
import https from 'node:https';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const tlsDir = join(process.env.LOCALAPPDATA, 'DriverMan', 'emulator-tls');
const server = https.createServer({
  key: readFileSync(join(tlsDir, 'localhost-key.pem')),
  cert: readFileSync(join(tlsDir, 'localhost-cert.pem')),
  minVersion: 'TLSv1.2',
}, (request, response) => {
  let path;
  try {
    if (!request.url.startsWith('/') || request.url.startsWith('//')) throw new Error();
    const url = new URL(request.url, 'https://127.0.0.1:9443');
    const decoded = decodeURIComponent(url.pathname);
    if (!decoded.startsWith('/driverman/') || decoded.includes('\\') || decoded.split('/').includes('..')) throw new Error();
    path = url.pathname + url.search;
  } catch {
    response.writeHead(404); response.end('Not found'); return;
  }
  const headers = {...request.headers, host: 'localhost'};
  for (const name of Object.keys(headers)) {
    if (['connection', 'proxy-authorization', 'proxy-connection', 'forwarded'].includes(name) || name.startsWith('x-forwarded-')) delete headers[name];
  }
  const upstream = http.request({host: '127.0.0.1', port: 80, path, method: request.method, headers}, result => {
    response.writeHead(result.statusCode, result.headers);
    result.pipe(response);
  });
  upstream.setTimeout(30000, () => upstream.destroy(new Error('Wamp timeout')));
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, {'Content-Type': 'text/plain; charset=utf-8'});
    response.end('Le serveur Wamp local est indisponible.');
  });
  request.on('aborted', () => upstream.destroy());
  request.pipe(upstream);
});
server.listen(9443, '127.0.0.1', () => console.log('DriverMan local HTTPS: https://127.0.0.1:9443/driverman/'));
