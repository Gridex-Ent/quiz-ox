import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createState } from '../web/src/quiz/manual-model.js';
import { DEFAULT_EVENT_INFO } from '../web/src/quiz/event-info.js';
import { makePublicView, renderQuizStage } from '../web/src/quiz/presentation.js';
import { createCloudTransport } from '../web/src/cloud/transport.js';

const bank = Array.from({ length: 31 }, (_, i) => ({ text: `가상 문제 ${i + 1}`, answer: 'O', choiceO: '전력', choiceX: '전기', seconds: 5, explanation: `가상 해설 ${i + 1}` }));
const shell = readFileSync(new URL('../web/host-shell.html', import.meta.url), 'utf8');
const bundled = await build({ entryPoints: [fileURLToPath(new URL('../web/src/quiz/presenter.js', import.meta.url))], bundle: true, format: 'iife', write: false,
  plugins: [{ name: 'controlled-cloud', setup(builder) {
    builder.onResolve({ filter: /\/cloud\/transport\.js$/ }, () => ({ path: 'controlled-cloud', namespace: 'test' }));
    builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const createCloudTransport = options => globalThis.__makeCloud(options);', loader: 'js' }));
    builder.onLoad({ filter: /presentation\.js$/, namespace: 'file' }, args => ({ contents: readFileSync(args.path, 'utf8').replace("  if (view.blank) return", "  globalThis.__stageRender?.();\n  if (view.blank) return"), loader: 'js', resolveDir: fileURLToPath(new URL('../web/src/quiz/', import.meta.url)) }));
  } }],
});
const bundle = bundled.outputFiles[0].text;
const pendingKey = 'ox-cloud-event-pending-v1';
const clone = value => structuredClone(value);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness({ event = DEFAULT_EVENT_INFO, session = new Map(), save, failStorage = false } = {}) {
  const elements = new Map([...shell.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => [id, { innerHTML: '', textContent: '', value: '', disabled: false, hidden: /\bhidden\b/.test(tag), scrollIntoView() {}, replaceChildren(...children) { this.children = children; }, querySelector(selector) { this.fields ||= new Map(); if (!this.fields.has(selector)) this.fields.set(selector, { value: '', textContent: '', disabled: false }); return this.fields.get(selector); } }]));
  for (const id of ['cloud-status', 'cloud-error', 'cloud-login', 'cloud-current', 'cloud-screen-link', 'cloud-screen-url', 'cloud-copy-link', 'cloud-logout']) elements.set(id, { textContent: '', value: '', hidden: false });
  elements.get('event-data').textContent = JSON.stringify(bank);
  elements.get('prize-data').textContent = JSON.stringify({ imageData: 'data:image/png;base64,YQ==', imageAlt: '가상 상품' });
  elements.get('asset-updates').textContent = '[]';
  const listeners = new Map(), calls = [], local = new Map();
  let callbacks, revision = 1, currentEvent = clone(event), currentState = createState(bank), renderCount = 0, tick, clock = 1000;
  const meta = () => ({ revision, bankVersion: 1, offsetMs: 0, serverNow: 1000, event: clone(currentEvent), audio: { muted: false, music: true, volume: .35 }, screenPath: '' });
  const emit = (next = currentEvent) => { currentEvent = clone(next); revision++; callbacks.onState(clone(currentState), meta()); };
  const context = vm.createContext({
    document: { body: { dataset: { cloud: 'presenter' } }, getElementById(id) { assert(elements.has(id), `shell missing ${id}`); return elements.get(id); }, querySelectorAll: () => [] },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    localStorage: { getItem: key => local.get(key) ?? null, setItem: (key, value) => local.set(key, value) },
    sessionStorage: { getItem: key => session.get(key) ?? null, removeItem: key => session.delete(key), setItem(key, value) { if (failStorage) throw Error('quota'); session.set(key, value); } },
    Option: function (text, value) { this.text = text; this.value = value; }, structuredClone, URL,
    location: { href: 'https://quiz.invalid/presenter' }, Date: class extends Date { static now() { return clock; } },
    setInterval(fn) { tick = fn; }, setTimeout() {}, confirm: () => true,
    __stageRender() { renderCount++; },
    __makeCloud(options) {
      callbacks = options;
      return { connect: async () => { callbacks.onConnection({ connected: true, busy: false, authenticated: true }); emit(); },
        async send(action) {
          calls.push(clone(action));
          callbacks.onConnection({ connected: true, busy: true, authenticated: true });
          try {
            const result = await save?.(action);
            if (action.type === 'event') emit(result?.event ?? action.event);
            return meta();
          } finally { callbacks.onConnection({ connected: true, busy: false, authenticated: true }); }
        },
      };
    },
  });
  vm.runInContext(bundle, context);
  return { elements, session, calls, local, emit,
    edit(field, value) { elements.get(`event-${field}`).value = value; elements.get('event-form').oninput(); },
    submit() { return elements.get('event-form').onsubmit({ preventDefault() {} }); },
    text: () => elements.get('event-status').textContent,
    preview: () => elements.get('preview').innerHTML,
    unload() { let prevented = false; listeners.get('beforeunload')({ preventDefault() { prevented = true; } }); return prevented; },
    setPhase(phase, extra = {}) { currentState = { ...currentState, phase, ...extra }; emit(); },
    tick(ms = 100) { clock += ms; tick(); },
    get renderCount() { return renderCount; },
  };
}

