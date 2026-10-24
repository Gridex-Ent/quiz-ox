import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createScreenServer, createFromEnv } from '../cloud/screen-server.mjs';
import { ManualService } from '../cloud/manual-service.mjs';

const account = 'ox-manual-screen@screen-test.iam.gserviceaccount.com';
const origin = 'https://protected.example';
const key = 'test-screen-key-12345678901234567890';
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { resolve, promise }; };

async function fixture(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'ox-screen-relay-'));
  await Promise.all(Object.entries({ 'screen.html': '<h1>PUBLIC-SCREEN</h1>', 'screen.js': '/* PUBLIC-RENDERER */', 'prize-data.json': '{"imageAlt":"상품"}' }).map(([name, body]) => writeFile(join(dir, name), body)));
  let durable = null, generation = 0;
  const clock = { now: 1000000 };
  const store = { kind: 'test', async load() { return null; }, async save(value) { durable = structuredClone(value); return { generation: String(++generation) }; } };
  const service = await ManualService.create({ store, now: () => clock.now, screenKey: key, seed: [
    { text: '현재 문제', answer: 'O', explanation: '공개 후 해설', seconds: 10, imageData: 'data:image/png;base64,YQ==', imageReveal: 'answer', note: 'PRIVATE-NOTE' },
    { text: 'PRIVATE-FUTURE-QUESTION', answer: 'X', explanation: 'PRIVATE-FUTURE-ANSWER', seconds: 5 },
  ] });
  const calls = [], payloads = [], signReceived = deferred();
  const controls = { upstreamStatus: 200, extra: {}, hang: false, signGate: null };
  const mock = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    calls.push({ path: request.url, method: request.method, headers: request.headers, body });
    const reply = (status, value, extra = {}) => { response.writeHead(status, { 'Content-Type': 'application/json', ...extra }); response.end(JSON.stringify(value)); };
    if (request.url === '/metadata') return reply(200, { access_token: 'local-test-oauth-token', expires_in: 3600 }, { 'Metadata-Flavor': 'Google' });
    if (request.url.startsWith('/sign')) {
      payloads.push(JSON.parse(JSON.parse(body).payload)); signReceived.resolve();
      if (controls.signGate) await controls.signGate.promise;
      return reply(200, { signedJwt: 'local-test-signed-jwt' });
    }
    if (request.url.startsWith('/upstream/api/screen/state?')) {
      if (controls.hang) return;
      if (controls.upstreamStatus !== 200) return reply(controls.upstreamStatus, { error: 'PRIVATE-UPSTREAM-DETAIL' }, { Location: 'https://accounts.example/PRIVATE-LOGIN' });
      const revision = Number(new URL(request.url, 'http://mock').searchParams.get('revision'));
      const value = await service.screenState({ revision });
      if (value === null) { response.writeHead(304); return response.end(); }
      return reply(200, { ...value, ...controls.extra });
    }
    reply(404, { error: 'unexpected mock route' });
  });
  await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve));
  const mockOrigin = `http://127.0.0.1:${mock.address().port}`;
  const destinations = [];
  const fetchImpl = (target, init) => {
    destinations.push(String(target));
    const url = new URL(target);
    let path;
    if (url.hostname === 'metadata.google.internal') path = '/metadata';
    else if (url.hostname === 'iamcredentials.googleapis.com') path = '/sign' + url.pathname;
    else if (url.origin === origin) path = '/upstream' + url.pathname + url.search;
    else throw Error('unexpected outbound destination');
    return fetch(mockOrigin + path, init);
  };
  const logs = [];
  const relay = createScreenServer({ upstream: origin, serviceAccount: account, screenKey: key, staticDir: dir, fetchImpl, now: () => clock.now, logger: { error: value => logs.push(value) }, ...options });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  const port = relay.address().port, base = `http://127.0.0.1:${port}`;
  let sequence = 0;
  return {
    relay, service, clock, calls, payloads, controls, logs, destinations, signReceived,
    durable: () => durable,
    request(path = '/api/screen/state?revision=-1', headers = { 'X-Screen-Key': key }) { return fetch(base + path, { headers, redirect: 'manual' }); },
    raw(path, method = 'GET') {
      return new Promise((resolve, reject) => {
        const request = http.request({ host: '127.0.0.1', port, path, method, headers: { 'X-Screen-Key': key } }, response => {
          let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve({ status: response.statusCode, body }));
        });
        request.on('error', reject); request.end();
      });
    },
    async act(action) { const snapshot = await service.adminState(); return service.action({ commandId: `screen-test-${++sequence}`, revision: snapshot.revision, action }); },
    async close() {
      controls.signGate?.resolve();
      await relay.closeGracefully(); mock.closeAllConnections();
      await new Promise(resolve => mock.close(resolve)); await rm(dir, { recursive: true, force: true });
    },
  };
}

