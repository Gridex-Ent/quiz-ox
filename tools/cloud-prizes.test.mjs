import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { MAX_PRIZE_BYTES, validatePrizeInfo } from '../web/src/quiz/prize-info.js';
import { ManualService } from '../cloud/manual-service.mjs';
import { StoreConflictError, createLocalStore } from '../cloud/store.mjs';
import { createManualServer } from '../cloud/server.mjs';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZioAAAAASUVORK5CYII=';
const prize = { imageData: png, imageAlt: '행사 상품', caption: '당첨되신 분께 드립니다.' };
const screenKey = 'prizes-test-screen-key-12345678901234567890';
const seed = [
  { text: '현재 문제', answer: 'O', seconds: 10, explanation: 'PRIVATE-EXPLANATION', note: 'PRIVATE-HOST-NOTE' },
  { text: 'PRIVATE-FUTURE-QUESTION', answer: 'X', seconds: 10, explanation: '' },
];
const dataUri = (type, bytes) => `data:image/${type};base64,${Buffer.from(bytes).toString('base64')}`;

function memoryStore(value = null) {
  let version = value ? 1 : 0;
  return {
    kind: 'test', value: value ? structuredClone(value) : null, failure: null, saves: 0,
    async load() { return this.value ? { value: structuredClone(this.value), generation: String(version) } : null; },
    async save(next, expected) {
      if (this.failure) throw this.failure;
      if ((this.value ? String(version) : null) !== expected) throw new StoreConflictError();
      this.value = structuredClone(next); version++; this.saves++;
      return { generation: String(version) };
    },
  };
}

async function fixture({ store = memoryStore(), questions = seed } = {}) {
  const clock = { now: 1000 };
  const service = await ManualService.create({ store, seed: questions, screenKey, now: () => clock.now });
  let command = 0;
  return { service, store, clock, async act(action) {
    const current = await service.adminState();
    return service.action({ commandId: `prize-command-${++command}`, revision: current.revision, action });
  } };
}

test('prize validation permits only inline raster MIME/signature pairs and trims public labels', () => {
  assert.equal(validatePrizeInfo(null), null);
  assert.deepEqual(validatePrizeInfo({ ...prize, imageAlt: '  행사 상품  ', caption: '  당첨되신 분께 드립니다.  ' }), prize);
  const fixtures = [
    ['png', [137, 80, 78, 71, 13, 10, 26, 10]], ['jpeg', [255, 216, 255, 224]],
    ['gif', Buffer.from('GIF87a')], ['gif', Buffer.from('GIF89a')], ['webp', Buffer.from('RIFF0000WEBP')],
  ];
  for (const [type, bytes] of fixtures) assert.equal(validatePrizeInfo({ ...prize, imageData: dataUri(type, bytes) }).imageData, dataUri(type, bytes));
  assert.equal(validatePrizeInfo({ ...prize, imageAlt: '가'.repeat(100), caption: '나'.repeat(200) }).imageAlt.length, 100);
  for (const invalid of [undefined, [], {}, { ...prize, note: 'PRIVATE' }, { ...prize, caption: null }, { ...prize, imageAlt: '가'.repeat(101) }, { ...prize, caption: '나'.repeat(201) }, { ...prize, imageData: 'https://example.test/prize.png' }, { ...prize, imageData: dataUri('svg+xml', '<svg/>') }, { ...prize, imageData: dataUri('jpeg', Buffer.from('GIF89a')) }, { ...prize, imageData: 'data:image/png;base64,YQ==' }, { ...prize, imageData: png + '\n' }, { ...prize, imageData: png.replace(';base64,', ';base64, ') }, { ...prize, imageData: 'data:image/png;base64,AAAA=' }]) assert.throws(() => validatePrizeInfo(invalid));
  // These values decode to the same eight bytes; nonzero padding bits are rejected.
  assert.throws(() => validatePrizeInfo({ ...prize, imageData: 'data:image/png;base64,iVBORw0KGgp=' }));
});

test('prize size limits cap both data URI length and decoded bytes before accepting an upload', () => {
  assert.equal(MAX_PRIZE_BYTES, 4 * 1024 * 1024);
  const bytes = Buffer.alloc(MAX_PRIZE_BYTES); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  const atLimit = dataUri('png', bytes);
  assert.equal(validatePrizeInfo({ ...prize, imageData: atLimit }).imageData.length, atLimit.length);
  const oversized = Buffer.concat([bytes, Buffer.from([0])]);
  assert.throws(() => validatePrizeInfo({ ...prize, imageData: dataUri('png', oversized) }), /4MiB/);
  assert.throws(() => validatePrizeInfo({ ...prize, imageData: 'data:image/png;base64,' + 'A'.repeat(6 * 1024 * 1024) }), /4MiB/);
});

