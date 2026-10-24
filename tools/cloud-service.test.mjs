import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ManualService, validateRecipientRecords } from '../cloud/manual-service.mjs';
import { StoreConflictError, createLocalStore, createGcsStore } from '../cloud/store.mjs';
import { createManualServer, createFromEnv } from '../cloud/server.mjs';

const seed = Array.from({ length: 8 }, (_, index) => ({
  text: index ? `UNREVEALED-FUTURE-${index}` : '현재 문제', answer: index % 2 ? 'X' : 'O', choiceO: '첫 보기', choiceX: '둘째 보기', seconds: 5,
  explanation: `SECRET-EXPLANATION-${index}`, category: '전기', topic: '기존 세부 주제', note: 'SECRET-PRESENTER-NOTE',
  ...(index === 0 ? { imageData: 'data:image/png;base64,YQ==', imageSource: 'https://example.test/SECRET-IMAGE-SOURCE', imageAlt: 'SECRET-ALT', imageReveal: 'answer', imageCredit: 'SECRET-CREDIT' } : {}),
}));
const screenKey = 'test-screen-key-12345678901234567890';

function memoryStore(value = null) {
  let version = value ? 1 : 0;
  return {
    kind: 'test', value: value ? structuredClone(value) : null, failure: null,
    async load() { return this.value ? { value: structuredClone(this.value), generation: String(version) } : null; },
    async save(next, expected) {
      if (this.failure) throw this.failure;
      if ((this.value ? String(version) : null) !== expected) throw new StoreConflictError();
      this.value = structuredClone(next); version++;
      return { generation: String(version) };
    },
  };
}

async function fixture({ questions = seed, store = memoryStore(), clock = { now: 1000 } } = {}) {
  const service = await ManualService.create({ seed: questions, store, now: () => clock.now, screenKey });
  let command = 0;
  return {
    service, store, clock,
    state: options => service.adminState(options),
    async act(action, extra = {}) {
      const current = await service.adminState();
      return service.action({ commandId: `command_${++command}`, revision: current.revision, action, ...extra });
    },
    async public() { return service.screenState(); },
  };
}

test('new durable service preserves complete seed metadata and starts with a separate empty recipient book', async () => {
  const f = await fixture(), state = await f.state();
  assert.equal(state.state.phase, 'cover'); assert.equal(state.bank.length, 8);
  assert.equal(state.bank[0].imageData, seed[0].imageData); assert.equal(state.bank[0].note, seed[0].note);
  assert.equal(state.screenPath, `/screen#key=${screenKey}`);
  const recipients = await f.service.recipients(); assert.equal(recipients.records.length, 28);
  assert.ok(recipients.records.every(row => row.name === '' && row.phone === ''));
  assert.equal(f.store.value.revision, state.revision);
});

test('server alone advances two-second topics and gives every normal question ten seconds', async () => {
  const f = await fixture();
  await f.act({ type: 'show' }); let view = (await f.public()).view;
  assert.equal(view.phase, 'topic'); assert.equal(view.category, '워밍업'); assert.equal(view.question, undefined);
  f.clock.now += 1999; assert.equal((await f.state()).state.phase, 'topic');
  f.clock.now++; let state = await f.state(); assert.equal(state.state.phase, 'question'); assert.equal(state.state.deadline - state.serverNow, 10000);
  f.clock.now += 10000; state = await f.state(); assert.equal(state.state.remaining, 0); assert.equal(state.state.phase, 'question');
  await f.act({ type: 'select', index: 5 }); await f.act({ type: 'show' }); f.clock.now += 2000;
  state = await f.state(); assert.equal(state.state.deadline - state.serverNow, 10000);
});

