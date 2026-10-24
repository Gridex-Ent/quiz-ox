import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { createCloudTransport } from '../web/src/cloud/transport.js';

const bank = [{ text: '첫 문항', answer: 'X', choiceO: 'O', choiceX: 'X', seconds: 10, explanation: '관리자 해설' }, { text: '둘째 문항', answer: 'O', choiceO: 'O', choiceX: 'X', seconds: 10, explanation: '' }];
const envelope = (extra = {}) => ({ revision: 1, bankVersion: 1, serverNow: 1000, bank, state: { index: 0, phase: 'cover', mode: 'main', left: 'O', deadline: null, remaining: null, topicDeadline: null, topicRemaining: null, blank: false, mainState: null }, audio: { muted: false, music: true, volume: 0.35 }, screenPath: '/screen#key=read-only', ...extra });
const response = (payload, status = 200) => ({ status, ok: status >= 200 && status < 300, json: async () => payload });
function harness(handler) {
  let id = 0, command = 0, clock = 1000;
  const calls = [], states = [], statuses = [], connections = [], timers = new Map();
  const client = createCloudTransport({
    fetch: async (path, options) => { calls.push({ path, options }); return handler(path, options, calls.length); },
    onState: (state, meta) => states.push({ state, meta }), onStatus: message => statuses.push(message), onConnection: state => connections.push(state),
    now: () => clock, commandId: () => `test-command-${++command}`,
    setTimeout: (fn, ms) => { const key = ++id; timers.set(key, { fn, ms }); return key; }, clearTimeout: key => timers.delete(key),
  });
  return { client, calls, states, statuses, connections, timers, setClock: value => { clock = value; }, async poll() { const entry = [...timers.entries()].find(([, timer]) => timer.ms === 500); assert.ok(entry); timers.delete(entry[0]); entry[1].fn(); await new Promise(resolve => setImmediate(resolve)); } };
}

test('cloud transport hydrates bank and bonus snapshots without exposing mutable references', async () => {
  const h = harness(() => response(envelope())); await h.client.connect();
  assert.equal(h.states[0].state.questions[0].text, '첫 문항');
  h.states[0].state.questions[0].text = 'changed outside'; assert.equal(h.client.state.modelState.questions[0].text, '첫 문항');
  const bonus = { index: 0, mode: 'bonus', phase: 'question', bonusQuestion: { text: '번외', kind: 'open', openAnswer: '정답' }, mainState: { index: 1, phase: 'answer', mode: 'main' } };
  const h2 = harness(() => response(envelope({ state: bonus }))); await h2.client.connect();
  const current = h2.client.state.modelState;
  assert.equal(current.questions[0].text, '번외'); assert.equal(current.mainState.questions[1].text, '둘째 문항'); assert.equal(current.mainState.index, 1);
  assert.equal(current.bonusQuestion, undefined); h.client.destroy(); h2.client.destroy();
});

test('unchanged revisions use cached bank and 304 does not parse or repaint the state', async () => {
  const h = harness((_path, _options, call) => call === 1 ? response(envelope()) : { status: 304, json: () => { throw Error('304 body must not be read'); } });
  await h.client.connect(); await h.poll();
  assert.equal(h.states.length, 1); assert.match(h.calls[1].path, /revision=1&bank=1/); assert.equal(h.client.state.connected, true); h.client.destroy();
});

test('commands never advance optimistically and concurrent clicks stay blocked until durable acknowledgement', async () => {
  let acknowledge;
  const h = harness((path) => path.includes('/action') ? new Promise(resolve => { acknowledge = resolve; }) : response(envelope()));
  await h.client.connect(); const command = h.client.send({ type: 'show' });
  assert.equal(h.client.state.busy, true); assert.equal(h.client.state.modelState.phase, 'cover');
  await assert.rejects(h.client.send({ type: 'next' }), error => error.code === 'BUSY');
  acknowledge(response(envelope({ revision: 2, bank: undefined, state: { ...envelope().state, phase: 'topic' } })));
  await command; assert.equal(h.client.state.modelState.phase, 'topic'); assert.equal(h.client.state.busy, false);
  const posted = JSON.parse(h.calls.find(call => call.path.includes('/action')).options.body);
  assert.equal(posted.revision, 1); assert.equal(posted.commandId, 'test-command-1'); h.client.destroy();
});

