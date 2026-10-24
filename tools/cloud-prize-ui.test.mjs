import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPrizeSettings, readPrizeFile } from '../web/src/quiz/prize-settings.js';
import { MAX_PRIZE_BYTES } from '../web/src/quiz/prize-info.js';
import { renderQuizStage } from '../web/src/quiz/presentation.js';
import { createCloudTransport } from '../web/src/cloud/transport.js';
import { createState } from '../web/src/quiz/manual-model.js';

const imageA = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aOZ0AAAAASUVORK5CYII=';
const imageB = 'data:image/gif;base64,R0lGODlh';
const prize = (imageData = imageA, caption = '가상 상품 안내') => ({ imageData, imageAlt: '가상 상품', caption });
const clone = value => structuredClone(value);
const KEY = 'ox-cloud-prize-pending-v1';
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function harness({ saved = null, storage = new Map(), onSave, readFile, failStorage = false } = {}) {
  const names = ['form', 'file', 'alt', 'caption', 'preview', 'preview-caption', 'save', 'default', 'reload', 'status'];
  const fields = new Map(names.map(name => [name, { value: '', textContent: '', disabled: false }]));
  const root = { innerHTML: '', querySelector: selector => fields.get(selector.match(/^\[data-prize-(.*)\]$/)?.[1]) };
  const calls = [];
  const book = createPrizeSettings({ root, defaultPrize: { ...prize(imageB, ''), imageAlt: '기본 상품' },
    storage: { getItem: key => storage.get(key) ?? null, removeItem: key => storage.delete(key), setItem(key, value) { if (failStorage) throw Error('quota'); storage.set(key, value); } },
    onSave: async value => { calls.push(clone(value)); return onSave ? onSave(value) : value; },
    readFile: readFile ?? (async file => file.data), confirm: () => true,
  });
  book.setConnection({ connected: true, busy: false, authenticated: true }); book.accept(saved);
  return { root, fields, calls, book, storage,
    text: () => fields.get('status').textContent,
    edit(name, value) { const target = fields.get(name); target.value = value; fields.get('form').oninput({ target }); },
    upload(file) { return fields.get('file').onchange({ target: { files: [file] } }); },
    submit: () => fields.get('form').onsubmit({ preventDefault() {} }),
  };
}

test('upload reader rejects unsupported/empty/oversized files before reading and checks real image signatures', async () => {
  let reads = 0;
  for (const file of [{ type: 'image/svg+xml', size: 1 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: MAX_PRIZE_BYTES + 1 }]) {
    await assert.rejects(readPrizeFile(file, async () => { reads++; return imageA; }));
  }
  assert.equal(reads, 0);
  await assert.rejects(readPrizeFile({ type: 'image/png', size: 1 }, async () => 'data:image/png;base64,YQ=='));
  assert.equal(await readPrizeFile({ type: 'image/png', size: 80 }, async () => imageA), imageA);
  assert.equal(await readPrizeFile({ type: 'image/gif', size: 6 }, async () => imageB), imageB);
});

test('a selected image has a local preview but no upload happens before explicit save and durable ACK', async () => {
  const ack = deferred(), h = harness({ onSave: () => ack.promise });
  h.edit('caption', '<상품 안내>'); await h.upload({ data: imageA });
  assert.equal(h.fields.get('preview').src, imageA); assert.equal(h.fields.get('preview-caption').textContent, '<상품 안내>');
  assert.equal(h.calls.length, 0); assert.equal(h.book.hasPending, true);
  const saving = h.submit(); assert.match(h.text(), /저장하는 중/); assert.equal(h.fields.get('save').disabled, true);
  assert.doesNotMatch(h.text(), /클라우드에 저장했습니다/);
  const value = h.book.state.draft; h.book.accept(value); ack.resolve(value); await saving;
  assert.match(h.text(), /클라우드에 저장했습니다/); assert.equal(h.book.hasPending, false); assert.equal(h.storage.has(KEY), false);
});

