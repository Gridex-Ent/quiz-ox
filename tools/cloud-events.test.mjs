import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { DEFAULT_EVENT_INFO, validateEventInfo } from '../web/src/quiz/event-info.js';
import { ManualService } from '../cloud/manual-service.mjs';
import { createLocalStore, StoreConflictError } from '../cloud/store.mjs';
import { createManualServer } from '../cloud/server.mjs';

const event = { name: '가을 퀴즈 한마당', date: '2028-02-29', venue: '공용 행사장', message: '함께 즐겨 주세요.' };
const screenKey = 'events-test-screen-key-12345678901234567890';
const seed = [
  { text: '현재 문제', answer: 'O', seconds: 10, explanation: 'PRIVATE-EXPLANATION', note: 'PRIVATE-HOST-NOTE' },
  { text: 'PRIVATE-FUTURE-QUESTION', answer: 'X', seconds: 10, explanation: '' },
];

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
  return {
    service, store, clock,
    async act(action) {
      const current = await service.adminState();
      return service.action({ commandId: `event-command-${++command}`, revision: current.revision, action });
    },
  };
}

test('event validation accepts exact public fields, real calendar dates and documented limits', () => {
  assert.deepEqual(validateEventInfo(DEFAULT_EVENT_INFO), DEFAULT_EVENT_INFO);
  assert.deepEqual(validateEventInfo(event), event);
  for (const date of ['', '0001-01-01', '2000-02-29', '2024-02-29', '9999-12-31']) assert.equal(validateEventInfo({ ...event, date }).date, date);
  const limits = { name: '가'.repeat(80), date: '', venue: '나'.repeat(120), message: '다'.repeat(200) };
  assert.deepEqual(validateEventInfo(limits), limits);
  for (const invalid of [null, [], {}, { ...event, note: 'PRIVATE' }, { ...event, name: ' ' }, { ...event, name: '가'.repeat(81) }, { ...event, venue: '나'.repeat(121) }, { ...event, message: '다'.repeat(201) }, { ...event, date: null }, { ...event, venue: 123 }, { ...event, message: {} }]) assert.throws(() => validateEventInfo(invalid));
  for (const date of ['2023-02-29', '1900-02-29', '2100-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '2026-01-32', '0000-01-01', '2026-1-01', '2026-01-01T00:00:00Z']) assert.throws(() => validateEventInfo({ ...event, date }));
  const inherited = Object.create({ name: '상속된 이름' }); Object.assign(inherited, { date: '', venue: '', message: '' });
  assert.throws(() => validateEventInfo(inherited));
  assert.notEqual(validateEventInfo(event), event);
  assert.ok(Object.isFrozen(DEFAULT_EVENT_INFO));
});

test('schema1 without event opens with defaults without rewriting its 31-question bank, records or key', async () => {
  const questions = JSON.parse(await readFile(new URL('../questions/default.json', import.meta.url), 'utf8'));
  assert.equal(questions.length, 31);
  const first = await fixture({ questions });
  const legacy = structuredClone(first.store.value); delete legacy.event;
  legacy.recipients[0].name = 'PRIVATE-RECIPIENT'; legacy.recipients[0].phone = '000-0000-0000'; legacy.recipientRevision = 7;
  const store = memoryStore(legacy), original = structuredClone(store.value);
  const reopened = await ManualService.create({ store, seed: [seed[0]], now: () => 1000 });
  const admin = await reopened.adminState(), screen = await reopened.screenState();
  assert.deepEqual(admin.event, DEFAULT_EVENT_INFO); assert.deepEqual(screen.view.event, DEFAULT_EVENT_INFO);
  assert.deepEqual(admin.bank, original.state.questions); assert.equal(admin.bank.length, 31);
  assert.equal(admin.revision, original.revision); assert.equal(admin.bankVersion, original.bankVersion);
  assert.equal(reopened.document.screenKey, original.screenKey); assert.equal(reopened.document.recipientRevision, 7);
  assert.deepEqual((await reopened.recipients()).records, original.recipients);
  assert.deepEqual(store.value, original); assert.equal(store.saves, 0);
});

test('event ACK and polling update metadata while preserving the active bonus, bank, audio and recipients', async () => {
  const f = await fixture();
  const recipients = await f.service.recipients(); recipients.records[0].name = 'PRIVATE-RECIPIENT'; recipients.records[0].phone = '000-0000-0000';
  await f.service.saveRecipients(recipients);
  await f.act({ type: 'audio', muted: true, volume: 0.2 });
  await f.act({ type: 'show' });
  await f.act({ type: 'interlude', question: { ...seed[0], text: '번외', answer: 'X' } });
  const before = structuredClone(f.service.document);
  const ack = await f.act({ type: 'event', event });
  assert.deepEqual(ack.event, event); assert.equal(ack.revision, before.revision + 1); assert.equal(ack.bank, undefined);
  for (const key of ['schemaVersion', 'state', 'bankVersion', 'recipientRevision', 'recipients', 'screenKey', 'audio']) assert.deepEqual(f.service.document[key], before[key]);
  assert.deepEqual(f.store.value.event, event);
  const poll = await f.service.adminState({ revision: before.revision, bank: before.bankVersion });
  assert.deepEqual(poll.event, event); assert.equal(poll.bank, undefined);
  assert.equal(await f.service.adminState({ revision: poll.revision, bank: poll.bankVersion, prize: poll.prizeVersion }), null);
  const screen = await f.service.screenState({ revision: before.revision });
  assert.deepEqual(screen.view.event, event); assert.equal(await f.service.screenState({ revision: screen.revision }), null);
  ack.event.name = 'caller mutation'; screen.view.event.venue = 'caller mutation';
  assert.deepEqual(f.service.document.event, event);
});

test('invalid event actions and malformed stored dates fail before replacing durable data', async () => {
  const f = await fixture(), before = structuredClone(f.store.value);
  for (const value of [undefined, null, { ...event, date: '2026-02-29' }, { ...event, recipients: [] }]) {
    await assert.rejects(f.service.action({ commandId: 'invalid-event-command', revision: 0, action: { type: 'event', event: value } }), error => error.statusCode === 400);
    assert.deepEqual(f.store.value, before);
  }
  const corrupted = structuredClone(before); corrupted.event.date = '2026-02-30';
  const store = memoryStore(corrupted);
  await assert.rejects(ManualService.create({ store, seed }), /날짜/);
  assert.deepEqual(store.value, corrupted); assert.equal(store.saves, 0);
});

test('event storage failure does not acknowledge or apply edits, and retry can recover', async () => {
  const f = await fixture(), before = structuredClone(f.store.value);
  const request = { commandId: 'event-storage-retry', revision: 0, action: { type: 'event', event } };
  f.store.failure = Error('injected storage outage');
  await assert.rejects(f.service.action(request), error => error.statusCode === 503 && error.code === 'storage_failed');
  assert.deepEqual(f.store.value, before); assert.deepEqual(f.service.document.event, DEFAULT_EVENT_INFO);
  f.store.failure = null;
  const ack = await f.service.action(request); assert.deepEqual(ack.event, event); assert.equal(ack.revision, 1);
});

test('event conflicts reload the winning metadata instead of overwriting another presenter', async () => {
  const store = memoryStore(), first = await fixture({ store }), second = await fixture({ store });
  await first.act({ type: 'event', event });
  await assert.rejects(second.service.action({ commandId: 'event-conflicting-client', revision: 0, action: { type: 'event', event: { ...event, name: '다른 행사' } } }), error => error.statusCode === 409 && error.code === 'storage_conflict');
  assert.deepEqual((await second.service.adminState()).event, event);
  await assert.rejects(first.service.action({ commandId: 'event-stale-client', revision: 0, action: { type: 'event', event: { ...event, venue: '다른 장소' } } }), error => error.code === 'stale_revision');
  assert.deepEqual(store.value.event, event); assert.equal(store.value.revision, 1);
});

test('event edits survive atomic-file reopen and persistent command replay without touching game data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ox-cloud-events-')), path = join(directory, 'state.json');
  try {
    const store = createLocalStore(path), f = await fixture({ store });
    const before = structuredClone(f.service.document);
    const request = { commandId: 'event-durable-replay', revision: 0, action: { type: 'event', event } };
    const saved = await f.service.action(request);
    const reopened = await ManualService.create({ store: createLocalStore(path), seed: [seed[1]], now: () => 1000 });
    const replay = await reopened.action(request);
    assert.deepEqual(replay.event, event); assert.equal(replay.revision, saved.revision);
    assert.deepEqual(reopened.document.state, before.state); assert.equal(reopened.document.screenKey, before.screenKey);
    assert.deepEqual(reopened.document.recipients, before.recipients); assert.deepEqual(reopened.document.audio, before.audio);
    const durable = JSON.parse(await readFile(path, 'utf8'));
    assert.deepEqual(durable.event, event); assert.equal(durable.commands.length, 1); assert.equal(durable.revision, 1);
  } finally { await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; }); await rmdir(directory); }
});