test('schema1 without prize uses the default without rewriting 31 questions, event, records or key', async () => {
  const questions = JSON.parse(await readFile(new URL('../questions/default.json', import.meta.url), 'utf8'));
  assert.equal(questions.length, 31);
  const initial = await fixture({ questions }), legacy = structuredClone(initial.store.value); delete legacy.prize; delete legacy.prizeVersion;
  legacy.event = { name: '보존할 행사', date: '2026-10-24', venue: '보존 장소', message: '보존 문구' };
  legacy.recipients[0].name = 'PRIVATE-RECIPIENT'; legacy.recipients[0].phone = '000-0000-0000'; legacy.recipientRevision = 6;
  const store = memoryStore(legacy), original = structuredClone(store.value);
  const reopened = await ManualService.create({ store, seed: [seed[0]], now: () => 1000 });
  const admin = await reopened.adminState(), screen = await reopened.screenState();
  assert.equal(admin.prize, null); assert.equal(screen.view.prize, null);
  assert.equal(admin.prizeVersion, 0); assert.equal(reopened.document.prizeVersion, 0);
  for (const key of ['revision', 'bankVersion', 'recipientRevision', 'screenKey', 'state', 'audio', 'event', 'recipients']) assert.deepEqual(reopened.document[key], original[key]);
  assert.deepEqual(store.value, original); assert.equal(store.saves, 0);
});

test('prize upload and default reset acknowledge only after persistence without changing game or other configuration', async () => {
  const f = await fixture();
  const recipients = await f.service.recipients(); recipients.records[0].name = 'PRIVATE-RECIPIENT'; await f.service.saveRecipients(recipients);
  await f.act({ type: 'event', event: { name: '보존할 행사', date: '', venue: '', message: '' } });
  await f.act({ type: 'audio', muted: true }); await f.act({ type: 'show' });
  await f.act({ type: 'interlude', question: { ...seed[0], text: '진행 중 번외' } });
  const before = structuredClone(f.service.document), ack = await f.act({ type: 'prize', prize });
  assert.deepEqual(ack.prize, prize); assert.equal(ack.bank, undefined); assert.equal(ack.revision, before.revision + 1);
  assert.equal(ack.prizeVersion, before.prizeVersion + 1);
  for (const key of ['state', 'bankVersion', 'recipientRevision', 'screenKey', 'audio', 'event', 'recipients']) assert.deepEqual(f.service.document[key], before[key]);
  assert.deepEqual(f.store.value.prize, prize);
  const screen = await f.service.screenState({ revision: before.revision }); assert.equal(screen.view.prize, null);
  assert.equal(await f.service.screenState({ revision: screen.revision }), null);
  ack.prize.caption = 'caller mutation'; assert.deepEqual(f.service.document.prize, prize);
  const reset = await f.act({ type: 'prize', prize: null }); assert.equal(reset.prize, null); assert.equal((await f.service.screenState()).view.prize, null);
  assert.equal(reset.prizeVersion, before.prizeVersion + 2);
  for (const key of ['state', 'bankVersion', 'recipientRevision', 'screenKey', 'audio', 'event', 'recipients']) assert.deepEqual(f.service.document[key], before[key]);
});

test('prize validation and failed storage leave durable data and command acknowledgements unchanged', async () => {
  const f = await fixture(), before = structuredClone(f.store.value);
  for (const value of [undefined, { ...prize, imageData: 'https://example.test/image.png' }, { ...prize, recipients: [] }]) {
    await assert.rejects(f.service.action({ commandId: 'invalid-prize-command', revision: 0, action: { type: 'prize', prize: value } }), error => error.statusCode === 400);
    assert.deepEqual(f.store.value, before);
  }
  const request = { commandId: 'retry-prize-command', revision: 0, action: { type: 'prize', prize } };
  f.store.failure = Error('injected write outage');
  await assert.rejects(f.service.action(request), error => error.statusCode === 503 && error.code === 'storage_failed');
  assert.equal(f.service.document.prize, null); assert.deepEqual(f.store.value, before);
  f.store.failure = null; assert.deepEqual((await f.service.action(request)).prize, prize);
  const corrupted = structuredClone(f.store.value); corrupted.prize.imageData = 'data:image/png;base64,YQ==';
  const badStore = memoryStore(corrupted); await assert.rejects(ManualService.create({ store: badStore, seed }));
  assert.deepEqual(badStore.value, corrupted); assert.equal(badStore.saves, 0);
});

