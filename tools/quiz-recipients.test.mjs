import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecipientBook } from '../web/src/quiz/recipients.js';

const KEY = 'ox-banquet-recipients-v1';
const QUIZ_KEY = 'ox-banquet-standalone-v1';
const tiers = Array.from({ length: 7 }, (_, i) => ({ rank: i + 1, label: `검증 상품 ${i + 1}`, people: i + 1 }));
function harness(saved, { failWrites = false, onSave, remote = false, pending = false } = {}) {
  const values = new Map([[QUIZ_KEY, '{"questions":[{"text":"검증 문제"}]}']]);
  if (saved !== undefined) values.set(KEY, saved);
  const writes = [], reads = [], statuses = [];
  const status = { textContent: '', dataset: {} }, progress = { textContent: '' };
  const root = { innerHTML: '', querySelector: selector => selector === '.recipient-status' ? status : selector === '.recipient-progress' ? progress : null };
  const storage = {
    getItem(key) { reads.push(key); return values.get(key) ?? null; },
    setItem(key, value) { if (failWrites) throw Error('quota'); writes.push([key, value]); values.set(key, value); },
  };
  const book = createRecipientBook({ root, tiers, storage, onSave, remote, pending, onStatus: value => statuses.push(value) });
  return {
    root, book, values, writes, reads, statuses, status,
    edit(index, field, value) { root.oninput({ target: { dataset: { recipientIndex: String(index), recipientField: field }, value } }); },
    allowWrites() { failWrites = false; },
    retry() { root.onclick({ target: { dataset: { recipientAction: 'retry' } } }); },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flushPromises = () => new Promise(resolve => setImmediate(resolve));
function csvRows(source) {
  const rows = []; let row = [], field = '', quoted = false;
  const text = source.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && [',', '\r', '\n'].includes(char)) {
      row.push(field); field = '';
      if (char !== ',') { rows.push(row); row = []; if (char === '\r' && text[i + 1] === '\n') i++; }
    } else field += char;
  }
  return rows;
}

test('seven prize groups create 28 blank recipient slots without writing storage on mount', () => {
  const h = harness();
  assert.equal(h.book.snapshot.recipients.length, 28);
  assert.ok(h.book.snapshot.recipients.every(row => row.name === '' && row.phone === ''));
  assert.equal((h.root.innerHTML.match(/data-recipient-field=/g) || []).length, 56);
  assert.match(h.root.innerHTML, /현재 브라우저에만/); assert.match(h.root.innerHTML, /프로젝션에는 표시되지/);
  assert.equal(h.writes.length, 0); assert.deepEqual(h.reads, [KEY]);
});

test('name and phone persist as strings under only the independent recipient key and restore', () => {
  const h = harness(), originalQuiz = h.values.get(QUIZ_KEY);
  h.edit(0, 'name', '검증가'); h.edit(0, 'phone', '000-0000-0000');
  h.edit(27, 'name', '검증나'); h.edit(27, 'phone', '00000000000');
  assert.ok(h.writes.every(([key]) => key === KEY)); assert.equal(h.values.get(QUIZ_KEY), originalQuiz);
  assert.equal(h.book.state.saved, true); assert.equal(h.book.state.filled, 2);
  const reopened = harness(h.values.get(KEY));
  assert.deepEqual(reopened.book.snapshot, h.book.snapshot); assert.equal(reopened.writes.length, 0);
  assert.equal(reopened.book.snapshot.recipients[27].phone, '00000000000');
});

