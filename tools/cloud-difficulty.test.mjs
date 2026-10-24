import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createState, importCsv, validateQuestions } from '../web/src/quiz/manual-model.js';
import { encodeQuestionStore, restoreQuestionDraft } from '../web/src/quiz/question-storage.js';
import { makePublicView } from '../web/src/quiz/presentation.js';
import { ManualService } from '../cloud/manual-service.mjs';
import { createLocalStore } from '../cloud/store.mjs';

const question = { text: '직각은 90도이다.', choiceO: 'O', choiceX: 'X', answer: 'O', seconds: 10, explanation: '직각은 90도입니다.', category: '수학' };

test('difficulty remains optional for the unchanged 31-question default bank and accepts only the three explicit levels', async () => {
  const defaults = JSON.parse(await readFile(new URL('../questions/default.json', import.meta.url), 'utf8'));
  const legacy = validateQuestions(defaults);
  assert.equal(legacy.length, 31); assert(legacy.every(q => !Object.hasOwn(q, 'difficulty')));
  for (const difficulty of ['상', '중', '하']) {
    const combined = validateQuestions([...defaults, { ...question, difficulty }]);
    assert.deepEqual(combined.slice(0, 31), legacy); assert.equal(combined.at(-1).difficulty, difficulty);
  }
  for (const difficulty of ['', '초급', 'HIGH', 1, null, {}, [], ' 상 ']) {
    assert.throws(() => validateQuestions([{ ...question, difficulty }]), /난이도는 상·중·하/);
  }
});

test('CSV and JSON imports carry difficulty while absent or blank CSV classification stays optional', () => {
  const rows = '문제,정답,해설,난이도\n직각은 90도이다.,O,직각은 90도입니다.,상\n1 더하기 1은 2이다.,O,합은 2입니다.,\n';
  const imported = importCsv(rows);
  assert.equal(imported[0].difficulty, '상'); assert.equal(Object.hasOwn(imported[1], 'difficulty'), false);
  assert.deepEqual(validateQuestions(JSON.parse(JSON.stringify(imported))), imported);
  assert.equal(Object.hasOwn(importCsv('문제,정답,해설\n직각은 90도이다.,O,직각은 90도입니다.')[0], 'difficulty'), false);
  assert.throws(() => importCsv(rows.replace(',상\n', ',어려움\n')), /난이도는 상·중·하/);
});

test('question draft JSON preserves selected difficulty and deletion without changing the confirmed bank', () => {
  const confirmed = validateQuestions([{ ...question, difficulty: '중' }, { ...question, text: '두 번째 문제' }]);
  const draft = structuredClone(confirmed); delete draft[0].difficulty; draft[1].difficulty = '하';
  const encoded = JSON.parse(encodeQuestionStore(confirmed, 'O', draft));
  assert.deepEqual(encoded.questions, confirmed);
  const restored = restoreQuestionDraft(encoded, encoded.questions);
  assert.equal(Object.hasOwn(restored[0], 'difficulty'), false); assert.equal(restored[1].difficulty, '하');
  assert.equal(confirmed[0].difficulty, '중'); assert.equal(Object.hasOwn(confirmed[1], 'difficulty'), false);
  const corrupt = structuredClone(encoded); corrupt.editorDraft[1] = { value: { ...question, difficulty: '알 수 없음' } };
  assert.throws(() => restoreQuestionDraft(corrupt, corrupt.questions), /난이도를 읽지 못했습니다.*저장된 문제는 유지합니다/);
});

test('real service validation, apply ACK, durable JSON and restart retain difficulty without altering legacy metadata', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'ox-difficulty-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'state.json'), seed = [{ ...question, note: 'PRIVATE-NOTE' }, { ...question, text: '아직 공개하지 않은 문제' }];
  const service = await ManualService.create({ seed, store: createLocalStore(path), now: () => 1000, screenKey: 'difficulty-test-screen-key-1234567890' });
  t.after(() => service.close());
  const before = await service.adminState(), beforeDisk = JSON.parse(await readFile(path, 'utf8'));
  for (const [index, difficulty] of ['불명', '', null, 3].entries()) {
    await assert.rejects(service.action({ commandId: `invalid-difficulty-${index}`, revision: before.revision, action: { type: 'apply', questions: [{ ...question, difficulty }] } }), error => error.statusCode === 400 && /난이도/.test(error.message));
  }
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), beforeDisk);
  const questions = [...before.bank, { ...question, text: '추가 후보', difficulty: '상' }];
  const ack = await service.action({ commandId: 'difficulty-valid-apply', revision: before.revision, action: { type: 'apply', questions } });
  assert.equal(ack.bank.at(-1).difficulty, '상'); assert.deepEqual(ack.bank.slice(0, 2), before.bank);
  const disk = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(disk.state.questions.at(-1).difficulty, '상');
  assert.equal(disk.screenKey, beforeDisk.screenKey); assert.deepEqual(disk.recipients, beforeDisk.recipients);
  const reopened = await ManualService.create({ seed: [question], store: createLocalStore(path), now: () => 1000 });
  t.after(() => reopened.close());
  assert.deepEqual((await reopened.adminState()).bank, ack.bank);
});

test('difficulty is host-only metadata in every public question stage and never publishes the rest of the bank', () => {
  const state = createState([{ ...question, difficulty: '상', note: 'PRIVATE-NOTE' }, { ...question, text: 'PRIVATE-FUTURE-QUESTION', difficulty: '하' }]);
  for (const phase of ['cover', 'topic', 'question', 'answer']) {
    const view = makePublicView({ ...state, phase }, 1000), body = JSON.stringify(view);
    assert.doesNotMatch(body, /difficulty|PRIVATE-NOTE|PRIVATE-FUTURE-QUESTION|questions|bank/);
    if (phase === 'question' || phase === 'answer') assert.equal(view.question.text, question.text);
  }
  assert.equal(state.questions[0].difficulty, '상');
});
