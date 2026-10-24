import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, transition, secondsLeft, validateQuestions, importCsv, moveQuestion, questionCategory } from '../web/src/quiz/manual-model.js';
import { encodeQuestionStore, restoreQuestionDraft } from '../web/src/quiz/question-storage.js';
import { refreshQuestionImages } from '../web/src/quiz/question-assets.js';

const questions = [
  { text: '첫 문제', answer: 'O', choiceO: '빛', choiceX: '전기', seconds: 10, explanation: '비공개 해설', imageData: 'data:image/png;base64,YQ==', imageSource: '출처', review: '확정', note: '비공개 메모' },
  { text: '둘째 문제', answer: 'X', seconds: 5, explanation: '두 번째 해설' },
];
const step = (s, type, now = 0, args = {}) => transition(s, { type, ...args }, now);
const present = (s, type = 'show', now = 0, args = {}) => {
  const introduced = step(s, type, now, args);
  return introduced.phase === 'topic' ? step(introduced, 'tick', now + 2000) : introduced;
};

test('reordering keeps complete question objects and leaves the original list intact', () => {
  const list = [...questions, { ...questions[1], text: '셋째 문제', note: '세 번째 메모' }];
  const before = structuredClone(list);
  const reordered = moveQuestion(list, 0, 2);
  assert.deepEqual(list, before);
  assert.deepEqual(reordered, [list[1], list[2], list[0]]);
  assert.equal(reordered[2], list[0]);
  assert.equal(reordered[2].imageData, list[0].imageData);
  assert.deepEqual(moveQuestion(reordered, 2, 0), list);
});
test('invalid reorder positions cannot remove or duplicate questions', () => {
  const before = structuredClone(questions);
  for (const [from, to] of [[0, -1], [0, 2], [0, 0.5], [NaN, 0]]) assert.throws(() => moveQuestion(questions, from, to), RangeError);
  assert.deepEqual(questions, before);
  assert.equal(moveQuestion(questions, 1, 1), questions);
});