test('remote recipients remain pending until cloud acknowledgement while preserving a local backup', async () => {
  const pending = deferred(), sent = [];
  const h = harness(undefined, { remote: true, onSave: value => { sent.push(value); return pending.promise; } });
  h.edit(0, 'name', '가상 검증수령자'); h.edit(0, 'phone', '000-0000-0000');
  assert.equal(h.book.state.saved, false); assert.match(h.status.textContent, /저장 중/);
  assert.equal(JSON.parse(h.values.get(KEY)).recipients[0].phone, '000-0000-0000');
  await flushPromises(); assert.equal(sent.at(-1).recipients[0].phone, '000-0000-0000');
  sent.at(-1).recipients[0].name = '외부 객체 변경';
  assert.equal(h.book.snapshot.recipients[0].name, '가상 검증수령자');
  pending.resolve(); await flushPromises();
  assert.equal(h.book.state.saved, true); assert.equal(h.status.textContent, '클라우드에 저장했습니다.');
  assert.match(h.root.innerHTML, /인증된 클라우드 진행실/); assert.match(h.root.innerHTML, /클라우드에 다시 저장/);
});

test('remote save failure keeps edited rows and backup then an explicit retry can succeed', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const h = harness(undefined, { remote: true, onSave: () => (++calls === 1 ? first.promise : second.promise) });
  h.edit(0, 'name', '가상 실패복구'); await flushPromises(); first.reject(Error('서버 저장 실패')); await flushPromises();
  assert.equal(h.book.state.saved, false); assert.match(h.book.state.error, /서버 저장 실패/);
  assert.match(h.status.textContent, /이 기기에 보관/);
  assert.equal(h.book.snapshot.recipients[0].name, '가상 실패복구');
  assert.equal(JSON.parse(h.book.exportJson()).recipients[0].name, '가상 실패복구');
  h.retry(); await flushPromises(); second.resolve(); await flushPromises();
  assert.equal(h.book.state.saved, true); assert.equal(h.book.state.error, ''); assert.equal(calls, 2);
});

test('an older acknowledgement cannot mark later edits saved or overwrite their later failure', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const h = harness(undefined, { remote: true, onSave: () => (++calls === 1 ? first.promise : second.promise) });
  h.edit(0, 'name', '가상 처음입력'); await flushPromises();
  h.edit(0, 'name', '가상 나중입력'); await flushPromises();
  first.resolve(); await flushPromises();
  assert.equal(h.book.state.saved, false); assert.match(h.status.textContent, /저장 중/);
  second.reject(Error('나중 입력 저장 실패')); await flushPromises();
  assert.equal(h.book.state.saved, false); assert.match(h.book.state.error, /나중 입력 저장 실패/);
  assert.equal(h.book.snapshot.recipients[0].name, '가상 나중입력');
  assert.equal(JSON.parse(h.values.get(KEY)).recipients[0].name, '가상 나중입력');
});

test('late failure from an earlier edit cannot replace a newer successful acknowledgement', async () => {
  const first = deferred(), second = deferred(); let calls = 0;
  const h = harness(undefined, { remote: true, onSave: () => (++calls === 1 ? first.promise : second.promise) });
  h.edit(0, 'name', '가상 이전입력'); await flushPromises(); h.edit(0, 'phone', '00000000000'); await flushPromises();
  second.resolve(); await flushPromises(); assert.equal(h.book.state.saved, true);
  first.reject(Error('이전 요청 실패')); await flushPromises();
  assert.equal(h.book.state.saved, true); assert.equal(h.book.state.error, '');
  assert.equal(h.status.textContent, '클라우드에 저장했습니다.');
  assert.equal(h.book.snapshot.recipients[0].phone, '00000000000');
});

test('an earlier acknowledgement cannot mark a same-revision retry saved before its own acknowledgement', async () => {
  const first = deferred(), retry = deferred(); let calls = 0;
  const h = harness(undefined, { remote: true, onSave: () => (++calls === 1 ? first.promise : retry.promise) });
  h.edit(0, 'name', '가상 동일입력 재시도'); await flushPromises();
  h.retry(); await flushPromises(); first.resolve(); await flushPromises();
  assert.equal(h.book.state.saved, false); assert.match(h.status.textContent, /저장 중/);
  retry.reject(Error('현재 재시도 저장 실패')); await flushPromises();
  assert.equal(h.book.state.saved, false); assert.match(h.book.state.error, /현재 재시도 저장 실패/);
  assert.equal(h.book.snapshot.recipients[0].name, '가상 동일입력 재시도');
  assert.equal(JSON.parse(h.values.get(KEY)).recipients[0].name, '가상 동일입력 재시도');
});

