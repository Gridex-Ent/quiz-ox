import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appendCatalogSelection, createQuestionBank, filterCatalog, validateCatalog } from '../web/src/quiz/question-bank.js';

const catalog = [
  { id: 'math-one', category: '수학', text: '삼각형에는 변이 세 개 있다.', answer: 'O', choiceO: 'O', choiceX: 'X', seconds: 10, explanation: '세 개의 변으로 이루어진 도형이다.', source: '도형의 정의', sources: [] },
  { id: 'science-one', category: '과학', text: '소리는 진공에서도 전달된다.', answer: 'X', choiceO: 'O', choiceX: 'X', seconds: 10, explanation: '소리는 전달할 매질이 필요하다.', source: '음파 설명', sources: ['https://example.org/sound'] },
  { id: 'math-two', category: '수학', text: '1은 소수이다.', answer: 'X', choiceO: 'O', choiceX: 'X', seconds: 10, explanation: '소수는 양의 약수가 두 개 있는 자연수이다.', source: '소수의 정의', sources: [] },
];
const clone = value => structuredClone(value);

const publishedCatalogPath = new URL('../questions/catalog.json', import.meta.url);
test('published reusable bank has 70 unique, balanced candidates and preserves the separate existing banks', () => {
  const source = JSON.parse(readFileSync(publishedCatalogPath, 'utf8')), validated = validateCatalog(source);
  assert.equal(validated.length, 70);
  const categories = new Map();
  for (const question of validated) categories.set(question.category, (categories.get(question.category) || 0) + 1);
  assert.equal(categories.size, 10); assert.deepEqual([...categories.values()], Array(10).fill(7));
  const trueCount = validated.filter(question => question.answer === 'O').length;
  assert(trueCount >= 30 && trueCount <= 40, `O/X 답의 균형 확인: O ${trueCount}개`);
  const normalize = text => text.normalize('NFKC').replace(/\s+/gu, '').toLowerCase();
  const main = JSON.parse(readFileSync(new URL('../questions/default.json', import.meta.url), 'utf8'));
  const bonus = JSON.parse(readFileSync(new URL('../questions/bonus-quiz-2026.json', import.meta.url), 'utf8')).groups.flatMap(group => group.items);
  assert.equal(main.length, 31); assert.equal(bonus.length, 33);
  const existing = new Set([...main, ...bonus].map(question => normalize(question.text)));
  for (const question of validated) {
    assert(!existing.has(normalize(question.text)), `기존 문제와 중복: ${question.text}`);
    assert.equal(question.seconds, 10); assert(question.explanation.trim()); assert(question.source?.trim());
    if (question.category !== '수학') assert(question.sources?.some(url => url.startsWith('https://')), `${question.id} 출처 필요`);
  }
});

test('catalog validation normalizes valid candidate questions but never modifies their source', () => {
  const source = clone(catalog); source[0].text = `  ${source[0].text}  `; source[0].seconds = 5;
  const before = clone(source), result = validateCatalog(source);
  assert.deepEqual(source, before);
  assert.equal(result[0].text, catalog[0].text); assert.equal(result[0].seconds, 10);
  assert.equal(result[0].id, 'math-one'); assert.equal(result.length, 3);
});

test('duplicate IDs, duplicate normalized statements, invalid questions and missing categories fail before display', () => {
  for (const bad of [null, [], [{ ...catalog[0], id: 'bad"id' }], [{ ...catalog[0], category: ' ' }], [{ ...catalog[0], answer: 'unknown' }], [catalog[0], { ...catalog[1], id: catalog[0].id }], [catalog[0], { ...catalog[1], text: '삼각형에는\n변이  세 개 있다.' }]]) assert.throws(() => validateCatalog(bad));
});

test('search combines category and answer filters and matches spaced explanation text', () => {
  assert.deepEqual(filterCatalog(catalog, { category: '수학', answer: 'X' }).map(question => question.id), ['math-two']);
  assert.deepEqual(filterCatalog(catalog, { search: '전달할매질' }).map(question => question.id), ['science-one']);
  assert.equal(filterCatalog(catalog, { search: '수학' }).length, 2);
  assert.equal(filterCatalog(catalog, { category: '수학', search: '진공' }).length, 0);
});