test('public projection never receives the bank topic text private metadata or answer-only photo before reveal', async () => {
  const f = await fixture(); await f.act({ type: 'show' });
  let body = JSON.stringify(await f.public()); assert.doesNotMatch(body, /현재 문제|SECRET-|UNREVEALED|mainState|questions/);
  f.clock.now += 2000; let view = (await f.public()).view;
  assert.equal(view.question.text, '현재 문제'); assert.equal(view.question.answer, undefined); assert.equal(view.question.imageData, undefined);
  body = JSON.stringify(view); assert.doesNotMatch(body, /SECRET-|UNREVEALED|explanation|openAnswer|imageSource/);
  await f.act({ type: 'reveal' }); view = (await f.public()).view;
  assert.equal(view.question.answer, 'O'); assert.equal(view.question.imageData, seed[0].imageData);
  assert.equal(view.question.explanation, seed[0].explanation); assert.equal(view.question.note, undefined);
});

test('manual singing question stays untimed and does not leak its answer when the phone is idle', async () => {
  const f = await fixture({ questions: [{ ...seed[0], timerMode: 'manual' }, seed[1]] });
  await f.act({ type: 'show' }); f.clock.now += 2000; const state = await f.state();
  assert.equal(state.state.phase, 'question'); assert.equal(state.state.deadline, null);
  f.clock.now += 100000; assert.equal((await f.state()).state.phase, 'question');
  assert.equal((await f.public()).view.question.answer, undefined);
});

test('bonus question retains the real main bank and restores its exact index phase and paused time', async () => {
  const f = await fixture(); await f.act({ type: 'select', index: 5 }); await f.act({ type: 'show' }); f.clock.now += 2000; await f.state();
  f.clock.now += 1000; const state = await f.act({ type: 'interlude', question: { ...seed[1], kind: 'open', text: '번외 문제', openAnswer: 'SECRET-BONUS-ANSWER' } });
  assert.equal(state.bank, undefined); assert.equal(state.state.bonusQuestion.openAnswer, 'SECRET-BONUS-ANSWER'); assert.equal(state.state.bonusQuestion.seconds, 10);
  assert.equal((await f.state()).bank.length, 8);
  assert.equal(state.state.mainState.index, 5); assert.equal(state.state.mainState.questions, undefined);
  f.clock.now += 2000; const bonus = await f.state(); assert.equal(bonus.state.deadline - bonus.serverNow, 10000); assert.doesNotMatch(JSON.stringify(await f.public()), /SECRET-BONUS-ANSWER|mainState|UNREVEALED/);
  await f.act({ type: 'reveal' }); assert.equal((await f.public()).view.question.openAnswer, 'SECRET-BONUS-ANSWER');
  const returned = await f.act({ type: 'next' }); assert.equal(returned.state.mode, 'main'); assert.equal(returned.state.index, 5); assert.equal(returned.state.remaining, 9); assert.equal(returned.state.deadline, null);
});

test('bank version changes only on apply and admin polling omits unchanged photo banks', async () => {
  const f = await fixture(), first = await f.state();
  assert.equal(await f.state({ revision: first.revision, bank: first.bankVersion, prize: first.prizeVersion }), null);
  const ready = await f.act({ type: 'ready' }); assert.equal(ready.bankVersion, first.bankVersion); assert.equal(ready.bank, undefined);
  const changed = await f.state({ revision: first.revision, bank: first.bankVersion }); assert.equal(changed.bank, undefined);
  const saved = await f.act({ type: 'apply', questions: [...seed].reverse() });
  assert.equal(saved.bankVersion, first.bankVersion + 1); assert.equal(saved.bank[0].text, seed.at(-1).text);
  assert.equal(saved.bank.at(-1).imageData, seed[0].imageData); assert.equal(saved.state.index, 0);
});

test('stale commands are rejected and persistent command IDs prevent replay after lost acknowledgements and restart', async () => {
  const f = await fixture(); const command = { commandId: 'stable-command-1', revision: 0, action: { type: 'show' } };
  const first = await f.service.action(command), replay = await f.service.action(command); assert.equal(replay.revision, first.revision);
  await assert.rejects(f.service.action({ ...command, commandId: 'other-command', revision: 0 }), error => error.statusCode === 409);
  await assert.rejects(f.service.action({ ...command, action: { type: 'end' } }), error => error.code === 'duplicate_mismatch');
  const reopened = await ManualService.create({ seed, store: f.store, now: () => f.clock.now, screenKey });
  const restored = await reopened.action(command); assert.equal(restored.state.phase, 'topic'); assert.equal(restored.state.topicDeadline, null);
  assert.equal(f.store.value.commands.length, 1);
});