test('prize CAS and stale revision conflicts preserve the winning upload', async () => {
  const store = memoryStore(), first = await fixture({ store }), second = await fixture({ store });
  await first.act({ type: 'prize', prize });
  await assert.rejects(second.service.action({ commandId: 'conflicting-prize-command', revision: 0, action: { type: 'prize', prize: null } }), error => error.code === 'storage_conflict' && error.statusCode === 409);
  assert.deepEqual((await second.service.adminState()).prize, prize);
  await assert.rejects(first.service.action({ commandId: 'stale-prize-command', revision: 0, action: { type: 'prize', prize: null } }), error => error.code === 'stale_revision');
  assert.deepEqual(store.value.prize, prize); assert.equal(store.value.revision, 1);
});

test('prize upload survives atomic-file reopen and a persistent duplicate command applies once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ox-cloud-prizes-')), path = join(directory, 'state.json');
  try {
    const store = createLocalStore(path), f = await fixture({ store });
    const before = structuredClone(f.service.document);
    const command = { commandId: 'durable-prize-command', revision: 0, action: { type: 'prize', prize } };
    const saved = await f.service.action(command);
    const reopened = await ManualService.create({ store: createLocalStore(path), seed: [seed[1]], now: () => 1000 });
    const replay = await reopened.action(command); assert.deepEqual(replay.prize, prize); assert.equal(replay.revision, saved.revision);
    assert.equal(replay.prizeVersion, 1);
    for (const key of ['state', 'bankVersion', 'recipientRevision', 'screenKey', 'audio', 'event', 'recipients']) assert.deepEqual(reopened.document[key], before[key]);
    const durable = JSON.parse(await readFile(path, 'utf8')); assert.deepEqual(durable.prize, prize); assert.equal(durable.commands.length, 1); assert.equal(durable.prizeVersion, 1);
  } finally { await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); await rmdir(directory); }
});

test('a lost prize acknowledgement reconciles the committed upload before retrying', async () => {
  const f = await fixture(), save = f.store.save.bind(f.store);
  let loseAck = true;
  f.store.save = async (...args) => { const result = await save(...args); if (loseAck) { loseAck = false; throw Error('ack lost after save'); } return result; };
  const command = { commandId: 'lost-prize-ack-command', revision: 0, action: { type: 'prize', prize } };
  await assert.rejects(f.service.action(command), error => error.statusCode === 503);
  assert.equal(f.service.document.prize, null);
  assert.deepEqual((await f.service.adminState()).prize, prize);
  assert.equal((await f.service.action(command)).revision, 1); assert.equal(f.store.value.commands.length, 1);
});

test('a maximum-size prize is omitted from ordinary ACKs, known-version polls and non-prize public phases', async () => {
  const f = await fixture(), bytes = Buffer.alloc(MAX_PRIZE_BYTES); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
  const largePrize = { ...prize, imageData: dataUri('png', bytes) };
  const command = { commandId: 'large-prize-command', revision: 0, action: { type: 'prize', prize: largePrize } };
  const saved = await f.service.action(command);
  assert.equal(saved.prize.imageData, largePrize.imageData); assert.equal(saved.prizeVersion, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(saved)) < 6 * 1024 * 1024);
  assert.equal(await f.service.adminState({ revision: saved.revision, bank: saved.bankVersion, prize: 1 }), null);
  const missingCache = await f.service.adminState({ revision: saved.revision, bank: saved.bankVersion, prize: -1 });
  assert.equal(missingCache.bank, undefined); assert.equal(missingCache.prize.imageData, largePrize.imageData);
  const showing = await f.act({ type: 'show' });
  assert.equal(showing.prizeVersion, 1); assert.equal(Object.hasOwn(showing, 'prize'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(showing)) < 5000);
  const poll = await f.service.adminState({ revision: saved.revision, bank: showing.bankVersion, prize: 1 });
  assert.equal(Object.hasOwn(poll, 'prize'), false); assert.ok(Buffer.byteLength(JSON.stringify(poll)) < 5000);
  for (const clockAdvance of [0, 2000, 10000]) {
    f.clock.now += clockAdvance;
    const screen = await f.service.screenState();
    assert.equal(screen.view.prize, null); assert.ok(Buffer.byteLength(JSON.stringify(screen)) < 5000);
  }
  await f.act({ type: 'prizes' });
  const publicPrize = await f.service.screenState(); assert.equal(publicPrize.view.prize.imageData, largePrize.imageData);
  publicPrize.view.prize.caption = 'caller mutation'; assert.equal(f.service.document.prize.caption, largePrize.caption);
  await f.act({ type: 'blank' }); assert.equal((await f.service.screenState()).view.prize, null);
  // An uncertain/repeated command returns the current authoritative image, even with an old request revision.
  const repeated = await f.service.action(command); assert.equal(repeated.prizeVersion, 1); assert.equal(repeated.prize.imageData, largePrize.imageData);
  const reset = await f.act({ type: 'prize', prize: null }); assert.equal(reset.prizeVersion, 2); assert.equal(reset.prize, null);
  const resetPoll = await f.service.adminState({ revision: reset.revision, bank: reset.bankVersion, prize: 1 });
  assert.equal(resetPoll.prizeVersion, 2); assert.equal(Object.hasOwn(resetPoll, 'prize'), true); assert.equal(resetPoll.prize, null);
});