test('question display starts its timer automatically and waits for explicit answer reveal', () => {
  assert.equal(createState(questions).phase, 'cover');
  let s = step(createState(questions), 'show');
  assert.equal(s.phase, 'topic'); assert.equal(s.deadline, null);
  assert.equal(step(s, 'tick', 1999).phase, 'topic');
  assert.equal(step(s, 'reveal', 1999).phase, 'topic');
  s = step(s, 'tick', 2000);
  assert.equal(s.phase, 'question'); assert.equal(s.deadline, 12000);
  s = step(s, 'tick', 999999); assert.equal(s.phase, 'question'); assert.equal(s.remaining, 0);
  assert.equal(step(s, 'next').index, 0);
  s = step(s, 'reveal'); assert.equal(s.phase, 'answer');
  s = present(s, 'next'); assert.equal(s.index, 1); assert.equal(s.phase, 'question'); assert.equal(s.deadline, 12000);
});
test('timer expiry never reveals an answer or advances a question', () => {
  let s = present(createState(questions), 'show', 1000);
  assert.equal(secondsLeft(s, 9000), 4);
  s = step(s, 'tick', 13000);
  assert.equal(s.remaining, 0); assert.equal(s.deadline, null); assert.equal(s.phase, 'question'); assert.equal(s.index, 0);
});
test('pause resume and blank restore preserve remaining time', () => {
  let s = present(createState(questions), 'show', 1000);
  s = step(s, 'pause', 4000); assert.equal(s.remaining, 9);
  s = step(s, 'timer', 20000); assert.equal(s.deadline, 29000);
  s = step(s, 'blank', 22000); assert.equal(s.remaining, 7); assert.equal(s.blank, true);
  assert.equal(step(s, 'reveal').phase, 'question');
  s = step(s, 'blank', 30000); assert.equal(s.deadline, null); assert.equal(s.remaining, 7);
});
test('manual early reveal cancels timer and stale ticks cannot affect next problem', () => {
  let s = present(createState(questions));
  s = step(s, 'reveal', 2500); assert.equal(s.deadline, null);
  s = present(s, 'next', 3000); s = step(s, 'tick', 20000);
  assert.equal(s.index, 1); assert.equal(s.phase, 'question'); assert.equal(s.remaining, 0);
});
test('saved timing is normalized to ten seconds and next previous restart automatically', () => {
  const list = Array.from({ length: 7 }, (_, i) => ({ ...questions[0], text: `문제 ${i + 1}`, seconds: 60 }));
  let s = createState(questions, { questions: list });
  assert.deepEqual(s.questions.map(q => q.seconds), [10, 10, 10, 10, 10, 10, 10]);
  s = step(s, 'select', 0, { index: 4 }); s = present(s, 'show', 1000);
  assert.equal(secondsLeft(s, 3000), 10);
  s = step(s, 'reveal', 4000); s = present(s, 'next', 5000);
  assert.equal(s.index, 5); assert.equal(secondsLeft(s, 7000), 10);
  s = present(s, 'previous', 8000); assert.equal(s.index, 4); assert.equal(secondsLeft(s, 10000), 10);
  s = step(s, 'select', 11000, { index: 5 }); s = present(s, 'show', 12000);
  s = step(s, 'tick', 24000); assert.equal(s.phase, 'question'); assert.equal(s.remaining, 0);
  s = step(s, 'timer', 25000); assert.equal(secondsLeft(s, 25000), 10);
});
test('moving questions preserves content and normalizes legacy position limits to ten seconds', () => {
  const list = Array.from({ length: 7 }, (_, i) => ({ ...questions[0], text: `문제 ${i + 1}`, seconds: i < 5 ? 10 : 5 }));
  const reordered = moveQuestion(list, 5, 0);
  const s = step(createState(list), 'apply', 0, { questions: reordered });
  const content = q => Object.fromEntries(Object.entries(q).filter(([key]) => key !== 'seconds'));
  assert.deepEqual(s.questions.map(content), reordered.map(content));
  assert.deepEqual(s.questions.map(q => q.seconds), [10, 10, 10, 10, 10, 10, 10]);
  assert.equal(s.questions[0].text, '문제 6'); assert.equal(s.questions[5].text, '문제 5');
});
test('page navigation and selection cancel an automatic timer', () => {
  for (const type of ['prizes', 'ready', 'end', 'select']) {
    const s = step(present(createState(questions), 'show', 1000), type, 4000, { index: 1 });
    assert.equal(s.deadline, null); assert.equal(s.remaining, null);
    assert.notEqual(step(s, 'tick', 999999).phase, 'question');
  }
});
test('first main slot is always warming up while moved questions retain their original topic', () => {
  const list = [{ ...questions[0], category: '전기' }, { ...questions[1], category: '문학' }];
  assert.equal(questionCategory(list[0], 0), '워밍업');
  const moved = moveQuestion(list, 1, 0);
  assert.equal(questionCategory(moved[0], 0), '워밍업');
  assert.equal(questionCategory(moved[1], 1), '전기');
  assert.equal(questionCategory(moved[0], 0, 'bonus'), '문학');
});
test('interlude freezes main question time and returns to the same question without replacing the bank', () => {
  let s = present(createState(questions));
  const original = s.questions;
  s = step(s, 'interlude', 5000, { question: { ...questions[1], category: '넌센스', kind: 'open', openAnswer: '가상 정답' } });
  assert.equal(s.mode, 'bonus'); assert.equal(s.mainState.remaining, 7);
  assert.equal(s.questions[0].kind, 'open');
  s = step(s, 'tick', 7000); assert.equal(secondsLeft(s, 7000), 10);
  s = step(s, 'reveal', 8000); s = step(s, 'next', 9000);
  assert.equal(s.mode, 'main'); assert.equal(s.index, 0); assert.equal(s.phase, 'question');
  assert.equal(s.questions, original); assert.equal(s.deadline, null); assert.equal(s.remaining, 7);
  s = step(s, 'timer', 20000); assert.equal(secondsLeft(s, 20000), 7);
});

