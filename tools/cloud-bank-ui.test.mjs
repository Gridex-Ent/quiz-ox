import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createState, transition, validateQuestions } from '../web/src/quiz/manual-model.js';
import { restoreQuestionDraft } from '../web/src/quiz/question-storage.js';
import { DEFAULT_EVENT_INFO } from '../web/src/quiz/event-info.js';

const clone = value => structuredClone(value);
const draftKey = 'ox-banquet-cloud-draft-v1';
const bank = validateQuestions(Array.from({ length: 31 }, (_, i) => ({
  text: `기존 문제 ${i + 1}`, answer: i % 2 ? 'O' : 'X', choiceO: 'O', choiceX: 'X', seconds: 10,
  explanation: `기존 해설 ${i + 1}`, category: '상식', note: `보존할 메모 ${i + 1}`,
})));
const candidate = index => ({ text: `candidate-sentinel-for-bank-only ${index}`, answer: 'O', choiceO: 'O', choiceX: 'X', seconds: 10, explanation: `후보 해설 ${index}`, category: '수학' });
const catalog = Array.from({ length: 70 }, (_, i) => ({ id: `catalog-test-${i + 1}`, ...candidate(i + 1) }));
const shell = readFileSync(new URL('../web/host-shell.html', import.meta.url), 'utf8');
const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../web/src/quiz/presenter.js', import.meta.url))],
  bundle: true, format: 'iife', write: false,
  plugins: [{ name: 'controlled-bank-and-cloud', setup(builder) {
    builder.onResolve({ filter: /\/cloud\/transport\.js$/ }, () => ({ path: 'cloud', namespace: 'controlled-bank' }));
    builder.onResolve({ filter: /question-bank\.js$/ }, () => ({ path: 'bank', namespace: 'controlled-bank' }));
    builder.onResolve({ filter: /catalog\.json$/ }, () => ({ path: 'catalog', namespace: 'controlled-bank' }));
    builder.onLoad({ filter: /.*/, namespace: 'controlled-bank' }, args => ({ loader: 'js', contents:
      args.path === 'cloud' ? 'export const createCloudTransport = options => globalThis.__makeCloud(options);' :
      args.path === 'bank' ? 'export const createQuestionBank = options => globalThis.__makeQuestionBank(options);' :
      `export default ${JSON.stringify(catalog)};`,
    }));
  } }],
});
const bundle = bundled.outputFiles[0].text;
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

