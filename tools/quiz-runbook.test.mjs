import test from 'node:test';
import assert from 'node:assert/strict';
import { copyRunbookQuestion, createRunbookQuestion, createRunbook, SAVED_RUNBOOK_GROUPS, createSavedRunbookQuestion } from '../web/src/quiz/runbook.js';
import { createState, transition, secondsLeft } from '../web/src/quiz/manual-model.js';
import { makePublicView } from '../web/src/quiz/presentation.js';

const question = {
  text: '기존 사진·노래 문제', category: '음악', topic: '기존 주제', answer: 'X', choiceO: '첫 보기', choiceX: '둘째 보기', seconds: 10,
  explanation: '기존 정답 해설', note: '사회자 메모', sources: ['https://example.org/source'], imageData: 'data:image/png;base64,YQ==',
  imageReveal: 'answer', imageCredit: '사진 제공자', imageLicense: 'CC BY', musicYoutubeId: 'abcdefghijk', musicTitle: '노래 제목',
};

test('open question creation trims presenter input and uses a separate ten-second question', () => {
  const input = { category: ' 넌센스 ', text: ' 무엇일까요? ', openAnswer: ' 정답입니다 ', explanation: ' 해설입니다 ' };
  const before = structuredClone(input);
  assert.deepEqual(createRunbookQuestion(input), { text: '무엇일까요?', category: '넌센스', topic: '넌센스', answer: 'O', choiceO: 'O', choiceX: 'X', seconds: 10, explanation: '해설입니다', kind: 'open', openAnswer: '정답입니다' });
  assert.deepEqual(input, before);
  assert.equal(createRunbookQuestion({ text: '문제', openAnswer: '정답' }).category, '번외 퀴즈');
});

test('malformed or incomplete instant questions cannot be presented', () => {
  for (const input of [null, [], '문제', {}, { text: ' ', openAnswer: '정답' }, { text: '문제', openAnswer: ' ' }, { text: 5, openAnswer: '정답' }, { text: '문제', openAnswer: '정답', explanation: {} }, { text: '문제', openAnswer: '정답', category: 3 }, { kind: 'unknown', text: '문제', openAnswer: '정답' }, { kind: 'ox', text: '문제', answer: 'A' }, { text: '문제', openAnswer: '정답', category: '가'.repeat(61) }]) {
    assert.throws(() => createRunbookQuestion(input));
  }
});

test('OX instant questions use the existing OX structure and explicit answer', () => {
  const result = createRunbookQuestion({ kind: 'ox', text: '참인가요?', answer: 'X', openAnswer: '이전 주관식 답' });
  assert.equal(result.answer, 'X');
  assert.equal(result.kind, undefined);
  assert.equal(result.openAnswer, undefined);
  assert.equal(result.seconds, 10);
});

test('copying preserves every original field and independently clones media metadata', () => {
  const source = structuredClone(question);
  Object.freeze(source.sources); Object.freeze(source);
  const copied = copyRunbookQuestion(source);
  assert.deepEqual(copied, { ...question, seconds: 10 });
  copied.sources.push('https://example.org/second'); copied.text = '다른 문제';
  assert.deepEqual(source, question);
  assert.notEqual(copied, source); assert.notEqual(copied.sources, source.sources);
  for (const invalid of [null, [], {}, { ...question, text: '' }, { ...question, answer: 'A' }, { ...question, kind: 'open', openAnswer: '' }]) assert.throws(() => copyRunbookQuestion(invalid));
});