test('appending uses catalog order and preserves every existing unfinished edit, media field and object reference', () => {
  const incomplete = { text: '', explanation: '', pending: { untouched: true } };
  const existing = { text: '진행자의 기존 문제', imageData: 'data:image/png;base64,YQ==', note: '작성 중 메모', answer: 'X' };
  const draft = [incomplete, existing], before = clone(draft);
  const result = appendCatalogSelection(draft, catalog, ['math-two', 'math-one']);
  assert.deepEqual(draft, before); assert.equal(result.added, 2); assert.equal(result.skipped, 0);
  assert.equal(result.questions[0], incomplete); assert.equal(result.questions[1], existing);
  assert.deepEqual(result.questions.slice(2).map(question => question.text), [catalog[0].text, catalog[2].text]);
  assert.equal(result.questions[2].id, undefined);
  result.questions[2].sources.push('https://example.org/new'); assert.equal(catalog[0].sources.length, 0);
});

test('normalized same-text questions are skipped even when edited answers differ and importing again stays idempotent', () => {
  const draft = [{ text: '삼각형에는\n변이 세 개 있다.', answer: 'X', note: '기존 수정 유지' }];
  const first = appendCatalogSelection(draft, catalog, new Set(['math-one', 'science-one']));
  assert.equal(first.added, 1); assert.equal(first.skipped, 1); assert.equal(first.questions[0], draft[0]);
  const again = appendCatalogSelection(first.questions, catalog, ['math-one', 'science-one']);
  assert.equal(again.added, 0); assert.equal(again.skipped, 2); assert.deepEqual(again.questions, first.questions);
  assert.equal(appendCatalogSelection([], [{ ...catalog[0], text: 'Ａ Ｂ' }], ['math-one']).added, 1);
  assert.equal(appendCatalogSelection([{ text: 'AB' }], [{ ...catalog[0], text: 'Ａ Ｂ' }], ['math-one']).added, 0);
});

test('empty selection changes nothing and unknown IDs or exceeding 300 questions cannot partially append', () => {
  const draft = Array.from({ length: 299 }, (_, index) => ({ text: `기존 ${index}`, note: '보존' })), before = clone(draft);
  assert.equal(appendCatalogSelection(draft, catalog, []).added, 0);
  assert.equal(appendCatalogSelection(draft, catalog, ['math-one']).questions.length, 300);
  assert.throws(() => appendCatalogSelection(draft, catalog, ['math-one', 'science-one']), /300/);
  assert.throws(() => appendCatalogSelection(draft, catalog, ['missing-id']), /없는 후보/);
  assert.throws(() => appendCatalogSelection(draft, catalog, 'math-one'), TypeError);
  assert.deepEqual(draft, before);
});

function harness({ source = catalog, draft = [], onImport, onEdit } = {}) {
  const names = ['search', 'category', 'answer', 'count', 'select-visible', 'clear', 'import', 'edit', 'message', 'list'];
  const elements = Object.fromEntries(names.map(name => [name, { value: '', innerHTML: '', textContent: '', disabled: false, listeners: new Map(), addEventListener(type, listener) { this.listeners.set(type, listener); }, removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); } }]));
  let html = '', mounts = 0, editCount = 0, currentDraft = draft;
  const calls = [];
  const root = { get innerHTML() { return html; }, set innerHTML(value) { html = value; mounts++; }, querySelector: selector => elements[selector.match(/^\[data-qb-(.*)\]$/)?.[1]] };
  const book = createQuestionBank({ root, catalog: source, getDraft: () => currentDraft, async onImport(value) { calls.push(value); if (onImport) return onImport(value); currentDraft = value.questions; }, onEdit() { editCount++; return onEdit?.(); } });
  const event = (name, type = 'click', value = {}) => elements[name].listeners.get(type)?.(value);
  return { root, book, elements, calls, event,
    choose(id, checked = true, disabled = false) { const input = { checked, disabled, dataset: { qbId: id } }; return event('list', 'change', { target: { closest: () => input } }); },
    filter(name, value) { elements[name].value = value; return event(name, name === 'search' ? 'input' : 'change'); },
    replaceDraft(value) { currentDraft = value; book.refresh(); },
    get draft() { return currentDraft; }, get mounts() { return mounts; }, get editCount() { return editCount; },
  };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