test('persistence failure never replaces the running state or records an acknowledged command', async () => {
  const f = await fixture(); f.store.failure = Error('injected disk failure');
  await assert.rejects(f.service.action({ commandId: 'failed-command', revision: 0, action: { type: 'show' } }), error => error.statusCode === 503);
  assert.equal(f.service.document.state.phase, 'cover'); assert.equal(f.store.value.revision, 0); assert.equal(f.store.value.commands.length, 0);
  assert.equal(f.service.health().ok, false); f.store.failure = null;
  const next = await f.service.action({ commandId: 'failed-command', revision: 0, action: { type: 'show' } }); assert.equal(next.revision, 1);
});

test('GCS-style CAS conflict reloads the latest durable state rather than overwriting another server', async () => {
  const store = memoryStore(), first = await fixture({ store }), second = await fixture({ store });
  await first.act({ type: 'prizes' });
  await assert.rejects(second.service.action({ commandId: 'second-command', revision: 0, action: { type: 'end' } }), error => error.code === 'storage_conflict');
  assert.equal((await second.state()).state.phase, 'prizes'); assert.equal(store.value.state.phase, 'prizes');
});

test('an uncertain upload acknowledgement is reconciled from durable state before returning a fresh snapshot', async () => {
  const store = memoryStore(), f = await fixture({ store });
  const save = store.save.bind(store); let loseAcknowledgement = true;
  store.save = async (...args) => { const result = await save(...args); if (loseAcknowledgement) { loseAcknowledgement = false; throw Error('acknowledgement lost after commit'); } return result; };
  const command = { commandId: 'uncertain-command', revision: 0, action: { type: 'prizes' } };
  await assert.rejects(f.service.action(command), error => error.statusCode === 503);
  assert.equal(f.service.document.state.phase, 'cover');
  const recovered = await f.state(); assert.equal(recovered.state.phase, 'prizes'); assert.equal(recovered.revision, 1);
  const repeated = await f.service.action(command); assert.equal(repeated.revision, 1); assert.equal(store.value.commands.length, 1);
});

test('server restart pauses a live round and preserves the durable custom question bank and remaining deadline', async () => {
  const f = await fixture(); await f.act({ type: 'show' }); f.clock.now += 2000; await f.state(); f.clock.now += 3000;
  const reopened = await ManualService.create({ seed: [seed[1]], store: f.store, now: () => f.clock.now });
  const restored = await reopened.adminState(); assert.equal(restored.state.phase, 'question'); assert.equal(restored.state.deadline, null); assert.equal(restored.state.remaining, 7);
  assert.equal(restored.bank.length, 8); assert.equal(restored.bank[0].imageData, seed[0].imageData);
});

test('server restart keeps ten-second bonus metadata and pauses its remaining time without changing main', async () => {
  const f = await fixture(); await f.act({ type: 'select', index: 7 }); await f.act({ type: 'show' }); f.clock.now += 2000; await f.state();
  f.clock.now += 1000; await f.act({ type: 'interlude', question: { ...seed[0], text: '번외' } });
  f.clock.now += 2000; await f.state(); f.clock.now += 2000;
  const reopened = await ManualService.create({ seed: [seed[1]], store: f.store, now: () => f.clock.now, screenKey });
  const restored = await reopened.adminState();
  assert.equal(restored.state.mode, 'bonus'); assert.equal(restored.state.bonusQuestion.seconds, 10);
  assert.equal(restored.state.deadline, null); assert.equal(restored.state.remaining, 8);
  assert.equal(restored.state.mainState.index, 7); assert.equal(restored.state.mainState.remaining, 9);
  assert.equal(restored.bank.length, 8); assert.equal((await reopened.screenState()).view.question.answer, undefined);
});

