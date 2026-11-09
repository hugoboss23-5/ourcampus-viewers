// Generated asset allowlist limits the worker to files in the verified public release.
import { pin, paths } from './cloudflare-release.mjs';

const assets = new Set(paths);
const baseModel = '/worldwide-stages-david/assets/visible-revisions/option-05/eb8d179eed0591119cc0b364218ff69b2ab127750c34863b85e143f632ea8a85/option-05.glb';
const mime = {
  css:'text/css; charset=utf-8', glb:'model/gltf-binary', hdr:'application/octet-stream',
  html:'text/html; charset=utf-8', jpg:'image/jpeg', js:'text/javascript; charset=utf-8',
  json:'application/json', mjs:'text/javascript; charset=utf-8', mp4:'video/mp4',
  pdf:'application/pdf', png:'image/png', svg:'image/svg+xml', txt:'text/plain; charset=utf-8',
  wasm:'application/wasm', webp:'image/webp', woff2:'font/woff2',
};

function error(status, message) {
  return new Response(message, {status, headers:{'Cache-Control':'no-store'}});
}

export default {
  async fetch(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});
    }
    const url = new URL(request.url);
    let path;
    try { path = decodeURIComponent(url.pathname); } catch { return error(400, 'Invalid path'); }
    if (path.endsWith('/')) path += 'index.html';
    else if (!assets.has(path) && assets.has(path+'/index.html')) {
      url.pathname += '/';
      return Response.redirect(url.toString(), 308);
    }
    if (!assets.has(path)) return error(404, 'Page not found');

    const packed = path === baseModel;
    const range = request.headers.get('Range');
    const headers = new Headers({'Accept-Encoding':'identity'});
    if (range && !packed) headers.set('Range',range);
    const key = (path+(packed ? '.gz' : '')).split('/').map(encodeURIComponent).join('/');
    let source;
    try {
      source = await fetch('https://raw.githubusercontent.com/hugoboss23-5/ourcampus-viewers/'+pin+'/site'+key, {
        method:request.method,headers,
      });
    } catch { return error(502, 'Project file could not be loaded'); }
    if (!source.ok) return error(source.status===404 ? 404 : 502, 'Project file could not be loaded');

    const type = path.split('.').pop();
    const responseHeaders = new Headers({
      'Content-Type': mime[type] || 'application/octet-stream',
      'Cache-Control': type==='html' ? 'public, max-age=60' : 'public, max-age=3600',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'strict-origin-when-cross-origin',
    });
    if (packed) {
      responseHeaders.set('Vary','Accept-Encoding');
      const acceptsGzip = /(?:^|,)\s*gzip\s*(?:;\s*q\s*=\s*(?!0(?:\.0*)?(?:\s*,|\s*$))[\d.]+)?\s*(?:,|$)/i
        .test(request.headers.get('Accept-Encoding')||'');
      if (acceptsGzip) {
        responseHeaders.set('Content-Encoding','gzip');
        if (source.headers.has('Content-Length')) responseHeaders.set('Content-Length',source.headers.get('Content-Length'));
        return new Response(source.body,{status:source.status,headers:responseHeaders,encodeBody:'manual'});
      }
      return new Response(source.body?.pipeThrough(new DecompressionStream('gzip')) ?? null,
        {status:source.status,headers:responseHeaders});
    }
    for (const name of ['Content-Length','Content-Range','Accept-Ranges','ETag','Last-Modified']) {
      if (source.headers.has(name)) responseHeaders.set(name,source.headers.get(name));
    }
    return new Response(source.body,{status:source.status,headers:responseHeaders});
  },
};