test('event HTTP updates require presenter session and origin; public projection exposes only four public event strings', async () => {
  const f = await fixture();
  const recipients = await f.service.recipients(); recipients.records[0].name = 'PRIVATE-RECIPIENT'; recipients.records[0].phone = '000-0000-0000'; await f.service.saveRecipients(recipients);
  const server = createManualServer({ service: f.service, hostPin: 'events-test-pin', staticDir: fileURLToPath(new URL('../web/', import.meta.url)), tickIntervalMs: 0, now: () => f.clock.now });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { body, headers = {}, ...options } = {}) => fetch(base + path, { redirect: 'manual', method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), ...options, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers } });
  const command = { commandId: 'event-http-command', revision: 0, action: { type: 'event', event } };
  try {
    assert.equal((await request('/api/admin/action', { body: command })).status, 401);
    assert.equal((await request('/api/admin/state')).status, 401);
    assert.equal((await request('/seed.json')).status, 401);
    const login = await request('/api/login', { body: { pin: 'events-test-pin' } }); assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.equal((await request('/api/admin/action', { body: command, headers: { Cookie: cookie, Origin: 'https://other.test' } })).status, 403);
    assert.deepEqual(f.store.value.event, DEFAULT_EVENT_INFO);
    const response = await request('/api/admin/action', { body: command, headers: { Cookie: cookie, Origin: base } });
    assert.equal(response.status, 200); assert.deepEqual((await response.json()).event, event);
    assert.equal((await request('/api/screen/state', { headers: { Cookie: cookie } })).status, 401);
    await f.act({ type: 'show' }); f.clock.now += 2000;
    const screen = await request('/api/screen/state', { headers: { 'X-Screen-Key': screenKey } }); assert.equal(screen.status, 200);
    const dto = await screen.json(); assert.deepEqual(dto.view.event, event); assert.deepEqual(Object.keys(dto.view.event).sort(), ['date', 'message', 'name', 'venue']);
    assert.equal(dto.view.question.text, seed[0].text); assert.equal(dto.view.question.answer, undefined);
    assert.doesNotMatch(JSON.stringify(dto), /PRIVATE-|000-0000|screenKey|recipients|mainState|questions|commands/);
  } finally { await server.closeGracefully(); }
});

test('event input trims surrounding whitespace without changing the four public fields', () => {
  assert.deepEqual(validateEventInfo({ name: '  봄 행사  ', date: ' 2028-02-29 ', venue: '  야외 무대 ', message: '  반갑습니다.  ' }), {name:'봄 행사',date:'2028-02-29',venue:'야외 무대',message:'반갑습니다.'});
});
