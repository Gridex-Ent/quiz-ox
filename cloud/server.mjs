import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ManualError, ManualService } from './manual-service.mjs';
import { createGcsStore, createLocalStore } from './store.mjs';

const COOKIE = 'ox_manual_session';
const equal = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const integer = (value, fallback = -1) => { if (value === null) return fallback; const n = Number(value); if (!Number.isSafeInteger(n) || n < -1) throw new ManualError('상태 버전이 올바르지 않습니다.'); return n; };
const mime = path => path.endsWith('.js') ? 'text/javascript; charset=utf-8' : path.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8';
const screenOrigin = value => {
  if (value === undefined) return null;
  let url;
  try { url = new URL(value); } catch { throw Error('PUBLIC_SCREEN_URL은 HTTPS origin이어야 합니다.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('PUBLIC_SCREEN_URL에는 HTTPS origin만 설정해 주세요.');
  return url.origin;
};

async function readJson(request, limit) {
  if (!(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) throw new ManualError('JSON 요청이 필요합니다.', 415);
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) throw new ManualError('요청 크기가 너무 큽니다.', 413);
  let length = 0; const parts = [];
  for await (const part of request) { length += part.length; if (length > limit) throw new ManualError('요청 크기가 너무 큽니다.', 413); parts.push(part); }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); }
  catch { throw new ManualError('JSON 형식을 확인해 주세요.'); }
}