test('event form initializes from the server and polling preserves text, focus state, navigation, and the 31-question bank', () => {
  const event = { ...DEFAULT_EVENT_INFO, name: '첫 행사', date: '2026-10-24', venue: '제주' };
  const h = harness({ event });
  assert.equal(h.elements.get('event-name').value, '첫 행사'); assert.match(h.preview(), /첫 행사|2026\.10\.24/);
  h.elements.get('event-nav').onclick(); assert.equal(h.elements.get('event-page').hidden, false); assert.equal(h.elements.get('quiz-page').hidden, true);
  h.edit('name', '작성 중 행사'); h.emit(); h.emit();
  assert.equal(h.elements.get('event-name').value, '작성 중 행사'); assert.match(h.text(), /미저장/);
  assert.doesNotMatch(h.preview(), /작성 중 행사/); assert.equal(h.unload(), true);
  h.elements.get('event-back').onclick(); assert.equal(h.elements.get('quiz-page').hidden, false);
  assert.equal(h.elements.get('question-select').children.length, 31); assert.equal(h.calls.length, 0);
});

test('event changes only reach projection and success messages after the server ACK', async () => {
  const ack = deferred(), h = harness({ save: () => ack.promise }); h.edit('name', '저장할 행사');
  const saving = h.submit();
  assert.match(h.text(), /저장하는 중/); assert.doesNotMatch(h.preview(), /저장할 행사/);
  assert.equal(h.elements.get('event-save').disabled, true); assert(h.session.has(pendingKey));
  ack.resolve(); await saving;
  assert.match(h.preview(), /저장할 행사/); assert.match(h.text(), /클라우드에 저장했습니다/);
  assert.equal(h.session.has(pendingKey), false); assert.equal(h.unload(), false);
  assert.equal(h.calls[0].type, 'event'); assert.equal(h.calls[0].event.name, '저장할 행사');
});

test('shared validation trims submitted event fields after ACK without altering stored question or recipient data', async () => {
  const session = new Map([['ox-cloud-recipient-pending-v1', '{"untouched":true}']]), h = harness({ session });
  const before = h.local.get('ox-banquet-cloud-draft-v1');
  h.edit('name', '  새 행사  '); h.edit('venue', '  서울  '); h.edit('message', '  환영합니다  '); await h.submit();
  assert.equal(h.calls[0].event.name, '새 행사'); assert.equal(h.calls[0].event.venue, '서울');
  assert.equal(h.elements.get('event-name').value, '새 행사');
  assert.equal(h.local.get('ox-banquet-cloud-draft-v1'), before);
  assert.equal(session.get('ox-cloud-recipient-pending-v1'), '{"untouched":true}');
});

test('editing during an ACK cannot be overwritten, even when the edit returns to the old server value', async () => {
  const ack = deferred(), h = harness({ save: () => ack.promise }); h.edit('name', '먼저 저장');
  const saving = h.submit(); h.edit('name', DEFAULT_EVENT_INFO.name); ack.resolve(); await saving;
  assert.equal(h.elements.get('event-name').value, DEFAULT_EVENT_INFO.name);
  assert.match(h.text(), /추가한 입력/); assert.equal(JSON.parse(h.session.get(pendingKey)).event.name, DEFAULT_EVENT_INFO.name);
  assert.match(h.preview(), /먼저 저장/); assert.equal(h.unload(), true);
});

test('a failed save preserves all inputs and restores the unsent form after reload without uploading it', async () => {
  const session = new Map(), h = harness({ session, save: async () => { throw Error('서버 저장 실패'); } });
  h.edit('name', '계속 보관할 행사'); h.edit('message', '작성 중 안내'); await h.submit();
  assert.match(h.text(), /서버 저장 실패/); assert.doesNotMatch(h.text(), /클라우드에 저장했습니다/);
  const reopened = harness({ session });
  assert.equal(reopened.elements.get('event-name').value, '계속 보관할 행사'); assert.equal(reopened.elements.get('event-message').value, '작성 중 안내');
  assert.match(reopened.text(), /복원/); assert.equal(reopened.calls.length, 0);
});

test('different-tab event conflicts preserve draft and block blind overwrite until latest settings are explicitly loaded', async () => {
  const h = harness(); h.edit('name', '내가 작성 중'); h.emit({ ...DEFAULT_EVENT_INFO, name: '다른 탭에서 저장' });
  assert.equal(h.elements.get('event-name').value, '내가 작성 중'); assert.match(h.text(), /다른 화면/);
  assert.equal(h.elements.get('event-save').disabled, true); await h.submit(); assert.equal(h.calls.length, 0);
  const reopened = harness({ session: h.session, event: { ...DEFAULT_EVENT_INFO, name: '다른 탭에서 저장' } });
  assert.match(reopened.text(), /다른 화면/); assert.equal(reopened.elements.get('event-name').value, '내가 작성 중');
  reopened.elements.get('event-reload').onclick(); assert.equal(reopened.elements.get('event-name').value, '다른 탭에서 저장');
  assert.equal(reopened.elements.get('event-save').disabled, false); assert.equal(reopened.session.has(pendingKey), false);
});

