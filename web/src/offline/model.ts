import eventQuestionData from '../../../questions/kiee-a-2026-offline.json';

export interface Question {
  text: string;
  answer: 'O' | 'X';
  choiceO: string;
  choiceX: string;
  explanation: string;
  seconds: number;
  topic?: string;
  review?: string;
  note?: string;
  source?: string;
  sources?: string[];
}
export interface OfflineState {
  questions: Question[];
  index: number;
  phase: 'ready' | 'question' | 'answer' | 'end';
  left: 'O' | 'X';
  deadline: number | null;
  remaining: number | null;
  blank: boolean;
}
export const KEY = 'ox-offline-v1';
const oldSamples = [
  { text: '지구는 태양 주위를 돈다.', answer: 'O', explanation: '지구는 태양 주위를 공전합니다.', seconds: 15 },
  { text: '문어의 심장은 하나다.', answer: 'X', explanation: '문어의 심장은 세 개입니다.', seconds: 15 },
  { text: '소리는 진공에서도 전달된다.', answer: 'X', explanation: '소리는 전달할 매질이 필요합니다.', seconds: 15 },
];
export const eventQuestions = validateQuestions(eventQuestionData);
export const initial: OfflineState = {
  questions: eventQuestions, index: 0, phase: 'ready', left: 'O', deadline: null, remaining: null, blank: false,
};
export function choiceLabel(q: Question, choice: 'O' | 'X'): string { return choice === 'O' ? q.choiceO : q.choiceX; }
export function validateQuestions(value: unknown): Question[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('문제를 한 개 이상 넣어 주세요.');
  return value.map((v: unknown, i) => {
    const q = v as Record<string, unknown> | null;
    const choiceO = typeof q?.choiceO === 'string' ? q.choiceO.trim() : q?.choiceO === undefined ? 'O' : '';
    const choiceX = typeof q?.choiceX === 'string' ? q.choiceX.trim() : q?.choiceX === undefined ? 'X' : '';
    const rawAnswer = typeof q?.answer === 'string' ? q.answer.trim() : '';
    const code = rawAnswer.toUpperCase();
    const answer = code === 'O' || code === 'X' ? code : rawAnswer === choiceO ? 'O' : rawAnswer === choiceX ? 'X' : code === 'A' ? 'O' : code === 'B' ? 'X' : null;
    if (!q || typeof q.text !== 'string' || !q.text.trim() || answer === null ||
      typeof q.seconds !== 'number' || !Number.isInteger(q.seconds) || q.seconds < 1 || q.seconds > 600 || typeof q.explanation !== 'string') {
      throw new Error(`${i + 1}번 문제: 문제·정답·해설과 제한시간(1~600초)을 확인해 주세요.`);
    }
    if (!choiceO || !choiceX || choiceO === choiceX) throw new Error(`${i + 1}번 문제: 서로 다른 보기 두 개를 입력해 주세요.`);
    for (const key of ['topic', 'review', 'note', 'source']) {
      if (q[key] !== undefined && typeof q[key] !== 'string') throw new Error(`${i + 1}번 문제: ${key}는 문자열이어야 합니다.`);
    }
    if (q.sources !== undefined && (!Array.isArray(q.sources) || q.sources.some(s => typeof s !== 'string'))) {
      throw new Error(`${i + 1}번 문제: 출처는 문자열 목록이어야 합니다.`);
    }
    return {
      text: q.text.trim(), answer, choiceO, choiceX, explanation: q.explanation, seconds: q.seconds,
      ...(q.topic !== undefined ? { topic: q.topic as string } : {}),
      ...(q.review !== undefined ? { review: q.review as string } : {}),
      ...(q.note !== undefined ? { note: q.note as string } : {}),
      ...(q.source !== undefined ? { source: q.source as string } : {}),
      ...(q.sources !== undefined ? { sources: [...q.sources as string[]] } : {}),
    };
  });
}
export function readState(): OfflineState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initial;
    const s = JSON.parse(raw) as OfflineState;
    const questions = validateQuestions(s.questions);
    if (JSON.stringify(questions) === JSON.stringify(validateQuestions(oldSamples))) return initial;
    if (!Number.isInteger(s.index) || s.index < 0 || s.index >= questions.length ||
      !['ready', 'question', 'answer', 'end'].includes(s.phase) || !['O', 'X'].includes(s.left) ||
      !(s.deadline === null || Number.isFinite(s.deadline)) || !(s.remaining === null || Number.isFinite(s.remaining))) return initial;
    return { ...s, questions };
  } catch { return initial; }
}
export function importCsv(text: string): Question[] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') {
      if (quoted && source[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
      row.push(field); field = '';
      if (c !== ',') { rows.push(row); row = []; if (c === '\r' && source[i + 1] === '\n') i++; }
    } else field += c;
  }
  if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift()?.map(c => c.trim()) ?? [];
  const get = (r: string[], names: string[]) => r[header.findIndex(h => names.includes(h))]?.trim() ?? '';
  return validateQuestions(rows.filter(r => r.some(c => c.trim())).map(r => ({
    text: get(r, ['문제', 'text', 'question']), answer: get(r, ['정답', 'answer']),
    choiceO: get(r, ['선택지1', '보기1', '보기O', 'choiceO']) || 'O',
    choiceX: get(r, ['선택지2', '보기2', '보기X', 'choiceX']) || 'X',
    explanation: get(r, ['해설', 'explanation']), seconds: Number(get(r, ['제한시간', 'seconds', 'timeLimitSec']) || 15),
    topic: get(r, ['분야', 'topic']), review: get(r, ['검토상태', 'review']), note: get(r, ['진행메모', 'note']),
    sources: get(r, ['출처', 'sources']).split('|').map(s => s.trim()).filter(Boolean),
  })));
}