test('a manual singing bonus remains untimed under the uniform ten-second policy', () => {
  let s = present(createState(questions));
  s = step(s, 'interlude', 3000, { question: { ...questions[1], category: '노래', timerMode: 'manual' } });
  assert.equal(s.questions[0].seconds, 10);
  s = step(s, 'tick', 5000); assert.equal(s.phase, 'question'); assert.equal(s.deadline, null); assert.equal(s.remaining, null);
  assert.equal(step(s, 'timer', 6000), s);
  assert.equal(step(s, 'tick', 999999), s);
  assert.equal(step(s, 'reveal', 1000000).phase, 'answer');
});
test('interlude keeps an answered main round and repeated interludes never nest or overwrite main', () => {
  const main = step(present(createState(questions)), 'reveal', 3000);
  let s = step(main, 'interlude', 4000, { question: questions[1] });
  s = step(s, 'interlude', 5000, { question: questions[0] });
  assert.equal(s.mainState.phase, 'answer'); assert.equal(s.mainState.mainState, null);
  assert.equal(step(s, 'apply', 0, { questions: [questions[1]] }), s);
  s = step(s, 'resume-main', 10000);
  assert.equal(s.phase, 'answer'); assert.equal(s.index, 0); assert.deepEqual(s.questions, main.questions);
});
test('paused main topic can resume its remaining introduction after an interlude', () => {
  let s = step(createState(questions), 'show', 0);
  s = step(s, 'pause', 500); assert.equal(s.topicRemaining, 1500);
  s = step(s, 'interlude', 1000, { question: questions[1] }); s = step(s, 'end', 2000);
  assert.equal(s.phase, 'topic'); assert.equal(s.topicDeadline, null); assert.equal(s.topicRemaining, 1500);
  s = step(s, 'timer', 10000); assert.equal(step(s, 'tick', 11499).phase, 'topic');
  s = step(s, 'tick', 11500); assert.equal(s.phase, 'question'); assert.equal(secondsLeft(s, 11500), 10);
});
test('prizes ready selection and last answer transition are entirely manual', () => {
  let s = step(createState(questions), 'prizes');
  s = step(s, 'tick', 100000); assert.equal(s.phase, 'prizes');
  s = step(s, 'ready'); assert.equal(s.phase, 'ready');
  s = step(s, 'select', 0, { index: 1 }); s = present(s); s = step(s, 'reveal');
  assert.equal(step(s, 'next').phase, 'end');
  s = present(s, 'previous'); assert.equal(s.index, 0); assert.equal(s.phase, 'question');
});
test('saved edited questions choices images and hand direction survive voice removal', () => {
  const saved = { questions: [{ ...questions[0], text: '편집된 문제', scriptQuestion: '옛 대본' }], left: 'X', settings: { speak: true, cohost: '옛 설정' } };
  const s = createState(questions, saved);
  assert.equal(s.questions[0].text, '편집된 문제'); assert.equal(s.left, 'X');
  assert.equal(s.questions[0].imageData, questions[0].imageData);
  assert.equal(s.questions[0].scriptQuestion, undefined); assert.equal(s.settings, undefined);
});
test('apply validates before replacing state and always returns to ready', () => {
  const s = present(createState(questions));
  assert.throws(() => step(s, 'apply', 0, { questions: [] })); assert.equal(s.phase, 'question');
  assert.equal(step(s, 'apply', 0, { questions: [questions[1]] }).phase, 'ready');
});
test('custom choice CSV handles quoted commas and rejects incomplete quotes', () => {
  const q = importCsv('문제,선택지1,선택지2,정답,제한시간,해설\r\n"첫, 문제",빛,전기,빛,10,"해설, 내용"')[0];
  assert.equal(q.text, '첫, 문제'); assert.equal(q.answer, 'O'); assert.equal(q.explanation, '해설, 내용');
  assert.throws(() => importCsv('문제,정답\n"미완성'));
  assert.throws(() => validateQuestions([{ ...questions[0], imageData: 'https://example.com/image.png' }]));
});


test('draft storage references embedded photos once and exactly restores additions deletions and metadata', () => {
  const imageData = `data:image/png;base64,${'YQ=='.repeat(10000)}`;
  const base = validateQuestions([{ ...questions[0], imageData: questions[0].imageData, sources: ['출처1', '출처2'] }, questions[1]]);
  base[0].imageData = imageData;
  const changed = { ...base[0], text: '편집', answer: 'X', sources: ['새 출처'] }; delete changed.review;
  const draft = [base[1], changed, { ...base[1], text: '' }];
  const serialized = encodeQuestionStore(base, 'X', draft), saved = JSON.parse(serialized);
  assert.equal(serialized.split(imageData).length - 1, 1);
  assert.deepEqual(restoreQuestionDraft(saved, base), draft);
  assert.equal(saved.left, 'X');
  assert.throws(() => restoreQuestionDraft({ editorDraft: [{ from: 100 }] }, base));
});

test('asset refresh replaces only an exact legacy image and preserves custom images content and order', () => {
  const old = questions[0].imageData;
  const list = [{ ...questions[0], text: '사용자 수정 마스코트', answer: 'X' }, { ...questions[1], imageData: 'data:image/png;base64,Yg==' }];
  const image = { imageData: 'data:image/jpeg;base64,Yw==', imageAlt: '새 대표 이미지', imageSource: 'https://example.com/new' };
  const result = refreshQuestionImages(list, [{ fromImageData: old, image }]);
  assert.equal(list[0].imageData, old); assert.equal(result[0].imageData, image.imageData);
  assert.equal(result[0].text, list[0].text); assert.equal(result[0].answer, 'X'); assert.equal(result[0].note, list[0].note);
  assert.equal(result[1], list[1]); assert.equal(result[0].imageSource, image.imageSource);
});