test('screen relay signs its own IAP JWT and forwards only the fixed screen request', async () => {
  const f = await fixture();
  try {
    f.controls.extra = { bank: ['PRIVATE-BANK'], recipients: ['PRIVATE-RECIPIENTS'], screenPath: '/PRIVATE-KEY', arbitrary: true };
    const response = await f.request('/api/screen/state?revision=0002', { 'X-Screen-Key': key, Cookie: 'admin=client-cookie', Authorization: 'Bearer client-token', 'X-Forwarded-Host': 'attacker.example' });
    assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json(); assert.deepEqual(Object.keys(body).sort(), ['audio', 'revision', 'serverNow', 'view']);
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE-|client-token|client-cookie|local-test-/);
    assert.equal(f.payloads.length, 1);
    const payload = f.payloads[0];
    assert.equal(payload.iss, account); assert.equal(payload.sub, account); assert.equal(payload.aud, `${origin}/api/screen/state`);
    assert.equal(payload.iat, Math.floor(f.clock.now / 1000)); assert.equal(payload.exp - payload.iat, 1200);
    const metadata = f.calls.find(call => call.path === '/metadata'); assert.equal(metadata.headers['metadata-flavor'], 'Google');
    const signing = f.calls.find(call => call.path.startsWith('/sign')); assert.equal(signing.headers.authorization, 'Bearer local-test-oauth-token'); assert.equal(signing.method, 'POST');
    const upstream = f.calls.find(call => call.path.startsWith('/upstream'));
    assert.equal(upstream.path, '/upstream/api/screen/state?revision=2');
    assert.equal(upstream.headers.authorization, 'Bearer local-test-signed-jwt'); assert.equal(upstream.headers['x-screen-key'], key);
    assert.equal(upstream.headers.cookie, undefined); assert.equal(upstream.headers['x-forwarded-host'], undefined);
  } finally { await f.close(); }
});

test('concurrent screen requests share one JWT signing operation and renew near expiry', async () => {
  const f = await fixture();
  try {
    f.controls.signGate = deferred();
    const responses = Array.from({ length: 5 }, () => f.request());
    await f.signReceived.promise;
    assert.equal(f.calls.filter(call => call.path === '/metadata').length, 1); assert.equal(f.payloads.length, 1);
    f.controls.signGate.resolve();
    assert.ok((await Promise.all(responses)).every(response => response.status === 200));
    f.clock.now += 18 * 60 * 1000; await f.request(); assert.equal(f.payloads.length, 1);
    f.clock.now += 2 * 60 * 1000; await f.request(); assert.equal(f.payloads.length, 2);
    assert.equal(f.calls.filter(call => call.path === '/metadata').length, 2);
  } finally { await f.close(); }
});

test('public relay preserves authoritative topic countdown blank audio and answer disclosure', async () => {
  const f = await fixture();
  try {
    await f.act({ type: 'show' });
    let body = await (await f.request()).json();
    assert.equal(body.view.phase, 'topic'); assert.doesNotMatch(JSON.stringify(body), /현재 문제|imageData|PRIVATE-|공개 후 해설/);
    f.clock.now += 2000; body = await (await f.request(`/api/screen/state?revision=${body.revision}`)).json();
    assert.equal(body.view.phase, 'question'); assert.equal(body.view.deadline - body.serverNow, 10000);
    assert.equal(body.view.question.imageData, undefined); assert.equal(body.view.question.answer, undefined);
    assert.equal(f.durable().state.phase, 'question', 'the private authority persists the transition');
    const unchanged = await f.request(`/api/screen/state?revision=${body.revision}`); assert.equal(unchanged.status, 304); assert.equal(await unchanged.text(), '');
    await f.act({ type: 'blank' }); await f.act({ type: 'audio', muted: true, volume: 0.2 });
    body = await (await f.request()).json(); assert.equal(body.view.blank, true); assert.equal(body.view.question, undefined); assert.equal(body.audio.muted, true); assert.equal(body.audio.volume, 0.2);
    await f.act({ type: 'blank' }); await f.act({ type: 'reveal' });
    body = await (await f.request()).json(); assert.equal(body.view.phase, 'answer'); assert.equal(body.view.question.answer, 'O'); assert.equal(body.view.question.imageData, 'data:image/png;base64,YQ==');
    assert.doesNotMatch(JSON.stringify(body), /PRIVATE-|mainState|questions|recipients/);
  } finally { await f.close(); }
});