function harness({ onQuiz } = {}) {
  const names = ['status', 'saved-select', 'saved-answer', 'saved-launch', 'main-select', 'copy', 'form', 'kind', 'category', 'text', 'answer', 'explanation', 'open-fields', 'ox-fields', 'ox-answer', 'submit', 'message', 'back'];
  const elements = new Map(names.map(name => [name, { value: '', innerHTML: '', textContent: '', disabled: false, hidden: false, style: {}, listeners: new Map(), addEventListener(type, listener) { this.listeners.set(type, listener); }, removeEventListener(type, listener) { if (this.listeners.get(type) === listener) this.listeners.delete(type); } }]));
  elements.get('kind').value = 'open'; elements.get('ox-answer').value = 'O';
  let html = '', mounts = 0, backCount = 0;
  const launches = [];
  const root = { get innerHTML() { return html; }, set innerHTML(value) { html = value; mounts++; }, querySelector(selector) { return elements.get(selector.match(/^\[data-runbook-(.*)\]$/)?.[1]) || null; } };
  const book = createRunbook({ root, onQuiz: value => { launches.push(value); return onQuiz?.(value); }, onBack: () => { backCount++; } });
  const event = (name, type = 'click') => elements.get(name).listeners.get(type)?.({ preventDefault() {} });
  return { root, book, elements, launches, event, get mounts() { return mounts; }, get backCount() { return backCount; } };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

test('factory requires a root and both public callbacks', () => {
  assert.throws(() => createRunbook(), TypeError);
  assert.throws(() => createRunbook({ root: { innerHTML: '', querySelector() {} }, onQuiz() {} }), TypeError);
});

test('a remote saved quiz reports success only after the launch promise is acknowledged', async () => {
  const saving = deferred(), h = harness({ onQuiz: () => saving.promise });
  h.book.render({ questions: [question] });
  h.elements.get('text').value = '계속 보관할 즉석문제'; h.elements.get('answer').value = '계속 보관할 정답';
  h.event('saved-launch');
  assert.equal(h.launches.length, 1); assert.match(h.elements.get('message').textContent, /서버에 반영하는 중/);
  assert.doesNotMatch(h.elements.get('message').textContent, /출제했습니다/);
  saving.resolve(); await flushPromises();
  assert.match(h.elements.get('message').textContent, /번외 문제를 출제했습니다/);
  assert.equal(h.elements.get('text').value, '계속 보관할 즉석문제'); assert.equal(h.elements.get('answer').value, '계속 보관할 정답');
});

test('a rejected remote instant launch reports the failure without a success claim or losing its draft', async () => {
  const saving = deferred(), h = harness({ onQuiz: () => saving.promise });
  h.book.render({ questions: [question] });
  h.elements.get('text').value = '가상 즉석문제'; h.elements.get('answer').value = '가상 즉석정답';
  h.event('form', 'submit'); saving.reject(Error('클라우드 저장 실패')); await flushPromises();
  assert.match(h.elements.get('message').textContent, /클라우드 저장 실패/);
  assert.doesNotMatch(h.elements.get('message').textContent, /출제했습니다/);
  assert.equal(h.elements.get('text').value, '가상 즉석문제'); assert.equal(h.elements.get('answer').value, '가상 즉석정답');
  assert.equal(h.launches[0].text, '가상 즉석문제');
});

test('an asynchronous launch acknowledgement cannot update a destroyed runbook', async () => {
  const saving = deferred(), h = harness({ onQuiz: () => saving.promise }); h.book.render({ questions: [question] });
  h.event('copy'); const beforeDestroy = h.elements.get('message').textContent;
  h.book.destroy(); saving.resolve(); await flushPromises();
  assert.equal(h.root.innerHTML, ''); assert.equal(h.elements.get('message').textContent, beforeDestroy);
});

test('render keeps draft fields and selection while reporting the paused main-game position', () => {
  const h = harness();
  const list = [question, { ...question, text: '둘째 문제' }];
  h.book.render({ questions: list, index: 1, phase: 'question' });
  assert.equal(h.elements.get('main-select').value, '1');
  h.elements.get('text').value = '작성 중인 문제'; h.elements.get('answer').value = '작성 중인 정답';
  h.elements.get('main-select').value = '0';
  h.book.render({ questions: list, index: 1, phase: 'answer', inBonus: true });
  assert.match(h.elements.get('status').textContent, /번외 퀴즈 진행 중.*2 \/ 2번.*정답 공개/);
  assert.equal(h.elements.get('text').value, '작성 중인 문제'); assert.equal(h.elements.get('answer').value, '작성 중인 정답');
  assert.equal(h.elements.get('main-select').value, '0'); assert.equal(h.mounts, 1);
  assert.equal(h.elements.get('copy').disabled, true); assert.equal(h.elements.get('submit').disabled, true);
  assert.equal(h.elements.get('back').textContent, '본게임으로 돌아가기');
  h.event('copy'); h.event('form', 'submit'); assert.equal(h.launches.length, 0);
  h.event('back'); assert.equal(h.backCount, 1);
});

test('form rejects invalid input and dispatches valid open or OX questions without clearing drafts', () => {
  const h = harness(); h.book.render({ questions: [question] });
  h.event('form', 'submit'); assert.equal(h.launches.length, 0); assert.match(h.elements.get('message').textContent, /문제.*입력/);
  h.elements.get('text').value = '즉석 문제'; h.event('form', 'submit'); assert.equal(h.launches.length, 0); assert.match(h.elements.get('message').textContent, /정답.*입력/);
  h.elements.get('answer').value = '즉석 정답'; h.event('form', 'submit');
  assert.equal(h.launches[0].kind, 'open'); assert.equal(h.launches[0].openAnswer, '즉석 정답'); assert.equal(h.elements.get('text').value, '즉석 문제');
  h.elements.get('kind').value = 'ox'; h.elements.get('ox-answer').value = 'X'; h.event('kind', 'change'); h.event('form', 'submit');
  assert.equal(h.elements.get('open-fields').hidden, true); assert.equal(h.elements.get('ox-fields').hidden, false);
  assert.equal(h.elements.get('open-fields').style.display, 'none'); assert.equal(h.elements.get('ox-fields').style.display, '');
  assert.equal(h.launches[1].answer, 'X'); assert.equal(h.launches[1].kind, undefined);
});

test('selected existing question copies immutable content, handles empty lists and escapes option text', () => {
  const h = harness();
  const special = { ...question, text: '<img src=x onerror=alert(1)>' };
  h.book.render({ questions: [question, special], index: 1, phase: 'ready' }); h.event('copy');
  assert.deepEqual(h.launches[0], { ...special, seconds: 10 }); assert.notEqual(h.launches[0].sources, special.sources);
  assert.match(h.elements.get('main-select').innerHTML, /&lt;img/); assert.doesNotMatch(h.elements.get('main-select').innerHTML, /<img/);
  h.book.render({ questions: [] }); assert.equal(h.elements.get('copy').disabled, true); h.event('copy'); assert.equal(h.launches.length, 1);
});

test('destroy removes callbacks and prevents later renders from remounting the page', () => {
  const h = harness(); h.book.render({ questions: [question] }); h.book.destroy(); h.book.destroy();
  h.event('back'); h.event('copy'); h.event('saved-launch'); h.event('saved-select', 'change'); h.event('form', 'submit'); h.book.render({ questions: [question] });
  assert.equal(h.root.innerHTML, ''); assert.equal(h.backCount, 0); assert.equal(h.launches.length, 0); assert.equal(h.mounts, 2);
});

test('restored groups preserve the original fourteen user questions and four prize questions', () => {
  const legacy = SAVED_RUNBOOK_GROUPS.filter(group => ['user-nonsense', 'prize-bonus'].includes(group.id));
  assert.deepEqual(legacy.map(group => [group.id, group.items.length]), [['user-nonsense', 14], ['prize-bonus', 4]]);
  const users = SAVED_RUNBOOK_GROUPS[0].items;
  assert.deepEqual(users.map(item => item.number), Array.from({ length: 14 }, (_, i) => i + 1));
  assert.deepEqual(users.map(item => item.openAnswer), ['천만의 말씀', '야금야금', '이별', '참새', 'A젖소는 “에이~, 졌소”이고 B젖소는 “삐졌소?”', '가위를 낸다.', '개인지도', '스타 워즈', '그대와 함께라면.', '토끼기…', '모내기', '두근 두근 해서 총 네근', '응가', '아이구']);
  assert.equal(users[4].text, 'A젖소와 B젖소가 싸움을 했는데 싸움에서 B젖소가 이겼다. 왜일까?');
  assert.equal(users[8].explanation, '원문 부연: “(허걱) 닭살 왕창 솟는군..”');
  assert.equal(users[9].explanation, '(도망치기)');
  assert.ok(users.every(item => item.kind === 'open'));
  const ids = SAVED_RUNBOOK_GROUPS.flatMap(group => group.items.map(item => item.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.throws(() => { users[0].openAnswer = '덮어쓰기'; }, TypeError);
});

test('prepared and user-provided drip quizzes keep honest provenance and presenter lines out of every public phase', () => {
  const groups = SAVED_RUNBOOK_GROUPS.filter(group => ['host-drip', 'user-electric-ox'].includes(group.id));
  assert.deepEqual(groups.map(group => [group.id, group.items.length]), [['host-drip', 8], ['user-electric-ox', 7]]);
  const electric = groups.find(group => group.id === 'user-electric-ox');
  assert.deepEqual(electric.items.map(item => item.answer), ['O', 'O', 'X', 'X', 'X', 'O', 'X']);
  for (const group of groups) for (const item of group.items) {
    const q = createSavedRunbookQuestion(item.id);
    assert.equal(q.note, item.hostNote);
    assert.equal(q.seconds, 10);
    assert.ok(q.source.includes(group.source.label));
    assert.doesNotMatch(q.source, /runbook\.md|undefined/);
    if (item.kind === 'ox') {
      assert.equal(q.answer, item.answer); assert.equal(q.kind, undefined);
      assert.equal(q.choiceO, 'O'); assert.equal(q.choiceX, 'X');
    }
    const main = createState([question]);
    const topic = transition(main, { type: 'interlude', question: q }, 0);
    const asked = transition(topic, { type: 'tick' }, 2000);
    const revealed = transition(asked, { type: 'reveal' }, 3000);
    for (const state of [topic, asked, revealed]) {
      const publicText = JSON.stringify(makePublicView(state, 3000));
      assert.ok(!publicText.includes(q.note));
      assert.ok(!publicText.includes(q.source));
      assert.ok(!publicText.includes('hostNote'));
    }
    const h = harness();
    h.elements.get('saved-select').value = item.id; h.event('saved-select', 'change');
    assert.ok(h.elements.get('saved-answer').textContent.includes(q.note));
    assert.ok(!h.root.innerHTML.includes(q.note));
    h.event('saved-launch');
    assert.equal(h.launches[0].note, q.note);
  }
});

test('saved question creation uses independent ten-second copies with source provenance', () => {
  const selected = createSavedRunbookQuestion('user-01');
  assert.equal(selected.text, '서울시민 모두가 동시에 고함지르면 무슨 말이 될까?');
  assert.equal(selected.kind, 'open'); assert.equal(selected.openAnswer, '천만의 말씀');
  assert.equal(selected.category, '넌센스'); assert.equal(selected.topic, '넌센스'); assert.equal(selected.seconds, 10);
  assert.equal(selected.source, 'D:\\Codex_Personal\\ox_quiz\\quiz-ox\\DOCS\\planning\\runbook.md:147 (2026-10-10)');
  selected.openAnswer = '편집';
  assert.equal(createSavedRunbookQuestion('user-01').openAnswer, '천만의 말씀');
  const ox = createSavedRunbookQuestion('prize-01');
  assert.equal(ox.answer, 'X'); assert.equal(ox.kind, undefined); assert.equal(ox.openAnswer, undefined);
  assert.match(ox.explanation, /全力.*電力/);
  for (const invalid of ['', 'missing', 0, null, undefined]) assert.throws(() => createSavedRunbookQuestion(invalid), /선택/);
});

test('saved quiz selector shows grouped questions and keeps answers in a separate admin element', () => {
  const h = harness(); h.book.render({ questions: [question] });
  assert.match(h.root.innerHTML, /optgroup label="사용자 제공 넌센스 14개"/);
  assert.match(h.root.innerHTML, /optgroup label="기존 경품 번외 4개"/);
  assert.match(h.root.innerHTML, /value="user-14">14\. 아홉 명의 자식을 세 자로 줄이면\?/);
  assert.doesNotMatch(h.root.innerHTML, /천만의 말씀|야금야금|너에게 꽂혔어/);
  assert.equal(h.elements.get('saved-select').value, 'user-01');
  assert.equal(h.elements.get('saved-answer').textContent, '관리자 전용 정답: 천만의 말씀');
  h.elements.get('saved-select').value = 'user-09'; h.event('saved-select', 'change');
  assert.equal(h.elements.get('saved-answer').textContent, '관리자 전용 정답: 그대와 함께라면.\n원문 부연: “(허걱) 닭살 왕창 솟는군..”');
  h.event('saved-launch');
  assert.equal(h.launches[0].openAnswer, '그대와 함께라면.');
  assert.equal(h.launches[0].seconds, 10);
  h.book.render({ questions: [{ ...question, text: '수정된 본게임' }] });
  assert.equal(h.elements.get('saved-select').value, 'user-09');
  assert.equal(h.elements.get('text').value, '');
});

test('saved launch rejects invalid selection and stays disabled while a bonus is already running', () => {
  const h = harness(); h.book.render({ questions: [question] });
  h.elements.get('saved-select').value = 'invalid'; h.event('saved-launch');
  assert.equal(h.launches.length, 0); assert.match(h.elements.get('message').textContent, /선택/);
  h.elements.get('saved-select').value = 'prize-01'; h.event('saved-select', 'change');
  assert.match(h.elements.get('saved-answer').textContent, /^관리자 전용 정답: X/);
  h.book.render({ questions: [question], inBonus: true });
  assert.equal(h.elements.get('saved-select').disabled, true); assert.equal(h.elements.get('saved-launch').disabled, true);
  h.event('saved-launch'); assert.equal(h.launches.length, 0);
  h.book.render({ questions: [] });
  assert.equal(h.elements.get('saved-launch').disabled, false);
  h.event('saved-launch'); assert.equal(h.launches[0].answer, 'X');
});

test('saved bonus launch waits for manual answer reveal and returns to the unchanged main-game position', () => {
  const h = harness(); const list = [question, { ...question, text: '본게임 둘째' }];
  let main = transition(createState(list), { type: 'select', index: 1 }, 0);
  main = transition(main, { type: 'show' }, 0); main = transition(main, { type: 'tick' }, 2000);
  main = transition(main, { type: 'reveal' }, 3000);
  h.book.render({ questions: main.questions, index: main.index, phase: main.phase });
  h.elements.get('saved-select').value = 'user-14'; h.event('saved-launch');
  let bonus = transition(main, { type: 'interlude', question: h.launches[0] }, 4000);
  assert.equal(bonus.phase, 'topic'); assert.equal(bonus.mode, 'bonus'); assert.equal(bonus.questions.length, 1);
  bonus = transition(bonus, { type: 'tick' }, 6000);
  assert.equal(bonus.phase, 'question'); assert.equal(secondsLeft(bonus, 6000), 10);
  bonus = transition(bonus, { type: 'tick' }, 16000);
  assert.equal(bonus.phase, 'question'); assert.equal(bonus.remaining, 0); assert.equal(bonus.questions[0].openAnswer, '아이구');
  assert.equal(transition(bonus, { type: 'next' }, 17000), bonus);
  bonus = transition(bonus, { type: 'reveal' }, 18000); assert.equal(bonus.phase, 'answer');
  const returned = transition(bonus, { type: 'next' }, 19000);
  assert.equal(returned.phase, 'answer'); assert.equal(returned.index, 1); assert.equal(returned.mode, 'main');
  assert.deepEqual(returned.questions, main.questions); assert.equal(returned.questions.length, 2);
  assert.equal(h.elements.get('main-select').value, '1');
});