function harness({ saveBank, local = new Map(), failStorage = false } = {}) {
  const elements = new Map([...shell.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(([tag, id]) => [id, {
    innerHTML: '', textContent: '', value: '', disabled: false, hidden: /\bhidden\b/.test(tag),
    scrollIntoView() {}, focus() {}, replaceChildren(...children) { this.children = children; },
    querySelector(selector) { this.fields ||= new Map(); if (!this.fields.has(selector)) this.fields.set(selector, { value: '', textContent: '', disabled: false }); return this.fields.get(selector); },
  }]));
  for (const id of ['cloud-status', 'cloud-error', 'cloud-login', 'cloud-current', 'cloud-screen-link', 'cloud-screen-url', 'cloud-copy-link', 'cloud-logout']) elements.set(id, { textContent: '', value: '', hidden: false });
  elements.get('event-data').textContent = JSON.stringify(bank);
  elements.get('prize-data').textContent = JSON.stringify({ imageData: 'data:image/png;base64,YQ==', imageAlt: '가상 상품' });
  elements.get('asset-updates').textContent = '[]';
  const listeners = new Map(), calls = [], session = new Map();
  let callbacks, controller, revision = 1, bankVersion = 1, refreshes = 0;
  let currentState = { ...createState(bank), phase: 'question', index: 4, deadline: 7000 };
  const meta = () => ({ revision, bankVersion, prizeVersion: 0, offsetMs: 0, serverNow: 1000, event: clone(DEFAULT_EVENT_INFO), audio: { muted: false, music: true, volume: .35 }, screenPath: '' });
  const connection = busy => callbacks.onConnection({ connected: true, busy, authenticated: true });
  const emit = () => { revision++; callbacks.onState(clone(currentState), meta()); };
  const context = vm.createContext({
    document: { body: { dataset: { cloud: 'presenter' } }, getElementById(id) { assert(elements.has(id), `shell missing ${id}`); return elements.get(id); }, querySelectorAll: () => [] },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    localStorage: { getItem: key => local.get(key) ?? null, setItem(key, value) { if (failStorage) throw Error('quota'); local.set(key, value); } },
    sessionStorage: { getItem: key => session.get(key) ?? null, setItem: (key, value) => session.set(key, value), removeItem: key => session.delete(key) },
    Option: function (text, value) { this.text = text; this.value = value; }, structuredClone, URL,
    location: { href: 'https://quiz.invalid/presenter' }, Date: class extends Date { static now() { return 1000; } },
    setInterval() {}, setTimeout() {}, confirm: () => true,
    __makeQuestionBank(options) { controller = options; return { refresh() { refreshes++; } }; },
    __makeCloud(options) {
      callbacks = options;
      return { connect: async () => { connection(false); emit(); },
        async send(action) { calls.push(clone(action)); return meta(); },
        async saveBank(questions) {
          calls.push({ type: 'apply', questions: clone(questions) }); connection(true);
          try {
            await saveBank?.(clone(questions));
            currentState = transition(currentState, { type: 'apply', questions }, 1000); bankVersion++; emit();
            return meta();
          } finally { connection(false); }
        },
      };
    },
  });
  vm.runInContext(bundle, context);
  return {
    elements, calls, local,
    get state() { return clone(currentState); },
    get controller() { return controller; },
    get refreshes() { return refreshes; },
    click(id) { return elements.get(id).onclick(); },
    edit(index, key, value) { elements.get('editor').oninput({ target: { dataset: { i: String(index), key }, value } }); },
    import(index = 1) { const questions = [...controller.getDraft(), candidate(index)]; return controller.onImport({ questions, added: 1, skipped: 0 }); },
    storedDraft() { const saved = JSON.parse(local.get(draftKey)); return restoreQuestionDraft(saved, saved.questions); },
    key(key) { let prevented = false; listeners.get('keydown')({ key, target: { tagName: 'DIV' }, preventDefault() { prevented = true; } }); return prevented; },
  };
}

test('question-bank navigation from settings and preparation preserves the live game and ignores advance keys', () => {
  const h = harness(), before = h.state;
  h.click('event-nav'); h.click('event-bank-open');
  assert.equal(h.elements.get('bank-page').hidden, false);
  for (const page of ['quiz-page', 'event-page', 'runbook-page', 'recipients-page']) assert.equal(h.elements.get(page).hidden, true);
  assert.equal(h.controller.catalog.length, 70);
  assert.equal(h.key('PageDown'), false); assert.equal(h.key(' '), false);
  assert.deepEqual(h.state, before); assert.equal(h.calls.length, 0);
  const originalController = h.controller;
  h.click('bank-back'); h.click('prep-bank-open');
  assert.equal(h.controller, originalController); assert.equal(h.refreshes, 2);
  h.controller.onEdit();
  assert.equal(h.elements.get('bank-page').hidden, true); assert.equal(h.elements.get('quiz-page').hidden, false);
  assert.equal(h.elements.get('question-prep').open, true);
});

test('import appends to and preserves even an incomplete edit without replacing the confirmed 31-question bank', () => {
  const h = harness(); h.edit(0, 'text', ''); h.edit(2, 'explanation', '아직 작성 중인 해설'); h.click('bank-nav');
  const before = clone(h.controller.getDraft()); h.import();
  assert.deepEqual(clone(h.controller.getDraft()).slice(0, 31), before);
  assert.equal(h.controller.getDraft().length, 32); assert.equal(h.controller.getDraft()[0].text, '');
  assert.equal(h.storedDraft().length, 32); assert.equal(h.storedDraft()[2].explanation, '아직 작성 중인 해설');
  assert.deepEqual(JSON.parse(h.local.get(draftKey)).questions, bank);
  assert.deepEqual(h.state.questions, bank); assert.equal(h.elements.get('question-select').children.length, 31);
  assert.equal(h.calls.length, 0);
});

test('imported questions become the confirmed bank and dropdown only after an explicit save ACK', async () => {
  const ack = deferred(), h = harness({ saveBank: () => ack.promise }); h.click('bank-nav'); h.import();
  const saving = h.click('apply-top');
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].type, 'apply');
  assert.equal(h.elements.get('question-select').children.length, 31); assert.deepEqual(h.state.questions, bank);
  ack.resolve(); await saving;
  assert.equal(h.elements.get('question-select').children.length, 32);
  assert.deepEqual(h.state.questions.slice(0, 31), bank); assert.equal(h.state.questions[31].seconds, 10);
  assert.equal(h.state.phase, 'ready'); assert.equal(h.state.index, 0);
  assert.equal(h.storedDraft().length, 32); assert.match(h.elements.get('edit-status').textContent, /클라우드에 저장했습니다/);
});