export function createManualServer({ service, hostPin, staticDir, secureCookies = false, sessionTtlMs = 12 * 60 * 60 * 1000, now = Date.now, publicOrigin, publicScreenUrl, tickIntervalMs = 100, logger = console } = {}) {
  if (!service || typeof hostPin !== 'string' || hostPin.length < 6 || !staticDir) throw Error('수동 서비스·6자 이상 관리자 PIN·정적 화면 경로가 필요합니다.');
  const publicScreenOrigin = screenOrigin(publicScreenUrl);
  const screenEnvelope = value => value && publicScreenOrigin ? { ...value, screenPath: `${publicScreenOrigin}${value.screenPath}` } : value;
  const sessions = new Map(), attempts = new Map();
  const headerBase = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cross-Origin-Resource-Policy': 'same-origin' };
  const send = (response, status, value, extra = {}) => {
    const body = value === undefined ? '' : typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value);
    response.writeHead(status, { ...headerBase, 'Content-Type': typeof value === 'object' && !Buffer.isBuffer(value) ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8', ...extra }); response.end(body);
  };
  const cookieToken = request => {
    const entry = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`));
    return entry?.slice(COOKIE.length + 1) ?? '';
  };
  const authenticated = request => {
    const token = cookieToken(request), until = sessions.get(token);
    if (!until || until <= now()) { sessions.delete(token); return false; }
    return true;
  };
  const auth = request => { if (!authenticated(request)) throw new ManualError('진행자 로그인이 필요합니다.', 401, 'login_required'); };
  const cookie = (token, seconds) => `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secureCookies ? '; Secure' : ''}`;
  const allowedOrigin = request => {
    const origin = request.headers.origin;
    if (!origin) return;
    let valid = false;
    try { valid = publicOrigin ? origin === new URL(publicOrigin).origin : new URL(origin).host === request.headers.host && ['http:', 'https:'].includes(new URL(origin).protocol); } catch { /* deny malformed origins */ }
    if (!valid) throw new ManualError('다른 출처의 제어 요청은 허용되지 않습니다.', 403, 'origin_rejected');
  };
  const serve = async (request, response, name) => {
    const body = await readFile(join(staticDir, name));
    response.writeHead(200, { ...headerBase, 'Content-Type': mime(name), 'Content-Length': body.length }); response.end(request.method === 'HEAD' ? undefined : body);
  };
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost'), path = url.pathname, method = request.method;
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) allowedOrigin(request);
      if (path.startsWith('/api/admin/')) auth(request);
      if (path === '/api/health' && method === 'GET') { const health = service.health(); return send(response, health.ok ? 200 : 503, health); }
      if (path === '/api/login' && method === 'POST') {
        const ip = request.socket.remoteAddress || 'unknown', current = attempts.get(ip);
        if (current && current.resetAt > now() && current.count >= 5) throw new ManualError('로그인 실패가 반복되었습니다.10분 뒤 다시 시도해 주세요.', 429, 'rate_limited');
        const body = await readJson(request, 4096);
        if (typeof body?.pin !== 'string' || !equal(body.pin, hostPin)) {
          const record = !current || current.resetAt <= now() ? { count: 0, resetAt: now() + 10 * 60 * 1000 } : current;
          record.count++; attempts.set(ip, record); throw new ManualError('PIN을 확인해 주세요.', 401, 'invalid_pin');
        }
        attempts.delete(ip);
        for (const [token, expires] of sessions) if (expires <= now()) sessions.delete(token);
        if (sessions.size >= 256) throw new ManualError('관리자 접속 수가 많습니다. 잠시 후 다시 시도해 주세요.', 429);
        const token = randomBytes(32).toString('base64url'); sessions.set(token, now() + sessionTtlMs);
        return send(response, 200, { ok: true, presenterPath: '/presenter' }, { 'Set-Cookie': cookie(token, Math.floor(sessionTtlMs / 1000)) });
      }
      if (path === '/api/logout' && method === 'POST') { auth(request); sessions.delete(cookieToken(request)); return send(response, 200, { ok: true }, { 'Set-Cookie': cookie('', 0) }); }
      if (path === '/api/admin/state' && method === 'GET') {
        const state = await service.adminState({ revision: integer(url.searchParams.get('revision')), bank: integer(url.searchParams.get('bank')), prize: integer(url.searchParams.get('prize')) });
        return send(response, state ? 200 : 304, screenEnvelope(state) ?? undefined);
      }
      if (path === '/api/admin/action' && method === 'POST') return send(response, 200, screenEnvelope(await service.action(await readJson(request, 6 * 1024 * 1024))));
      if (path === '/api/admin/recipients' && method === 'GET') return send(response, 200, await service.recipients());
      if (path === '/api/admin/recipients' && method === 'PUT') return send(response, 200, await service.saveRecipients(await readJson(request, 100000)));
      if (path === '/api/screen/state' && method === 'GET') {
        if (!service.verifyScreenKey(request.headers['x-screen-key'])) throw new ManualError('스크린 연결 키가 필요합니다.', 401, 'invalid_screen_key');
        const state = await service.screenState({ revision: integer(url.searchParams.get('revision')) });
        if (!service.verifyScreenKey(request.headers['x-screen-key'])) throw new ManualError('스크린 연결 키가 변경되었습니다.', 401, 'invalid_screen_key');
        return send(response, state ? 200 : 304, state ?? undefined);
      }
      if (['GET', 'HEAD'].includes(method)) {
        if (path === '/') { if (authenticated(request)) return send(response, 302, undefined, { Location: '/presenter' }); return await serve(request, response, 'login.html'); }
        if (path === '/presenter' || path === '/host.html') { if (!authenticated(request)) return send(response, 302, undefined, { Location: '/' }); return await serve(request, response, 'host.html'); }
        if (['/host.js', '/seed.json', '/asset-updates.json'].includes(path)) { auth(request); return await serve(request, response, path.slice(1)); }
        if (path === '/screen') return await serve(request, response, 'screen.html');
        if (['/screen.js', '/prize-data.json'].includes(path)) return await serve(request, response, path.slice(1));
      }
      return send(response, 404, { message: '페이지를 찾지 못했습니다.' });
    } catch (error) {
      const statusCode = error.statusCode || (error.code === 'ENOENT' ? 404 : 500);
      if (statusCode >= 500) logger.error?.(`수동 퀴즈 요청 실패: ${error.code || error.name || 'unknown'}`);
      const message = statusCode === 500 ? '요청을 처리하지 못했습니다.' : statusCode === 404 ? '페이지를 찾지 못했습니다.' : error.message;
      if (!response.headersSent) send(response, statusCode, { error: message, message, code: error.code || 'request_failed' });
      else response.end();
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  let timer = null, tickInFlight = false;
  const tick = async () => {
    if (tickInFlight) return;
    tickInFlight = true;
    try { await service.tick(); }
    catch (error) { logger.error?.(`진행 타이머 저장 실패: ${error.code || error.name}`); }
    finally { tickInFlight = false; }
  };
  if (tickIntervalMs > 0) { timer = setInterval(() => { void tick(); }, tickIntervalMs); timer.unref(); }
  server.on('close', () => { if (timer) clearInterval(timer); sessions.clear(); });
  server.closeGracefully = async () => { if (timer) clearInterval(timer); await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose())); await service.close(); };
  return server;
}

export async function createFromEnv(env = process.env) {
  const root = resolve(fileURLToPath(new URL('../', import.meta.url))), staticDir = resolve(env.MANUAL_WEB_DIST || join(root, 'dist/cloud'));
  const production = env.NODE_ENV === 'production';
  if (production && !env.MANUAL_GCS_BUCKET) throw Error('프로덕션 클라우드는 MANUAL_GCS_BUCKET 영속 저장이 필수입니다.');
  const hostPin = env.MANUAL_HOST_PIN;
  if (!hostPin || hostPin.length < 6) throw Error('MANUAL_HOST_PIN은6자 이상으로 설정해 주세요.');
  const publicScreenUrl = screenOrigin(env.PUBLIC_SCREEN_URL);
  const seed = JSON.parse(await readFile(join(staticDir, 'seed.json'), 'utf8'));
  const store = env.MANUAL_GCS_BUCKET ? await createGcsStore({ bucket: env.MANUAL_GCS_BUCKET, objectName: env.MANUAL_GCS_OBJECT || 'manual/state-v1.json' }) : createLocalStore(env.MANUAL_STATE_PATH || join(root, 'data/manual-cloud/state.json'));
  const service = await ManualService.create({ store, seed, screenKey: env.MANUAL_SCREEN_KEY });
  const server = createManualServer({ service, hostPin, staticDir, secureCookies: production, publicOrigin: env.PUBLIC_URL, publicScreenUrl: publicScreenUrl ?? undefined });
  return { server, service, store, port: Number(env.PORT || 4185) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createFromEnv().then(({ server, port }) => {
    server.listen(port, '0.0.0.0', () => console.log(`수동 퀴즈 클라우드 서버:${port}`));
    let closing = false;
    const stop = () => { if (closing) return; closing = true; server.closeGracefully().then(() => process.exit(0), () => process.exit(1)); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