test('out-of-order file reads cannot replace the latest image, and typing during a read is retained', async () => {
  const first = deferred(), second = deferred(), h = harness({ readFile: file => file.id === 1 ? first.promise : second.promise });
  const a = h.upload({ id: 1 }), b = h.upload({ id: 2 }); h.edit('caption', '읽는 중 입력');
  second.resolve(imageB); await b; first.resolve(imageA); await a;
  assert.equal(h.book.state.draft.imageData, imageB); assert.equal(h.book.state.draft.caption, '읽는 중 입력');
  assert.equal(h.fields.get('preview').src, imageB); assert.equal(h.calls.length, 0);
});

test('an ACK cannot overwrite follow-up edits even if the caption was changed back to its old server value', async () => {
  const original = prize(imageA, '기존 안내'), ack = deferred(), h = harness({ saved: original, onSave: () => ack.promise });
  h.edit('caption', '먼저 저장할 안내'); const saving = h.submit(); h.edit('caption', '기존 안내');
  const committed = prize(imageA, '먼저 저장할 안내'); h.book.accept(committed); ack.resolve(committed); await saving;
  assert.equal(h.fields.get('caption').value, '기존 안내'); assert.equal(h.book.state.dirty, true);
  assert.match(h.text(), /추가한 입력/); assert.equal(JSON.parse(h.storage.get(KEY)).prize.caption, '기존 안내');
});

test('failed image save restores its draft after refresh without automatically uploading anything', async () => {
  const storage = new Map(), h = harness({ storage, onSave: async () => { throw Error('서버 저장 실패'); } });
  await h.upload({ data: imageA }); h.edit('caption', '계속 보관'); await h.submit();
  assert.match(h.text(), /서버 저장 실패/); assert.equal(h.book.hasPending, true);
  const reopened = harness({ storage }); assert.equal(reopened.book.state.draft.imageData, imageA);
  assert.equal(reopened.fields.get('caption').value, '계속 보관'); assert.equal(reopened.calls.length, 0); assert.match(reopened.text(), /복원/);
});

test('same-server polls preserve image input while different-tab edits block overwriting and survive refresh', async () => {
  const h = harness({ saved: prize() }); h.edit('caption', '나의 초안'); h.book.accept(prize());
  assert.equal(h.fields.get('caption').value, '나의 초안'); assert.equal(h.book.state.conflict, false);
  const remote = prize(imageB, '다른 탭의 안내'); h.book.accept(remote);
  assert.equal(h.fields.get('preview').src, imageA); assert.equal(h.book.state.conflict, true); assert.equal(h.fields.get('save').disabled, true);
  await h.submit(); assert.equal(h.calls.length, 0);
  const reopened = harness({ storage: h.storage, saved: remote }); assert.equal(reopened.book.state.conflict, true);
  reopened.fields.get('reload').onclick(); assert.equal(reopened.book.state.conflict, false);
  assert.equal(reopened.fields.get('caption').value, '다른 탭의 안내'); assert.equal(reopened.book.hasPending, false);
});

test('explicit default restore sends null and returns to the default preview', async () => {
  const h = harness({ saved: prize() }); await h.fields.get('default').onclick();
  assert.deepEqual(h.calls, [null]); assert.equal(h.fields.get('preview').src, imageB); assert.equal(h.book.hasPending, false);
  assert.match(h.text(), /기본 상품 이미지로 복원/);
});

test('storage exhaustion warns before reload, and destruction ignores pending file and save responses', async () => {
  const quota = harness({ failStorage: true }); await quota.upload({ data: imageA });
  assert.match(quota.text(), /새로고침.*서버 저장/); assert.equal(quota.book.hasPending, true);
  const read = deferred(), h = harness({ readFile: () => read.promise }); const reading = h.upload({});
  const before = h.text(); h.book.destroy(); read.resolve(imageA); await reading;
  assert.equal(h.root.innerHTML, ''); assert.equal(h.text(), before);
  const ack = deferred(), saving = harness({ saved: prize(), onSave: () => ack.promise }); saving.edit('caption', '새 안내');
  const pending = saving.submit(); saving.book.destroy(); ack.resolve(prize(imageA, '새 안내')); await pending;
  assert.equal(saving.root.innerHTML, ''); assert.doesNotMatch(saving.text(), /클라우드에 저장했습니다/);
});

