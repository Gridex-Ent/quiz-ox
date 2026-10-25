import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../web/src/quiz/manual-model.js';
import { makePublicView, renderQuizStage } from '../web/src/quiz/presentation.js';

const question = {
  text: '문제와 사진은 정답·보기 아래에 표시합니다.', choiceO: 'O', choiceX: 'X', answer: 'X', seconds: 10,
  explanation: 'REVEALED-EXPLANATION', note: 'PRIVATE-HOST-NOTE',
  imageData: 'data:image/png;base64,YQ==', imageAlt: 'ANSWER-ONLY-PHOTO', imageReveal: 'answer',
};
function render(phase, questionPatch = {}, statePatch = {}) {
  const state = { ...createState([{ ...question, ...questionPatch }]), phase, ...statePatch };
  return { html: renderQuizStage(makePublicView(state, 1000)), view: makePublicView(state, 1000), state };
}
function classOffset(html, name) {
  const tag = [...html.matchAll(/<[^>]+class="([^"]+)"[^>]*>/g)].find(match => match[1].split(/\s+/).includes(name));
  assert(tag, `expected visible ${name} element`);
  return tag.index;
}
const hands = html => [...html.matchAll(/<div class="([^"]+)"[^>]*>/g)]
  .map(match => match[1].split(/\s+/)).filter(classes => classes.includes('hand'));

test('question choices are in the top region before the question while the correct answer and answer-only image remain private', () => {
  const { html, view } = render('question');
  assert(classOffset(html, 'quiz-top') < classOffset(html, 'hands'));
  assert(classOffset(html, 'hands') < classOffset(html, 'question-visual'));
  assert(classOffset(html, 'question-visual') < classOffset(html, 'timer'));
  assert.equal(hands(html).length, 2);
  assert(!hands(html).some(classes => classes.includes('answer-choice')));
  assert.doesNotMatch(html, /class="answer |REVEALED-EXPLANATION|ANSWER-ONLY-PHOTO|PRIVATE-HOST-NOTE/);
  assert.equal(Object.hasOwn(view.question, 'answer'), false);
  assert.equal(Object.hasOwn(view.question, 'imageData'), false);
});

test('revealing an OX answer puts its answer and choices before the question and marks only the correct choice', () => {
  const { html } = render('answer');
  assert(classOffset(html, 'quiz-top') < classOffset(html, 'answer'));
  assert(classOffset(html, 'answer') < classOffset(html, 'hands'));
  assert(classOffset(html, 'hands') < classOffset(html, 'question-visual'));
  assert(classOffset(html, 'question-visual') < classOffset(html, 'explanation'));
  assert.match(html, /정답/);
  assert.match(html, /REVEALED-EXPLANATION/); assert.match(html, /ANSWER-ONLY-PHOTO/);
  const correct = hands(html).filter(classes => classes.includes('answer-choice'));
  assert.equal(correct.length, 1); assert(correct[0].includes('X'));
  assert.doesNotMatch(html, /PRIVATE-HOST-NOTE/);
});

test('swapping the visible choice order does not swap the answer identity or hand gesture mapping', () => {
  const q = { choiceO: '첫 번째 보기', choiceX: '두 번째 보기', answer: 'O' };
  const normal = render('answer', q, { left: 'O' }).html;
  const swapped = render('answer', q, { left: 'X' }).html;
  assert.deepEqual(hands(normal).map(classes => classes.includes('O') ? 'O' : 'X'), ['O', 'X']);
  assert.deepEqual(hands(swapped).map(classes => classes.includes('O') ? 'O' : 'X'), ['X', 'O']);
  for (const html of [normal, swapped]) {
    const correct = hands(html).filter(classes => classes.includes('answer-choice'));
    assert.equal(correct.length, 1); assert(correct[0].includes('O'));
    assert.match(html, /첫 번째 보기/); assert.match(html, /두 번째 보기/);
    assert.match(html, /class="choice-number"[^>]*>1번<\/span>/);
    assert.match(html, /class="choice-number"[^>]*>2번<\/span>/);
    assert(classOffset(html, 'answer') < classOffset(html, 'question-visual'));
  }
});

test('custom alternatives use stable 1/2 labels at the top before reveal and reveal the correct number with its text', () => {
  const q = { choiceO: '딥러닝', choiceX: '침수', answer: 'X' };
  const before = render('question', q).html, after = render('answer', q).html;
  for (const html of [before, after]) {
    assert(classOffset(html, 'hands') < classOffset(html, 'question-visual'));
    assert.match(html, /class="choice-number"[^>]*>1번<\/span>/);
    assert.match(html, /class="choice-number"[^>]*>2번<\/span>/);
    assert.match(html, /class="choice-label"[^>]*>딥러닝<\/span>/);
    assert.match(html, /class="choice-label"[^>]*>침수<\/span>/);
  }
  assert.doesNotMatch(before, /정답 2번|answer-choice|other-choice|REVEALED-EXPLANATION/);
  assert.match(after, /정답 2번 · 침수/);
  assert.equal(hands(after).filter(classes => classes.includes('answer-choice')).length, 1);
  assert.equal(hands(after).filter(classes => classes.includes('other-choice')).length, 1);
});

test('OX alternatives retain O/X labels without adding 1/2 prefixes', () => {
  const before = render('question').html, after = render('answer').html;
  for (const html of [before, after]) {
    assert.match(html, /class="choice-label"[^>]*>O<\/span>/);
    assert.match(html, /class="choice-label"[^>]*>X<\/span>/);
    assert.doesNotMatch(html, /class="choice-number"/);
  }
  assert.match(after, /정답 X/);
});

test('open questions have no choice row and only reveal their answer in the top region after the host reveals it', () => {
  const q = { kind: 'open', openAnswer: 'REVEALED-OPEN-ANSWER' };
  const before = render('question', q).html, after = render('answer', q).html;
  assert.equal(hands(before).length, 0); assert.equal(hands(after).length, 0);
  assert.doesNotMatch(before, /REVEALED-OPEN-ANSWER|REVEALED-EXPLANATION|ANSWER-ONLY-PHOTO/);
  assert.match(after, /REVEALED-OPEN-ANSWER/);
  assert(classOffset(after, 'quiz-top') < classOffset(after, 'answer'));
  assert(classOffset(after, 'answer') < classOffset(after, 'question-visual'));
});

test('long choice labels and open answers stay escaped when rendered in the new top region', () => {
  const choice = '<img src=x onerror=alert(1)>긴 선택지 & "따옴표"';
  const html = render('answer', { text: '<script>question()</script>', choiceO: choice, answer: 'O', explanation: '<svg onload=alert(2)>' }).html;
  assert.match(html, /&lt;img/); assert.match(html, /&amp;/); assert.match(html, /&quot;/);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;svg/);
  assert.doesNotMatch(html, /<img src=x|<script>|<svg/);
  const open = render('answer', { kind: 'open', openAnswer: '<b>열린 정답</b>' }).html;
  assert.match(open, /&lt;b&gt;열린 정답&lt;\/b&gt;/); assert.doesNotMatch(open, /<b>열린 정답<\/b>/);
});

test('topic and blank stages never acquire the top answer region or future answer material', () => {
  const topic = render('topic').html, blank = render('answer', {}, { blank: true }).html;
  for (const html of [topic, blank]) assert.doesNotMatch(html, /quiz-top|answer-choice|REVEALED-EXPLANATION|ANSWER-ONLY-PHOTO/);
  assert.equal(blank, '<div class="stage black"></div>');
});