test('a failed earlier attempt cannot overwrite a successful same-revision retry', async () => {
  const first = deferred(), retry = deferred(); let calls = 0;
  const h = harness(undefined, { remote: true, onSave: () => (++calls === 1 ? first.promise : retry.promise) });
  h.edit(0, 'name', '가상 동일입력 성공'); await flushPromises();
  h.retry(); await flushPromises(); retry.resolve(); await flushPromises();
  assert.equal(h.book.state.saved, true); assert.equal(h.book.state.error, '');
  first.reject(Error('이전 시도만 실패')); await flushPromises();
  assert.equal(h.book.state.saved, true); assert.equal(h.book.state.error, '');
  assert.equal(h.status.textContent, '클라우드에 저장했습니다.');
});

test('remote pending backup restores without automatically sending it and destroyed books ignore late acknowledgements', async () => {
  const seed = harness(); seed.edit(0, 'name', '가상 보관입력');
  const saving = deferred(); let calls = 0;
  const h = harness(seed.values.get(KEY), { remote: true, pending: true, onSave: () => { calls++; return saving.promise; } });
  assert.equal(h.book.state.saved, false); assert.match(h.root.innerHTML, /전송하지 못한 입력을 복원/);
  await flushPromises(); assert.equal(calls, 0); assert.equal(h.writes.length, 0);
  h.retry(); await flushPromises(); const statusBeforeDestroy = h.status.textContent;
  h.book.destroy(); saving.resolve(); await flushPromises();
  assert.equal(h.status.textContent, statusBeforeDestroy); assert.equal(h.book.state.saved, false);
  assert.equal(JSON.parse(h.book.exportJson()).recipients[0].name, '가상 보관입력');
});

test('JSON backup preserves raw text, imports all slots, and snapshots cannot mutate the book', () => {
  const h = harness(); h.edit(0, 'name', '검증가'); h.edit(0, 'phone', '00000000000');
  const backup = h.book.exportJson(), other = harness();
  assert.equal(other.book.importJson(backup), true); assert.deepEqual(other.book.snapshot, h.book.snapshot);
  const copy = other.book.snapshot; copy.recipients[0].phone = '000';
  assert.equal(other.book.snapshot.recipients[0].phone, '00000000000');
  assert.equal(JSON.parse(other.values.get(KEY)).recipients[0].phone, '00000000000');
});

test('corrupt stored JSON is not overwritten until an explicit new edit recovers it', () => {
  const corrupt = '{"version":1,"recipients":[';
  const h = harness(corrupt);
  assert.equal(h.book.state.restoreError, true); assert.equal(h.values.get(KEY), corrupt); assert.equal(h.writes.length, 0);
  assert.match(h.root.innerHTML, /기존 저장값은 보존/);
  h.edit(0, 'name', '검증 복구');
  assert.equal(h.book.state.restoreError, false); assert.equal(h.book.state.saved, true);
  assert.equal(JSON.parse(h.values.get(KEY)).recipients[0].name, '검증 복구');
});