test('a stale command resynchronizes from the server and is never blindly replayed', async () => {
  const h = harness((path, _options, call) => path.includes('/action') ? response({ error: 'stale' }, 409) : response(envelope({ revision: call > 1 ? 3 : 1, state: { ...envelope().state, index: call > 1 ? 1 : 0 } })));
  await h.client.connect(); await assert.rejects(h.client.send({ type: 'next' }), error => error.status === 409);
  assert.equal(h.calls.filter(call => call.path.includes('/action')).length, 1); assert.equal(h.client.state.modelState.index, 1);
  assert.match(h.statuses.at(-1), /다른 화면/); h.client.destroy();
});

test('an unknown network result locks further commands until confirmed state is recovered', async () => {
  let failed = false;
  const h = harness((path) => { if (path.includes('/action')) { failed = true; throw Error('network'); } if (failed) throw Error('network'); return response(envelope()); });
  await h.client.connect(); await assert.rejects(h.client.send({ type: 'next' }));
  assert.equal(h.client.state.uncertain, true); assert.equal(h.client.state.connected, false);
  await assert.rejects(h.client.send({ type: 'next' }), error => error.code === 'NOT_CONNECTED');
  assert.match(h.statuses.at(-1), /확인 중/); assert.equal(h.calls.filter(call => call.path.includes('/action')).length, 1); h.client.destroy();
});

test('poll recovers a dropped connection and an expired administrator session cannot issue commands', async () => {
  let count = 0;
  const h = harness(() => { count++; if (count === 2) throw Error('network'); if (count === 4) return response({ error: 'expired' }, 401); return response(envelope({ revision: count === 3 ? 2 : 1 })); });
  await h.client.connect(); await h.poll(); assert.equal(h.client.state.connected, false);
  await h.poll(); assert.equal(h.client.state.connected, true); assert.equal(h.client.state.revision, 2);
  await h.poll(); await assert.rejects(h.client.send({ type: 'show' }), error => error.status === 401); h.client.destroy();
});

test('recipient records use private authenticated requests and saving a bank is an explicit apply command', async () => {
  const records = [{ rank: 1, slot: 1, name: '가상 수령자', phone: '000-0000-0000' }];
  const h = harness((path) => response(path.includes('/recipients') ? { revision: 4, records } : envelope()));
  await h.client.connect(); assert.deepEqual((await h.client.loadRecipients()).records, records);
  await h.client.saveRecipients(records, 4); await h.client.saveBank(bank);
  const saved = h.calls.find(call => call.options.method === 'PUT'); assert.equal(saved.options.credentials, 'same-origin'); assert.equal(JSON.parse(saved.options.body).revision, 4);
  assert.equal(JSON.parse(h.calls.at(-1).options.body).action.type, 'apply'); h.client.destroy();
});

test('public screen has no imports of private question banks runbook or recipient code', () => {
  const screen = readFileSync(new URL('../web/src/cloud/screen.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../web/cloud-screen.html', import.meta.url), 'utf8');
  assert.doesNotMatch(screen + html, /kiee-a-2026|bonus-quiz|runbook\.js|recipients\.js|standalone\.js|event-data/);
  assert.match(screen, /X-Screen-Key/); assert.match(screen, /screen-audio-enable/);
});

test('the actual public screen bundle contains no default question text explanations or saved bonus answers', () => {
  const bundle = buildSync({ entryPoints: [fileURLToPath(new URL('../web/src/cloud/screen.js', import.meta.url))], bundle: true, format: 'iife', write: false }).outputFiles[0].text;
  const questions = JSON.parse(readFileSync(new URL('../questions/default.json', import.meta.url), 'utf8'));
  for (const question of questions) {
    assert.equal(bundle.includes(question.text), false, 'public bundle must not embed the default question bank');
    if (question.explanation) assert.equal(bundle.includes(question.explanation), false, 'public bundle must not embed private explanations');
  }
  assert.doesNotMatch(bundle, /천만의 말씀|야금야금|가위를 낸다|recipients-v1|ox-banquet-standalone-v1/);
});

test('presenter stage-management tip is in the protected host shell only',()=>{
 const host=readFileSync(new URL('../web/host-shell.html',import.meta.url),'utf8');
 const screen=buildSync({entryPoints:[fileURLToPath(new URL('../web/src/cloud/screen.js',import.meta.url))],bundle:true,write:false,format:'iife'}).outputFiles[0].text;
 assert.match(host,/적당히 진행되었을 때, 정답자를 무대로 올린다/);assert.doesNotMatch(screen,/적당히 진행되었을 때|91년생 손들어보세요/);
});