test('recipient records preserve phone strings under an independent revision and are absent from game state', async () => {
  const f = await fixture(), recipients = await f.service.recipients();
  recipients.records[0].name = '검증용 가상수령자'; recipients.records[0].phone = '000-0000-0000';
  const saved = await f.service.saveRecipients(recipients); assert.equal(saved.revision, 1);
  assert.equal((await f.service.recipients()).records[0].phone, '000-0000-0000');
  assert.doesNotMatch(JSON.stringify(await f.state()), /검증용|000-0000/); assert.doesNotMatch(JSON.stringify(await f.public()), /검증용|000-0000/);
  await assert.rejects(f.service.saveRecipients(recipients), error => error.code === 'stale_recipients');
  const invalid = structuredClone(saved); invalid.records[1] = invalid.records[0];
  await assert.rejects(f.service.saveRecipients(invalid), error => error.statusCode === 400);
  assert.equal((await f.service.recipients()).revision, 1);
  assert.throws(() => validateRecipientRecords([]));
});

test('invalid commands and invalid question saves fail explicitly before touching durable state', async () => {
  const f = await fixture();
  for (const action of [{ type: 'tick' }, { type: 'apply', questions: [] }, { type: 'select', index: -1 }, { type: 'audio', volume: 2 }]) await assert.rejects(f.service.action({ commandId: 'invalid-command', revision: 0, action }), error => error.statusCode === 400);
  assert.equal(f.store.value.revision, 0);
  const audio = await f.act({ type: 'audio', muted: true }); assert.deepEqual(audio.audio, { muted: true, music: true, volume: 0.35 });
});

test('local store atomically saves JSON and detects stale generations without destroying the saved document', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ox-cloud-local-'));
  try {
    const store = createLocalStore(join(dir, 'state.json')); assert.equal(await store.load(), null);
    const first = await store.save({ value: '한국어' }, null); assert.deepEqual((await store.load()).value, { value: '한국어' });
    await assert.rejects(store.save({ value: 'overwrite' }, null), StoreConflictError);
    await store.save({ value: '두 번째' }, first.generation); assert.deepEqual(JSON.parse(await readFile(join(dir, 'state.json'), 'utf8')), { value: '두 번째' });
    await writeFile(join(dir, 'state.json'), '{malformed'); await assert.rejects(store.load());
    assert.equal(await readFile(join(dir, 'state.json'), 'utf8'), '{malformed');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

function fakeGcs() {
  let generation = 0, current = null; const versions = new Map();
  const backend = { failure: null, afterSave: null, options: [],
    bucket() { return { file(name, options = {}) { return {
      metadata: null,
      async getMetadata() { if (backend.failure) throw backend.failure; if (!current) throw Object.assign(Error('missing'), { code: 404 }); return [{ generation: String(generation) }]; },
      async download() { const value = options.generation ? versions.get(String(options.generation)) : current; if (!value) throw Object.assign(Error('missing'), { code: 404 }); return [Buffer.from(value)]; },
      async save(value, opts) { if (backend.failure) throw backend.failure; backend.options.push({ name, ...opts }); if (String(opts.preconditionOpts.ifGenerationMatch) !== String(current ? generation : 0)) throw Object.assign(Error('precondition'), { code: 412 }); current = value; generation++; versions.set(String(generation), current); this.metadata = { generation: String(generation) }; backend.afterSave?.(); },
    }; } }; },
    external(value) { current = JSON.stringify(value); generation++; versions.set(String(generation), current); },
  };
  return backend;
}

test('GCS store uses a separate object generation conditions and the generation of its own upload response', async () => {
  const storage = fakeGcs(), store = await createGcsStore({ bucket: 'test-bucket', storage }); assert.equal(await store.load(), null);
  const first = await store.save({ first: true }); assert.equal(first.generation, '1');
  assert.equal(storage.options[0].name, 'manual/state-v1.json'); assert.equal(storage.options[0].preconditionOpts.ifGenerationMatch, 0);
  storage.afterSave = () => storage.external({ other: true });
  const own = await store.save({ own: true }, '1'); assert.equal(own.generation, '2'); assert.equal((await store.load()).generation, '3');
  await assert.rejects(store.save({ stale: true }, '2'), StoreConflictError);
  storage.failure = Error('permission denied'); await assert.rejects(store.load(), /permission denied/); await assert.rejects(store.save({}, '3'), /permission denied/);
  await assert.rejects(createGcsStore({ bucket: 'test', objectName: 'ox.sqlite', storage }));
});

async function httpFixture(options = {}) {
  const f = await fixture(options), dir = await mkdtemp(join(tmpdir(), 'ox-cloud-http-'));
  await Promise.all(Object.entries({ 'login.html': '<h1>로그인</h1>', 'host.html': 'PRIVATE-HOST-DATA', 'screen.html': '<h1>공개 스크린</h1>', 'screen.js': '/* public screen */', 'seed.json': JSON.stringify(seed), 'asset-updates.json': '["PRIVATE-ASSET-DATA"]', 'prize-data.json': '{"imageAlt":"상품 소개"}' }).map(([name, content]) => writeFile(join(dir, name), content)));
  const logs = [];
  const server = createManualServer({ service: f.service, hostPin: 'test-pin-123', staticDir: dir, now: () => f.clock.now, tickIntervalMs: 0, logger: { error: message => logs.push(message) }, ...options.serverOptions });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { cookie, body, method = body ? 'POST' : 'GET', ...rest } = {}) => fetch(base + path, { method, redirect: 'manual', ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }), ...rest, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}), ...rest.headers } });
  const login = async () => { const response = await request('/api/login', { body: { pin: 'test-pin-123' } }); assert.equal(response.status, 200); return response.headers.get('set-cookie').split(';')[0]; };
  return { ...f, server, logs, request, login, base, async close() { await server.closeGracefully(); await rm(dir, { recursive: true, force: true }); } };
}

