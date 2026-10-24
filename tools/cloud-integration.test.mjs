import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { build } from 'esbuild';
import { createState } from '../web/src/quiz/manual-model.js';

// Exercise the actual presenter controller. Only the network and recipient/runbook
// DOM adapters are replaced so responses can arrive in a deliberately bad order.
// Prize editing has its own real-module tests and is outside these recipient races.
const adapters = {
  '../cloud/transport.js': 'export const createCloudTransport = options => globalThis.__integration.createTransport(options);',
  './recipients.js': 'export const createRecipientBook = options => globalThis.__integration.mountRecipients(options);',
  './runbook.js': 'export const createRunbook = options => globalThis.__integration.mountRunbook(options);',
  './prize-settings.js': 'export const createPrizeSettings = () => ({accept(){},setConnection(){},hasPending:false,destroy(){}});',
};
const built = await build({
  entryPoints: [fileURLToPath(new URL('../web/src/quiz/presenter.js', import.meta.url))],
  bundle: true, format: 'iife', write: false,
  plugins: [{
    name: 'controlled-ui-boundaries',
    setup(builder) {
      builder.onResolve({ filter: /(?:transport|recipients|runbook|prize-settings)\.js$/ }, args =>
        adapters[args.path] ? { path: args.path, namespace: 'controlled-adapter' } : undefined);
      builder.onLoad({ filter: /.*/, namespace: 'controlled-adapter' }, args => ({ contents: adapters[args.path] }));
    },
  }],
});
const bundle = built.outputFiles[0].text;
const shell = readFileSync(new URL('../web/host-shell.html', import.meta.url), 'utf8');
const question = { text: '진행 상태 확인 문제', answer: 'O', seconds: 10, explanation: '비공개 해설' };
const pendingKey = 'ox-cloud-recipient-pending-v1';
const cacheKey = 'ox-cloud-recipient-cache-v1';
const turn = () => new Promise(resolve => setImmediate(resolve));
const json = value => JSON.parse(JSON.stringify(value));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function storage(map) {
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key) };
}
function harness({ sharedLocal = new Map(), session = new Map() } = {}) {
  const ids = [...shell.matchAll(/id="([^"]+)"/g)].map(match => match[1]);
  ids.push('cloud-status', 'cloud-error', 'cloud-login', 'cloud-current', 'cloud-screen-link', 'cloud-screen-url', 'cloud-copy-link', 'cloud-logout', 'cloud-recipient-recovery', 'cloud-recipient-draft-backup', 'cloud-recipient-draft-restore');
  const elements = new Map(ids.map(id => [id, {
    hidden: false, disabled: false, innerHTML: '', textContent: '', value: '', dataset: {},
    replaceChildren(...children) { this.children = children; }, scrollIntoView() {},
  }]));
  elements.get('event-data').textContent = JSON.stringify([question]);
  elements.get('prize-data').textContent = JSON.stringify({ imageData: 'data:image/png;base64,YQ==', imageAlt: '상품' });
  elements.get('asset-updates').textContent = '[]';
  elements.get('recipients-page').hidden = true;
  elements.get('runbook-page').hidden = true;
  const listeners = new Map(), loads = [], saves = [], commands = [], books = [], runbooks = [];
  const meta = { revision: 1, bankVersion: 1, offsetMs: 0, audio: { muted: false, music: true, volume: 0.35 }, screenPath: '/screen#key=test' };
  const context = vm.createContext({
    __integration: {
      createTransport(hooks) {
        return {
          connect() {
            hooks.onConnection({ connected: true, busy: false, authenticated: true });
            hooks.onState(createState([question]), meta);
            return Promise.resolve(meta);
          },
          loadRecipients() { const reply = deferred(); loads.push(reply); return reply.promise; },
          saveRecipients(records, revision) { const reply = deferred(); saves.push({ records: json(records), revision, ...reply }); return reply.promise; },
          send(action) { const reply = deferred(); commands.push({ action: json(action), ...reply }); return reply.promise; },
        };
      },
      mountRecipients(options) {
        const book = {
          initial: JSON.parse(options.storage.getItem('recipient-book')), pending: options.pending,
          state: { saved: !options.pending }, destroyed: false,
          destroy() { this.destroyed = true; },
          save(value) {
            options.storage.setItem('recipient-book', JSON.stringify(value));
            return options.onSave(value);
          },
          importJson(value) { return this.save(JSON.parse(value)); },
        };
        books.push(book); return book;
      },
      mountRunbook() { const book = { render() {} }; runbooks.push(book); return book; },
    },
    document: {
      body: { dataset: { cloud: 'presenter' } },
      getElementById(id) { assert.ok(elements.has(id), `unknown presenter element: ${id}`); return elements.get(id); },
      querySelectorAll() { return []; },
    },
    window: { addEventListener(name, callback) { listeners.set(name, callback); } },
    localStorage: storage(sharedLocal), sessionStorage: storage(session),
    Option: function(text, value) { this.text = text; this.value = value; },
    structuredClone, URL, location: { href: 'https://quiz.example/presenter' },
    setInterval() {}, setTimeout() {}, clearInterval() {}, clearTimeout() {}, confirm: () => true,
  });
  vm.runInContext(bundle, context);
  return {
    elements, session, sharedLocal, loads, saves, commands, books, runbooks,
    click(id) { assert.equal(elements.get(id).disabled, false, id); elements.get(id).onclick(); },
    async openRecipients(revision = 3, records = []) {
      const before = loads.length; this.click('recipients-nav'); await turn();
      assert.equal(loads.length, before + 1);
      loads.at(-1).resolve({ revision, records }); await turn();
      return books.at(-1);
    },
    beforeUnload() {
      let prevented = false;
      listeners.get('beforeunload')({ preventDefault() { prevented = true; } });
      return prevented;
    },
  };
}
const entry = name => ({ version: 1, recipients: [{ rank: 1, slot: 1, name, phone: '010-0000-0000' }] });