test('prize HTTP upload requires presenter session and origin, while public projection contains only its three public fields', async () => {
  const f = await fixture();
  const recipients = await f.service.recipients(); recipients.records[0].name = 'PRIVATE-RECIPIENT'; recipients.records[0].phone = '000-0000-0000'; await f.service.saveRecipients(recipients);
  const server = createManualServer({ service: f.service, hostPin: 'prizes-test-pin', staticDir: fileURLToPath(new URL('../web/', import.meta.url)), tickIntervalMs: 0, now: () => f.clock.now });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { body, headers = {}, ...options } = {}) => fetch(base + path, { redirect: 'manual', method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), ...options, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } });
  const command = { commandId: 'http-prize-command', revision: 0, action: { type: 'prize', prize } };
  try {
    assert.equal((await request('/api/admin/action', { body: command })).status, 401);
    const login = await request('/api/login', { body: { pin: 'prizes-test-pin' } }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/admin/action', { body: command, headers: { Cookie: cookie, Origin: 'https://other.test' } })).status, 403);
    assert.equal(f.store.value.prize, null);
    const saved = await request('/api/admin/action', { body: command, headers: { Cookie: cookie, Origin: base } }); assert.equal(saved.status, 200);
    const uploaded = await saved.json(); assert.deepEqual(uploaded.prize, prize); assert.equal(uploaded.prizeVersion, 1);
    assert.equal((await request(`/api/admin/state?revision=${uploaded.revision}&bank=${uploaded.bankVersion}&prize=1`, { headers: { Cookie: cookie } })).status, 304);
    const missingCache = await request(`/api/admin/state?revision=${uploaded.revision}&bank=${uploaded.bankVersion}&prize=-1`, { headers: { Cookie: cookie } }); assert.equal(missingCache.status, 200); assert.deepEqual((await missingCache.json()).prize, prize);
    assert.equal((await request('/api/admin/state?prize=1.5', { headers: { Cookie: cookie } })).status, 400);
    assert.equal((await request('/api/screen/state', { headers: { Cookie: cookie } })).status, 401);
    await f.act({ type: 'prizes' });
    const response = await request('/api/screen/state', { headers: { 'X-Screen-Key': screenKey } }); assert.equal(response.status, 200);
    const dto = await response.json(); assert.deepEqual(dto.view.prize, prize); assert.deepEqual(Object.keys(dto.view.prize).sort(), ['caption', 'imageAlt', 'imageData']);
    assert.equal(dto.view.question, undefined); assert.doesNotMatch(JSON.stringify(dto), /PRIVATE-|000-0000|screenKey|recipients|mainState|questions|commands/);
    await f.act({ type: 'show' }); f.clock.now += 2000;
    const question = await (await request('/api/screen/state', { headers: { 'X-Screen-Key': screenKey } })).json();
    assert.equal(question.view.prize, null); assert.equal(question.view.question.answer, undefined);
    assert.doesNotMatch(JSON.stringify(question), /PRIVATE-|000-0000|screenKey|recipients|mainState|questions|commands/);
    const invalid = await request('/api/admin/action', { body: { commandId: 'http-prize-private-injection', revision: f.service.document.revision, action: { type: 'prize', prize: { ...prize, note: 'PRIVATE-INJECTED' } } }, headers: { Cookie: cookie, Origin: base } }); assert.equal(invalid.status, 400);
    assert.deepEqual(f.store.value.prize, prize);
  } finally { await server.closeGracefully(); }
});