test('invalid event input and session storage failure cannot make a false saved claim', async () => {
  const h = harness(); h.edit('name', ''); await h.submit(); assert.equal(h.calls.length, 0); assert.match(h.text(), /행사명/);
  const quota = harness({ failStorage: true }); quota.edit('name', '남아 있는 입력');
  assert.match(quota.text(), /임시 보관하지 못했습니다/); assert.equal(quota.unload(), true);
  assert.equal(quota.elements.get('event-name').value, '남아 있는 입력');
});

test('cover and end escape all event fields, omit empty metadata, and use neutral event defaults', () => {
  const event = { name: '<이름>&"', date: '2026-10-24', venue: '<장소>', message: '<script>안내</script>' };
  for (const phase of ['cover', 'end']) {
    const html = renderQuizStage({ phase, event });
    assert.match(html, /&lt;이름&gt;&amp;&quot;/); assert.match(html, /2026\.10\.24/); assert.match(html, /&lt;장소&gt;/);
    assert.match(html, /&lt;script&gt;안내&lt;\/script&gt;/); assert.doesNotMatch(html, /<script>|대한전기학회|왼손|오른손/);
    assert.doesNotMatch(renderQuizStage({ phase }), /event-details|대한전기학회/);
  }
});

test('gestures remain attached to O and X choices when display order reverses, including answer and no-timer questions', () => {
  for (const phase of ['question', 'answer']) for (const left of ['O', 'X']) {
    const state = { ...createState(bank), phase, left, deadline: null, remaining: 5 };
    const html = renderQuizStage(makePublicView(state));
    const hands = new Map([...html.matchAll(/<div class="hand ([OX]) [^"]*">([\s\S]*?)<\/div>/g)].map(([, choice, body]) => [choice, body]));
    assert.match(hands.get('O'), /전력<\/b><span>주먹<\/span>/);
    assert.match(hands.get('X'), /전기<\/b><span>보자기<\/span>/);
    assert.doesNotMatch(html, /왼손|오른손/);
    assert.equal(html.indexOf('class="hand O') < html.indexOf('class="hand X'), left === 'O');
  }
  const singing = { ...createState([{ ...bank[0], timerMode: 'manual' }]), phase: 'question', remaining: null };
  assert.doesNotMatch(renderQuizStage(makePublicView(singing)), /class="timer/);
  assert.match(renderQuizStage({ phase: 'cover' }), /O는 주먹, X는 보자기/);
  assert.doesNotMatch(shell, /왼손|오른손/);
});

test('real transport carries immutable event metadata and only applies event actions on acknowledgement', async () => {
  const ack = deferred(), seen = [];
  const envelope = (revision, event) => ({ revision, bankVersion: 1, serverNow: 1000, bank, state: createState(bank), event });
  const response = value => ({ status: 200, ok: true, json: async () => value });
  const actions = [];
  const client = createCloudTransport({ onState: (_state, meta) => seen.push(meta),
    fetch: async (path, options) => { if (path.includes('/action')) { actions.push(JSON.parse(options.body)); return ack.promise; } return response(envelope(1, DEFAULT_EVENT_INFO)); },
    now: () => 1000, setTimeout: () => 1, clearTimeout() {}, commandId: () => 'event-command',
  });
  await client.connect(); seen[0].event.name = '외부 변경'; assert.equal(client.state.event.name, DEFAULT_EVENT_INFO.name);
  const event = { ...DEFAULT_EVENT_INFO, name: 'ACK 이후 행사' }, saving = client.send({ type: 'event', event });
  assert.equal(client.state.event.name, DEFAULT_EVENT_INFO.name);
  ack.resolve(response(envelope(2, event))); const result = await saving;
  assert.equal(result.event.name, event.name); assert.equal(client.state.event.name, event.name);
  assert.equal(actions[0].action.type, 'event'); assert.equal(actions[0].revision, 1); client.destroy();
});

test('presenter skips rebuilding unchanged stage HTML on 100ms ticks but still updates revision and displayed timer seconds', () => {
  const h = harness(), initial = h.renderCount;
  for (let index = 0; index < 5; index++) h.tick(100);
  assert.equal(h.renderCount, initial);
  h.emit(); assert.equal(h.renderCount, initial + 1);
  h.setPhase('question', { deadline: 11500, remaining: 10 }); const shown = h.renderCount;
  h.tick(500); assert.equal(h.renderCount, shown);
  h.tick(600); assert.equal(h.renderCount, shown + 1); assert.match(h.preview(), /9초/);
});