test('a failed cloud save retains imported draft questions and the original confirmed bank for retry', async () => {
  const h = harness({ saveBank: async () => { throw Error('저장 연결 실패'); } }); h.click('bank-nav'); h.import();
  await h.click('apply-top');
  assert.match(h.elements.get('edit-status').textContent, /저장 연결 실패/);
  assert.equal(h.controller.getDraft().length, 32); assert.equal(h.storedDraft().length, 32);
  assert.deepEqual(h.state.questions, bank); assert.equal(h.elements.get('question-select').children.length, 31);
  const reloaded = harness({ local: h.local }); reloaded.click('bank-nav');
  assert.equal(reloaded.controller.getDraft().length, 32); assert.equal(reloaded.controller.getDraft()[31].text, candidate(1).text);
});

test('an import made during a pending save ACK is kept as a follow-up edit and can be saved next', async () => {
  const ack = deferred(); let saves = 0;
  const h = harness({ saveBank: () => ++saves === 1 ? ack.promise : undefined }); h.click('bank-nav'); h.import(1);
  const saving = h.click('apply-top'); h.import(2); ack.resolve(); await saving;
  assert.equal(h.state.questions.length, 32); assert.equal(h.controller.getDraft().length, 33);
  assert.equal(h.storedDraft().length, 33); assert.match(h.elements.get('edit-status').textContent, /저장 중 추가한 편집/);
  await h.click('apply-top');
  assert.equal(h.state.questions.length, 33); assert.equal(h.elements.get('question-select').children.length, 33);
  assert.deepEqual(h.state.questions.slice(0, 31), bank);
});

test('local quota failure reports an unpersisted import without dropping it or touching the server bank', () => {
  const h = harness({ failStorage: true }); h.click('bank-nav');
  assert.throws(() => h.import(), /브라우저에 보관하지 못했으니/);
  assert.equal(h.controller.getDraft().length, 32); assert.equal(h.calls.length, 0); assert.deepEqual(h.state.questions, bank);
});

test('the full candidate catalog is bundled only into the authenticated presenter, not the screen client', async () => {
  const screen = await build({ entryPoints: [fileURLToPath(new URL('../web/src/cloud/screen.js', import.meta.url))], bundle: true, format: 'iife', write: false });
  assert.match(bundle, /candidate-sentinel-for-bank-only/);
  assert.doesNotMatch(screen.outputFiles[0].text, /candidate-sentinel-for-bank-only|catalog-test-70|문제은행에서 문제 선택하기/);
});