test('invalid imports leave both current in-memory names and existing saved JSON intact', () => {
  const h = harness(); h.edit(0, 'name', '검증가'); h.edit(0, 'phone', '00000000000');
  const good = h.book.snapshot, saved = h.values.get(KEY);
  const duplicate = structuredClone(good); duplicate.recipients[1] = { ...duplicate.recipients[0] };
  const numeric = structuredClone(good); numeric.recipients[0].phone = 0;
  const unknownSlot = structuredClone(good); unknownSlot.recipients[0].rank = 99;
  const long = structuredClone(good); long.recipients[0].name = '검'.repeat(101);
  for (const invalid of ['{', JSON.stringify({ version: 2, recipients: [] }), JSON.stringify(duplicate), JSON.stringify(numeric), JSON.stringify(unknownSlot), JSON.stringify(long), ' '.repeat(100001)]) {
    assert.equal(h.book.importJson(invalid), false);
    assert.deepEqual(h.book.snapshot, good); assert.equal(h.values.get(KEY), saved);
  }
  assert.match(h.book.state.error, /변경하지 않았/);
});

test('CSV quotes commas newlines and quotes, protects formulas, and keeps original zero-prefixed phones in JSON', () => {
  const h = harness(), data = h.book.snapshot;
  const rawName = '검증, "가"\n검증나';
  data.recipients[0] = { ...data.recipients[0], name: rawName, phone: '00000000000' };
  for (const [i, name] of ['=1+1', ' +1', '-1', '@검증', '\t=1', '\r=1', '＝1', "'=1", '"=1'].entries()) data.recipients[i + 1].name = name;
  data.recipients[1].phone = '=1+1';
  assert.equal(h.book.importJson(JSON.stringify(data)), true);
  const csv = h.book.exportCsv(), output = csvRows(csv);
  assert.equal(csv.charCodeAt(0), 0xfeff); assert.equal(output.length, 29);
  assert.equal(output[1][3], rawName); assert.equal(output[1][4], "'00000000000");
  assert.ok(output.slice(2, 11).every(row => row[3].startsWith('\t')));
  assert.equal(output[2][4], "\t'=1+1");
  assert.equal(JSON.parse(h.book.exportJson()).recipients[0].phone, '00000000000');
  assert.equal(JSON.parse(h.book.exportJson()).recipients[1].phone, '=1+1');
});

test('a failed autosave retains editable data and backup access, then recovers on a later edit', () => {
  const h = harness(undefined, { failWrites: true }); h.edit(0, 'name', '검증가');
  assert.equal(h.book.state.saved, false); assert.match(h.book.state.error, /JSON 백업/);
  assert.equal(h.book.snapshot.recipients[0].name, '검증가'); assert.equal(h.values.has(KEY), false);
  h.allowWrites(); h.edit(0, 'phone', '00000000000');
  assert.equal(h.book.state.saved, true); assert.equal(h.book.state.error, '');
  assert.equal(JSON.parse(h.values.get(KEY)).recipients[0].phone, '00000000000');
});

test('an asynchronous file import cannot overwrite edits made while the file was being read', async () => {
  const h = harness(); const backup = h.book.exportJson(); let finish;
  const input = { dataset: { recipientAction: 'import' }, files: [{ size: backup.length, text: () => new Promise(resolve => { finish = resolve; }) }], value: 'selected' };
  const loading = h.root.onchange({ target: input }); h.edit(0, 'name', '검증가'); finish(backup); await loading;
  assert.equal(h.book.snapshot.recipients[0].name, '검증가'); assert.match(h.book.state.error, /명단이 변경/);
  assert.equal(input.value, '');
});

test('rendering escapes recipient and prize text and no module code sends data over the network', () => {
  const h = harness(); const data = h.book.snapshot; data.recipients[0].name = '<검증 "가">';
  h.book.importJson(JSON.stringify(data)); assert.match(h.root.innerHTML, /&lt;검증 &quot;가&quot;&gt;/);
  assert.doesNotMatch(h.root.innerHTML, /value="<검증/);
  const source = readFileSync(new URL('../web/src/quiz/recipients.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|postMessage/);
  const before = h.values.get(KEY), handler = h.root.oninput; h.book.destroy();
  handler({ target: { dataset: { recipientIndex: '0', recipientField: 'name' }, value: '검증나' } });
  assert.equal(h.values.get(KEY), before);
});