test('background timer skips overlapping slow ticks and resumes after success or failure', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const completions = [], logs = [];
  let active = 0, maximumActive = 0;
  const service = {
    tick() {
      active++; maximumActive = Math.max(maximumActive, active);
      return new Promise((resolve, reject) => completions.push({
        resolve() { active--; resolve(); },
        reject() { active--; reject(Error('delayed storage failure')); },
      }));
    },
    async close() {},
  };
  const server = createManualServer({ service, hostPin: 'test-pin', staticDir: '.', tickIntervalMs: 100, logger: { error: message => logs.push(message) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    t.mock.timers.tick(10000);
    assert.equal(completions.length, 1, 'slow persistence must not accumulate background jobs');
    completions[0].resolve(); await Promise.resolve();
    t.mock.timers.tick(10000);
    assert.equal(completions.length, 2);
    completions[1].reject(); await Promise.resolve();
    assert.equal(logs.length, 1);
    t.mock.timers.tick(100);
    assert.equal(completions.length, 3, 'a failed write must release the background guard');
    completions[2].resolve(); await Promise.resolve();
    assert.equal(maximumActive, 1);
  } finally { await server.closeGracefully(); }
});

test('HTTP protects presenter HTML all full-bank files and admin APIs while serving only explicit public assets', async () => {
  const f = await httpFixture();
  try {
    for (const path of ['/api/admin/state', '/api/admin/recipients', '/seed.json', '/asset-updates.json']) assert.equal((await f.request(path)).status, 401, path);
    const presenter = await f.request('/presenter'); assert.equal(presenter.status, 302); assert.equal(presenter.headers.get('location'), '/'); assert.doesNotMatch(await presenter.text(), /PRIVATE|SECRET/);
    for (const path of ['/', '/screen', '/screen.js', '/prize-data.json']) { const response = await f.request(path); assert.equal(response.status, 200); assert.doesNotMatch(await response.text(), /SECRET|PRIVATE|UNREVEALED/); }
    for (const path of ['/host.js.map', '/screen.js.map', '/questions/kiee-a-2026-offline.json', '/%73eed.json', '/unknown.html']) assert.notEqual((await f.request(path)).status, 200);
    const cookie = await f.login(); assert.match(await (await f.request('/presenter', { cookie })).text(), /PRIVATE-HOST-DATA/);
    assert.equal((await f.request('/seed.json', { cookie })).status, 200);
  } finally { await f.close(); }
});

test('HTTP login sets HttpOnly SameSite session and every privileged request rejects an expired or logged-out cookie', async () => {
  const f = await httpFixture({ serverOptions: { sessionTtlMs: 1000, secureCookies: true } });
  try {
    const response = await f.request('/api/login', { body: { pin: 'test-pin-123' } }), header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly/); assert.match(header, /SameSite=Strict/); assert.match(header, /Secure/);
    const cookie = header.split(';')[0]; assert.equal((await f.request('/api/admin/state', { cookie })).status, 200);
    f.clock.now += 1000; assert.equal((await f.request('/api/admin/state', { cookie })).status, 401);
    assert.equal((await f.request('/api/admin/action', { cookie, body: { commandId: 'expired-command', revision: 0, action: { type: 'end' } } })).status, 401);
    const nextCookie = await f.login(); assert.equal((await f.request('/api/logout', { cookie: nextCookie, body: {} })).status, 200);
    assert.equal((await f.request('/api/admin/recipients', { cookie: nextCookie })).status, 401);
  } finally { await f.close(); }
});