test('recipient response arriving after exit cannot mount a hidden page', async () => {
  const h = harness();
  h.click('recipients-nav'); await turn();
  h.click('recipients-back');
  h.loads[0].resolve({ revision: 3, records: [] }); await turn();
  assert.equal(h.books.length, 0);
  assert.equal(h.elements.get('quiz-page').hidden, false);
  assert.equal(h.elements.get('recipients-page').hidden, true);
});

test('returning while an old recipient load is pending starts a fresh load', async () => {
  const h = harness();
  h.click('recipients-nav'); await turn();
  h.click('recipients-back'); h.click('recipients-nav');
  h.loads[0].resolve({ revision: 3, records: entry('오래된 명단').recipients }); await turn();
  assert.equal(h.books.length, 0);
  assert.equal(h.loads.length, 2);
  h.loads[1].resolve({ revision: 4, records: entry('최신 명단').recipients }); await turn();
  assert.equal(h.books.length, 1);
  assert.equal(h.books[0].initial.recipients[0].name, '최신 명단');
});

test('transient recipient failure retries after checking the unchanged server revision', async () => {
  const h = harness(), book = await h.openRecipients(3);
  const failed = book.save(entry('보관할 입력'));
  const failure = assert.rejects(failed, /연결 중단/);
  await turn(); h.saves[0].reject(Error('연결 중단')); await failure;
  assert.ok(h.session.has(pendingKey));
  const retry = book.save(entry('재시도 입력')); await turn();
  assert.equal(h.saves.length, 1, 'retry waits for a fresh revision read');
  h.loads[1].resolve({ revision: 3, records: [] }); await turn();
  assert.equal(h.saves.length, 2);
  assert.equal(h.saves[1].revision, 3);
  assert.equal(h.saves[1].records[0].name, '재시도 입력');
  h.saves[1].resolve({ revision: 4 }); await retry;
  assert.equal(h.session.has(pendingKey), false);
  assert.equal(h.beforeUnload(), false);
});

test('recipient retry preserves the draft when another presenter changed the server', async () => {
  const h = harness(), book = await h.openRecipients(3);
  const first = assert.rejects(book.save(entry('보관할 입력')), /연결 중단/);
  await turn(); h.saves[0].reject(Error('연결 중단')); await first;
  const retry = assert.rejects(book.save(entry('재시도 입력')), /서버의 명단이 달라졌습니다/);
  await turn(); h.loads[1].resolve({ revision: 4, records: entry('다른 진행자').recipients });
  await retry;
  assert.equal(h.saves.length, 1, 'newer server records cannot be overwritten by retry');
  assert.equal(JSON.parse(h.session.get(pendingKey)).value.recipients[0].name, '재시도 입력');
  assert.equal(h.beforeUnload(), true);
});

test('two presenter tabs keep independent recipient drafts and acknowledgements', async () => {
  const sharedLocal = new Map(), a = harness({ sharedLocal }), b = harness({ sharedLocal });
  const aBook = await a.openRecipients(7), bBook = await b.openRecipients(7);
  const aSave = aBook.save(entry('A 진행자'));
  const bFailure = assert.rejects(bBook.save(entry('B 진행자')), /다른 기기/);
  await turn();
  a.saves[0].resolve({ revision: 8 }); await aSave;
  b.saves[0].reject(Error('다른 기기에서 변경되었습니다.')); await bFailure;
  assert.equal(a.session.has(pendingKey), false);
  assert.equal(JSON.parse(b.session.get(pendingKey)).value.recipients[0].name, 'B 진행자');
  assert.equal(JSON.parse(a.session.get(cacheKey)).recipients[0].name, 'A 진행자');
  assert.equal(JSON.parse(b.session.get(cacheKey)).recipients[0].name, 'B 진행자');
  assert.equal(sharedLocal.has(pendingKey), false);
  assert.equal(sharedLocal.has(cacheKey), false);
  assert.equal(a.beforeUnload(), false);
  assert.equal(b.beforeUnload(), true);
});

test('late runbook pause acknowledgement cannot undo newer page navigation', async () => {
  const h = harness(), book = await h.openRecipients();
  h.click('runbook-nav');
  assert.equal(h.commands[0].action.type, 'pause');
  h.click('recipients-back');
  h.commands[0].resolve({ revision: 2 }); await turn();
  assert.equal(book.destroyed, true);
  assert.equal(h.runbooks.length, 0);
  assert.equal(h.elements.get('quiz-page').hidden, false);
  assert.equal(h.elements.get('runbook-page').hidden, true);
});