test('selection persists across filters, refreshes and tab remount avoidance; select visible only adds matching candidates', async () => {
  const h = harness();
  h.choose('science-one'); h.filter('category', '수학');
  assert.match(h.elements.count.textContent, /선택 1개/); assert.doesNotMatch(h.elements.list.innerHTML, /data-qb-id="science-one"/);
  h.event('select-visible'); assert.match(h.elements.count.textContent, /선택 3개/);
  h.filter('search', '소수'); h.book.render(); assert.match(h.elements.count.textContent, /선택 3개/);
  assert.equal(h.mounts, 1);
  await h.event('import'); assert.equal(h.calls[0].added, 3); assert.equal(h.draft.length, 3);
  assert.match(h.elements.message.textContent, /문제·순서 저장/); assert.match(h.elements.count.textContent, /선택 0개/);
  h.filter('category', ''); h.filter('search', '');
  assert.equal((h.elements.list.innerHTML.match(/ disabled/g) || []).length, 3);
  assert.match(h.elements.list.innerHTML, /편집란에 있음/); assert.equal(h.elements.import.disabled, true);
});

test('checking an existing or unknown candidate has no effect, and clear cancels all selections across filters', () => {
  const h = harness({ draft: [{ text: catalog[0].text }] });
  h.choose('math-one', true, true); h.choose('missing-id'); assert.match(h.elements.count.textContent, /선택 0개/);
  h.choose('science-one'); h.filter('category', '수학'); h.event('clear'); assert.match(h.elements.count.textContent, /선택 0개/);
  h.event('edit'); assert.equal(h.editCount, 1);
});

test('pending import prevents double submission, reports no premature success and preserves selection on rejection', async () => {
  const pending = deferred(), h = harness({ onImport: () => pending.promise });
  h.choose('math-one'); const saving = h.event('import'); h.event('import');
  assert.equal(h.calls.length, 1); assert.equal(h.elements.import.disabled, true);
  assert.match(h.elements.message.textContent, /가져오는 중/); assert.doesNotMatch(h.elements.message.textContent, /추가했습니다/);
  pending.reject(Error('저장 공간 부족')); await saving;
  assert.match(h.elements.message.textContent, /저장 공간 부족/); assert.match(h.elements.count.textContent, /선택 1개/);
  assert.equal(h.elements.import.disabled, false);
});

test('a false persistence result keeps selections and never reports successful storage', async () => {
  const h = harness({ onImport: () => false }); h.choose('math-one'); await h.event('import');
  assert.match(h.elements.count.textContent, /선택 1개/); assert.match(h.elements.message.textContent, /보관하지 못했습니다/);
  assert.doesNotMatch(h.elements.message.textContent, /추가했습니다/);
});

test('live draft refresh disables newly duplicated candidates without changing pending selections or existing edits', () => {
  const h = harness(); h.choose('science-one');
  const existing = { text: catalog[1].text, note: '다른 탭에서 가져온 편집' }; h.replaceDraft([existing]);
  assert.match(h.elements.count.textContent, /선택 1개 \(새로 추가 0개\)/); assert.equal(h.elements.import.disabled, true);
  assert.match(h.elements.list.innerHTML, /data-qb-id="science-one" checked disabled/); assert.equal(h.draft[0], existing);
});

test('question, category, answer explanations and source text are escaped; source links only accept HTTPS', () => {
  const h = harness({ source: [{ ...catalog[0], category: '<img onerror=alert(1)>', text: '<script>alert(1)</script>', explanation: '<svg onload=alert(1)>', source: '"<b>출처</b>', sources: ['javascript:alert(1)', 'http://example.org/insecure', 'https://example.org/a?x=1&y=2'] }] });
  assert.doesNotMatch(h.root.innerHTML, /<img onerror/); assert.match(h.root.innerHTML, /&lt;img/);
  assert.doesNotMatch(h.elements.list.innerHTML, /<script>|<svg|javascript:|http:\/\/example/);
  assert.match(h.elements.list.innerHTML, /&lt;script&gt;/); assert.match(h.elements.list.innerHTML, /href="https:\/\/example.org\/a\?x=1&amp;y=2"/);
  assert.match(h.elements.list.innerHTML, /rel="noopener noreferrer"/);
});

test('destroy removes handlers, clears the mount and ignores late import results', async () => {
  const pending = deferred(), h = harness({ onImport: () => pending.promise }); h.choose('math-one');
  const saving = h.event('import'); h.book.destroy(); pending.resolve(); await saving;
  assert.equal(h.root.innerHTML, ''); assert.equal(h.elements.import.listeners.size, 0);
  h.book.refresh(); assert.equal(h.root.innerHTML, '');
});