test('read-only screen keys cannot control the game and projection API withholds all unrevealed data', async () => {
  const f = await httpFixture();
  try {
    assert.equal((await f.request('/api/screen/state')).status, 401);
    assert.equal((await f.request('/api/admin/action', { headers: { 'X-Screen-Key': screenKey }, body: { commandId: 'screen-command', revision: 0, action: { type: 'show' } } })).status, 401);
    const cookie = await f.login(); await f.request('/api/admin/action', { cookie, body: { commandId: 'show-command', revision: 0, action: { type: 'show' } } });
    let response = await f.request('/api/screen/state', { headers: { 'X-Screen-Key': screenKey } }); let state = await response.json(); assert.equal(state.view.phase, 'topic'); assert.doesNotMatch(JSON.stringify(state), /SECRET|UNREVEALED|현재 문제|mainState|bank/);
    f.clock.now += 2000; response = await f.request('/api/screen/state', { headers: { 'X-Screen-Key': screenKey } }); state = await response.json(); assert.equal(state.view.question.text, '현재 문제'); assert.doesNotMatch(JSON.stringify(state), /SECRET|UNREVEALED|explanation|imageData/);
    assert.equal((await f.request(`/api/screen/state?revision=${state.revision}`, { headers: { 'X-Screen-Key': screenKey } })).status, 304);
  } finally { await f.close(); }
});