test('prize rendering uses an escaped custom image or default illustration with generic title and no fixed price or tier table', () => {
  const custom = { ...prize(), imageAlt: '"<상품>', caption: '<script>안내</script>' };
  const html = renderQuizStage({ phase: 'prizes', prize: custom }, { prizeImage: prize(imageB) });
  assert.match(html, /오늘의 상품/); assert.match(html, /alt="&quot;&lt;상품&gt;"/); assert.match(html, /&lt;script&gt;안내&lt;\/script&gt;/);
  assert.match(html, /prize-single/); assert.doesNotMatch(html, /200만|28명|prize-list|<script>/);
  assert.match(renderQuizStage({ phase: 'prizes', prize: null }, { prizeImage: prize(imageB) }), /data:image\/gif/);
});

test('cover gesture guide is a separate line after literal escaped message and all timing instructions use ten seconds', () => {
  const html = renderQuizStage({ phase: 'cover', event: { name: '행사', date: '', venue: '', message: '<b>함께 즐기는 OX 퀴즈</b>' } });
  assert.match(html, /class="event-message">&lt;b&gt;함께 즐기는 OX 퀴즈&lt;\/b&gt;<\/p><p class="gesture-guide">O는 주먹, X는 보자기<\/p>/);
  assert.match(html, /본게임 · 번외 퀴즈 모두 <strong>10초/); assert.doesNotMatch(html, /5초|1~5번|6번부터/);
  const shell = readFileSync(new URL('../web/host-shell.html', import.meta.url), 'utf8');
  assert.match(shell, /gesture-guide\{white-space:nowrap/); assert.doesNotMatch(shell, /1~5번|6번부터|5초/);
});

test('transport clones nullable prize metadata, retains it on unchanged envelopes, and waits for prize action ACK', async () => {
  const ack = deferred(), state = createState([{ text: '가상 문제', answer: 'O', explanation: '', seconds: 10 }]); let request = 0;
  const response = payload => ({ status: 200, ok: true, json: async () => payload });
  const envelope = (revision, extra) => ({ revision, bankVersion: 1, serverNow: 1000, state, bank: state.questions, ...extra });
  const client = createCloudTransport({ fetch: async path => path.includes('/action') ? ack.promise : response(envelope(++request, request === 1 ? { prize: prize() } : {})), setTimeout: () => 1, clearTimeout() {}, now: () => 1000 });
  await client.connect(); const outside = client.state; outside.prize.caption = '외부 수정'; assert.equal(client.state.prize.caption, '가상 상품 안내');
  await client.refresh(); assert.equal(client.state.prize.imageData, imageA);
  const saving = client.send({ type: 'prize', prize: null }); assert.equal(client.state.prize.imageData, imageA);
  ack.resolve(response(envelope(3, { prize: null }))); await saving; assert.equal(client.state.prize, null); client.destroy();
});

test('prize version polling reuses its image cache and missing changed images force recovery instead of a false applied state', async () => {
  const state = createState([{ text: '가상 문제', answer: 'O', explanation: '', seconds: 10 }]);
  const envelope = (revision, prizeVersion, extra = {}) => ({ revision, bankVersion: 1, prizeVersion, serverNow: 1000, state, bank: state.questions, ...extra });
  const replies = [envelope(1, 4, { prize: prize() }), envelope(2, 4), envelope(3, 5), envelope(3, 5, { prize: null })], paths = [];
  const client = createCloudTransport({ fetch: async path => { paths.push(path); return { status: 200, ok: true, json: async () => replies.shift() }; }, setTimeout: () => 1, clearTimeout() {}, now: () => 1000 });
  await client.connect(); assert.match(paths[0], /prize=-1/);
  await client.refresh(); assert.match(paths[1], /prize=4/); assert.equal(client.state.prize.imageData, imageA);
  await assert.rejects(client.refresh(), error => error.code === 'MISSING_PRIZE');
  assert.equal(client.state.connected, false); assert.equal(client.state.revision, 2); assert.equal(client.state.prize.imageData, imageA);
  await client.refresh(); assert.match(paths[3], /prize=-1/);
  assert.equal(client.state.prizeVersion, 5); assert.equal(client.state.prize, null); assert.equal(client.state.connected, true); client.destroy();
});
