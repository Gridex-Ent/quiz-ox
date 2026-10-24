import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const METADATA_TOKEN_URL = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
const JWT_SECONDS = 20 * 60;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };
const assets = new Map([['/', 'screen.html'], ['/screen', 'screen.html'], ['/screen.js', 'screen.js'], ['/prize-data.json', 'prize-data.json']]);

function httpsOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('MANUAL_SCREEN_UPSTREAM에 HTTPS origin이 필요합니다.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('MANUAL_SCREEN_UPSTREAM에는 HTTPS origin만 설정해 주세요.');
  return url.origin;
}
function validateAccount(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(value)) throw Error('MANUAL_SCREEN_SERVICE_ACCOUNT에 전용 서비스 계정이 필요합니다.');
}
async function boundedFetch(fetchImpl, url, options, timeoutMs, consume) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await consume(await fetchImpl(url, { ...options, redirect: 'manual', signal: controller.signal })); }
  finally { clearTimeout(timer); }
}

export function createIapSigner({ serviceAccount, audience, fetchImpl = globalThis.fetch, now = Date.now, timeoutMs = 7000 } = {}) {
  validateAccount(serviceAccount);
  let cached = null, pending = null;
  return async () => {
    if (cached && cached.until > now() + 60000) return cached.token;
    if (pending) return pending;
    pending = (async () => {
      const accessToken = await boundedFetch(fetchImpl, METADATA_TOKEN_URL, { headers: { 'Metadata-Flavor': 'Google' } }, timeoutMs, async response => {
        if (response.status !== 200 || response.headers.get('metadata-flavor') !== 'Google') throw Error('metadata_token_failed');
        const body = await response.json();
        if (typeof body.access_token !== 'string' || !body.access_token || body.access_token.length > 20000) throw Error('metadata_token_failed');
        return body.access_token;
      });
      const issued = Math.floor(now() / 1000), expires = issued + JWT_SECONDS;
      const payload = { iss: serviceAccount, sub: serviceAccount, aud: audience, iat: issued, exp: expires };
      const token = await boundedFetch(fetchImpl, `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:signJwt`, {
        method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ payload: JSON.stringify(payload) }),
      }, timeoutMs, async response => {
        if (response.status !== 200) throw Error('iap_signing_failed');
        const body = await response.json();
        if (typeof body.signedJwt !== 'string' || !body.signedJwt || body.signedJwt.length > 20000) throw Error('iap_signing_failed');
        return body.signedJwt;
      });
      cached = { token, until: expires * 1000 }; return token;
    })();
    try { return await pending; }
    finally { pending = null; }
  };
}

function revisionOf(search) {
  const values = search.getAll('revision');
  if ([...search.keys()].some(key => key !== 'revision') || values.length > 1) throw Error('invalid_revision');
  const value = values[0] ?? '-1';
  if (!/^(?:-1|\d+)$/.test(value)) throw Error('invalid_revision');
  const revision = Number(value);
  if (!Number.isSafeInteger(revision)) throw Error('invalid_revision');
  return revision;
}
function publicEnvelope(body) {
  if (!body || !Number.isSafeInteger(body.revision) || body.revision < 0 || !Number.isFinite(body.serverNow) || !body.view || typeof body.view !== 'object' || Array.isArray(body.view)) throw Error('invalid_upstream');
  const audio = body.audio;
  if (!audio || typeof audio.muted !== 'boolean' || typeof audio.music !== 'boolean' || !Number.isFinite(audio.volume) || audio.volume < 0 || audio.volume > 1) throw Error('invalid_upstream');
  return { revision: body.revision, serverNow: body.serverNow, view: body.view, audio: { muted: audio.muted, music: audio.music, volume: audio.volume } };
}

export function createScreenServer({ upstream, serviceAccount, screenKey, staticDir, fetchImpl = globalThis.fetch, now = Date.now, signer, timeoutMs = 7000, logger = console } = {}) {
  const origin = httpsOrigin(upstream);
  validateAccount(serviceAccount);
  if (typeof screenKey !== 'string' || screenKey.length < 24 || screenKey.length > 512 || !staticDir) throw Error('스크린 전용 키와 정적 화면 경로가 필요합니다.');
  const endpoint = `${origin}/api/screen/state`;
  const sign = signer ?? createIapSigner({ serviceAccount, audience: endpoint, fetchImpl, now, timeoutMs });
  const validKey = value => {
    if (typeof value !== 'string' || value.length > 512) return false;
    const actual = Buffer.from(value), expected = Buffer.from(screenKey);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  };
  const send = (response, status, body) => {
    response.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
  };
  const server = http.createServer(async (request, response) => {
    // Compare the raw path before URL parsing can normalize traversal or // paths.
    const rawPath = (request.url || '').split('?')[0];
    const method = request.method;
    try {
      if (method === 'GET' && rawPath === '/api/health') return send(response, 200, { ok: true, mode: 'screen-relay' });
      if (method === 'GET' && rawPath === '/api/screen/state') {
        if (!validKey(request.headers['x-screen-key'])) return send(response, 401, { error: '스크린 연결 키가 필요합니다.' });
        let revision;
        try { revision = revisionOf(new URL(request.url, 'http://screen.invalid').searchParams); }
        catch { return send(response, 400, { error: '상태 버전이 올바르지 않습니다.' }); }
        const token = await sign();
        const result = await boundedFetch(fetchImpl, `${endpoint}?revision=${revision}`, {
          headers: { Authorization: `Bearer ${token}`, 'X-Screen-Key': screenKey, Accept: 'application/json' },
        }, timeoutMs, async upstreamResponse => {
          if (upstreamResponse.status === 304) return null;
          if (upstreamResponse.status !== 200) throw Error('upstream_unavailable');
          return publicEnvelope(await upstreamResponse.json());
        });
        return send(response, result ? 200 : 304, result ?? undefined);
      }
      if (['GET', 'HEAD'].includes(method) && assets.has(rawPath)) {
        const name = assets.get(rawPath), body = await readFile(join(staticDir, name));
        const contentType = name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8';
        response.writeHead(200, { ...headers, 'Content-Type': contentType, 'Content-Length': body.length });
        return response.end(method === 'HEAD' ? undefined : body);
      }
      return send(response, 404, { error: '페이지를 찾지 못했습니다.' });
    } catch (error) {
      logger.error?.(`스크린 연결 실패: ${error.name || 'Error'}`);
      if (!response.headersSent) send(response, 503, { error: '스크린 연결을 확인하지 못했습니다. 잠시 후 다시 시도합니다.' });
      else response.end();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  server.closeGracefully = () => new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return server;
}

export function createFromEnv(env = process.env) {
  const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
  const server = createScreenServer({ upstream: env.MANUAL_SCREEN_UPSTREAM, serviceAccount: env.MANUAL_SCREEN_SERVICE_ACCOUNT, screenKey: env.MANUAL_SCREEN_KEY, staticDir: resolve(env.MANUAL_WEB_DIST || join(root, 'dist/cloud')) });
  return { server, port: Number(env.PORT || 4186) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { server, port } = createFromEnv();
    server.listen(port, '0.0.0.0', () => console.log(`프로젝션 전용 서버:${port}`));
    let closing = false;
    const stop = () => { if (closing) return; closing = true; server.closeGracefully().then(() => process.exit(0), () => process.exit(1)); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