test('HTTP rejects foreign origins invalid JSON excessive payloads and unsupported content types', async () => {
  const f = await httpFixture();
  try {
    assert.equal((await f.request('/api/login', { headers: { Origin: 'https://other.test' }, body: { pin: 'test-pin-123' } })).status, 403);
    const cookie = await f.login();
    assert.equal((await f.request('/api/admin/action', { cookie, headers: { Origin: 'https://other.test' }, body: {} })).status, 403);
    assert.equal((await f.request('/api/admin/action', { cookie, body: '{bad' })).status, 400);
    assert.equal((await f.request('/api/admin/action', { cookie, headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    assert.equal((await f.request('/api/admin/recipients', { cookie, method: 'PUT', body: JSON.stringify({ filler: 'x'.repeat(100001) }) })).status, 413);
    assert.equal(f.store.value.revision, 0);
  } finally { await f.close(); }
});

test('HTTP failed PIN attempts are rate limited and do not reveal the configured PIN', async () => {
  const f = await httpFixture();
  try {
    for (let index = 0; index < 5; index++) { const response = await f.request('/api/login', { body: { pin: 'wrong' } }); assert.equal(response.status, 401); assert.doesNotMatch(await response.text(), /test-pin-123/); }
    assert.equal((await f.request('/api/login', { body: { pin: 'test-pin-123' } })).status, 429);
    f.clock.now += 10 * 60 * 1000; assert.ok(await f.login());
  } finally { await f.close(); }
});

test('HTTP duplicate commands are serialized once stale commands return409 and unchanged state returns304', async () => {
  const f = await httpFixture();
  try {
    const cookie = await f.login(), body = { commandId: 'duplicate-command', revision: 0, action: { type: 'prizes' } };
    const responses = await Promise.all([f.request('/api/admin/action', { cookie, body }), f.request('/api/admin/action', { cookie, body })]);
    const states = await Promise.all(responses.map(response => response.json())); assert.equal(states[0].revision, 1); assert.equal(states[1].revision, 1);
    assert.equal((await f.request('/api/admin/action', { cookie, body: { ...body, commandId: 'stale-command' } })).status, 409);
    assert.equal((await f.request('/api/admin/state?revision=1&bank=0&prize=0', { cookie })).status, 304);
    const initial = await (await f.request('/api/admin/state?revision=1&bank=-1', { cookie })).json(); assert.equal(initial.bank.length, 8);
  } finally { await f.close(); }
});

test('HTTP control acknowledgements omit the photo bank while apply returns the newly saved bank', async () => {
  const f = await httpFixture();
  try {
    const cookie = await f.login();
    const ready = await (await f.request('/api/admin/action', { cookie, body: { commandId: 'small-control-ack', revision: 0, action: { type: 'ready' } } })).json();
    assert.equal(ready.bank, undefined); assert.equal(ready.bankVersion, 0);
    assert.doesNotMatch(JSON.stringify(ready), /UNREVEALED-FUTURE|SECRET-IMAGE-SOURCE|imageData/);
    const changed = await (await f.request('/api/admin/action', { cookie, body: { commandId: 'new-bank-control', revision: ready.revision, action: { type: 'apply', questions: [...seed].reverse() } } })).json();
    assert.equal(changed.bankVersion, 1); assert.equal(changed.bank.length, seed.length);
    assert.equal(changed.bank[0].text, seed.at(-1).text); assert.equal(changed.bank.at(-1).imageData, seed[0].imageData);
  } finally { await f.close(); }
});

test('private presenter keeps authentication while screen links use only the configured public origin', async () => {
  const f = await httpFixture({ serverOptions: { publicScreenUrl: 'https://projection.example/' } });
  try {
    assert.equal((await f.request('/api/admin/state')).status, 401);
    assert.equal((await f.request('/presenter')).status, 302);
    const cookie = await f.login();
    const initial = await (await f.request('/api/admin/state', { cookie })).json();
    assert.equal(initial.screenPath, `https://projection.example/screen#key=${screenKey}`);
    const action = await (await f.request('/api/admin/action', { cookie, body: { commandId: 'public-link-ack', revision: initial.revision, action: { type: 'ready' } } })).json();
    assert.equal(action.screenPath, initial.screenPath);
    assert.equal((await f.service.adminState()).screenPath, `/screen#key=${screenKey}`, 'the authoritative service remains unchanged');
  } finally { await f.close(); }
  for (const publicScreenUrl of ['http://projection.example', 'https://user:pass@projection.example', 'https://projection.example/screen', 'https://projection.example?key=x', 'https://projection.example#key=x']) assert.throws(() => createManualServer({ service: {}, hostPin: 'test-pin', staticDir: '.', publicScreenUrl }), /PUBLIC_SCREEN_URL/);
});

test('HTTP save failure is an explicit503 and health fails without acknowledging a new game state', async () => {
  const f = await httpFixture();
  try {
    const cookie = await f.login(); f.store.failure = Error('private store failure');
    const response = await f.request('/api/admin/action', { cookie, body: { commandId: 'failed-command', revision: 0, action: { type: 'prizes' } } });
    assert.equal(response.status, 503); const body = await response.json(); assert.equal(typeof body.error, 'string'); assert.doesNotMatch(JSON.stringify(body), /private store failure/);
    assert.equal((await f.request('/api/health')).status, 503); assert.equal(f.service.document.revision, 0);
  } finally { await f.close(); }
});

test('production startup requires durable GCS configuration before opening a server', async () => {
  await assert.rejects(createFromEnv({ NODE_ENV: 'production', MANUAL_HOST_PIN: 'test-pin' }), /MANUAL_GCS_BUCKET/);
});