test('screen relay exposes only public assets health and exact read-only routes', async () => {
  const f = await fixture();
  try {
    for (const path of ['/', '/screen', '/screen.js', '/prize-data.json']) {
      const response = await f.request(path, {}); assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /PRIVATE-/);
      const head = await f.raw(path, 'HEAD'); assert.equal(head.status, 200); assert.equal(head.body, '');
    }
    assert.deepEqual(await (await f.request('/api/health', {})).json(), { ok: true, mode: 'screen-relay' });
    for (const path of ['/presenter', '/host.html', '/seed.json', '/asset-updates.json', '/api/admin/state', '/api/admin/recipients', '/screen.js.map', '/screen/', '/%73creen', '//screen', '/../screen', '/api/../api/screen/state']) assert.equal((await f.raw(path)).status, 404, path);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await f.raw('/api/screen/state', method)).status, 404);
    assert.equal((await f.raw('/api/screen/state', 'HEAD')).status, 404);
    assert.equal(f.destinations.length, 0);
  } finally { await f.close(); }
});

test('invalid keys and invalid revision queries never reach IAP or the private server', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/api/screen/state', {})).status, 401);
    assert.equal((await f.request('/api/screen/state', { 'X-Screen-Key': 'wrong-key' })).status, 401);
    for (const query of ['revision=-2', 'revision=1.5', 'revision=Infinity', 'revision=', 'revision=9007199254740992', 'revision=1&revision=2', 'revision=1&target=https://attacker.example']) assert.equal((await f.request('/api/screen/state?' + query)).status, 400, query);
    assert.equal(f.destinations.length, 0);
  } finally { await f.close(); }
});

test('IAP redirects authorization errors and private errors become a generic retryable503', async () => {
  const f = await fixture();
  try {
    for (const code of [302, 401, 403, 500]) {
      f.controls.upstreamStatus = code;
      const response = await f.request(); assert.equal(response.status, 503); assert.equal(response.headers.get('location'), null);
      assert.doesNotMatch(await response.text(), /PRIVATE-|accounts\.example|local-test-|protected\.example/);
    }
    assert.ok(f.logs.every(line => !/PRIVATE-|local-test-|protected\.example/.test(line)));
    assert.equal(f.calls.filter(call => call.path.startsWith('/upstream')).length, 4, 'redirects cannot be followed');
  } finally { await f.close(); }
});

test('a stalled upstream is aborted and reports503 without exposing authentication data', async () => {
  const f = await fixture({ timeoutMs: 100, signer: async () => 'local-test-signed-jwt' });
  try {
    f.controls.hang = true;
    const response = await f.request(); assert.equal(response.status, 503); assert.doesNotMatch(await response.text(), /local-test|PRIVATE-/);
    assert.equal(f.calls.filter(call => call.path.startsWith('/upstream')).length, 1);
  } finally { await f.close(); }
});

test('screen startup rejects non-origin upstream URLs and never requires a host PIN or storage', () => {
  for (const upstream of ['http://protected.example', 'https://user:pass@protected.example', 'https://protected.example/screen', 'https://protected.example?next=x', 'https://protected.example#x']) assert.throws(() => createScreenServer({ upstream, serviceAccount: account, screenKey: key, staticDir: '.' }), /HTTPS origin/);
  assert.throws(() => createFromEnv({}), /UPSTREAM/);
  assert.throws(() => createFromEnv({ MANUAL_SCREEN_UPSTREAM: origin, MANUAL_SCREEN_SERVICE_ACCOUNT: account }), /스크린 전용 키/);
});
