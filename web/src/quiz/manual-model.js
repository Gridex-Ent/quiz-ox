export const choiceLabel = (q, choice) => choice === 'O' ? q.choiceO : q.choiceX;
export const questionSeconds = () => 10;
export const questionCategory = (question, index, mode = 'main') => mode === 'main' && index === 0 ? '워밍업' : question.category || question.topic || '상식';

// 문제 전체를 옮겨 정답·이미지·메모와 편집 중인 내용을 함께 보존한다.
export function moveQuestion(questions, from, to) {
  if (!Array.isArray(questions) || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= questions.length || to >= questions.length) {
    throw RangeError('이동할 번호는 현재 문제 수 안의 정수로 입력해 주세요.');
  }
  if (from === to) return questions;
  const reordered = [...questions];
  const [question] = reordered.splice(from, 1);
  reordered.splice(to, 0, question);
  return reordered;
}

export function validateQuestions(value) {
  if (!Array.isArray(value) || !value.length) throw Error('문제를 한 개 이상 넣어 주세요.');
  let imageChars = 0;
  return value.map((q, i) => {
    if (!q || typeof q.text !== 'string' || !q.text.trim() || !Number.isInteger(q.seconds) || q.seconds < 1 || q.seconds > 600 || typeof q.explanation !== 'string') throw Error(`${i + 1}번: 문제·해설·제한시간(1~600초)을 확인해 주세요.`);
    const choiceO = q.choiceO === undefined ? 'O' : typeof q.choiceO === 'string' ? q.choiceO.trim() : '';
    const choiceX = q.choiceX === undefined ? 'X' : typeof q.choiceX === 'string' ? q.choiceX.trim() : '';
    if (!choiceO || !choiceX || choiceO === choiceX) throw Error(`${i + 1}번: 서로 다른 보기를 두 개 입력해 주세요.`);
    const raw = String(q.answer).trim();
    const answer = ['O', 'X'].includes(raw) ? raw : raw === 'A' || raw === choiceO ? 'O' : raw === 'B' || raw === choiceX ? 'X' : null;
    if (!answer) throw Error(`${i + 1}번: 정답은 O/X, A/B 또는 보기의 내용이어야 합니다.`);
    const result = { text: q.text.trim(), choiceO, choiceX, answer, seconds: questionSeconds(i), explanation: q.explanation };
    for (const key of ['topic', 'category', 'review', 'note', 'source', 'imageAlt', 'imageSource', 'imageCredit', 'imageLicense', 'imageLicenseUrl', 'musicTitle', 'openAnswer']) {
      if (q[key] !== undefined && typeof q[key] !== 'string') throw Error(`${i + 1}번: ${key}는 문자열이어야 합니다.`);
      if (typeof q[key] === 'string') result[key] = q[key];
    }
    if (q.kind !== undefined) {
      if (!['open', 'ox'].includes(q.kind) || (q.kind === 'open' && !q.openAnswer?.trim())) throw Error(`${i + 1}번: 주관식 정답을 확인해 주세요.`);
      result.kind = q.kind;
    }
    if (q.timerMode !== undefined) {
      if (!['auto', 'manual'].includes(q.timerMode)) throw Error(`${i + 1}번: 타이머 방식을 확인해 주세요.`);
      result.timerMode = q.timerMode;
    } else if (q.topic === '노래' && q.text.includes('노래를 듣고')) result.timerMode = 'manual';
    if (q.musicYoutubeId !== undefined) {
      if (typeof q.musicYoutubeId !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(q.musicYoutubeId)) throw Error(`${i + 1}번: YouTube 영상 ID를 확인해 주세요.`);
      result.musicYoutubeId = q.musicYoutubeId;
    }
    if (q.imageReveal !== undefined) {
      if (!['question', 'answer'].includes(q.imageReveal)) throw Error(`${i + 1}번: 이미지 표시 시점을 확인해 주세요.`);
      result.imageReveal = q.imageReveal;
    }
    if (Array.isArray(q.sources)) result.sources = q.sources.filter(s => typeof s === 'string');
    if (q.imageData !== undefined && q.imageData !== '') {
      const data = q.imageData;
      if (typeof data !== 'string' || data.length > 1048576 || !/^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(data) || (data.length - data.indexOf(',') - 1) % 4 !== 0) throw Error(`${i + 1}번: 1MB 이하의 내장 PNG·JPEG·WebP·GIF 이미지를 사용해 주세요.`);
      imageChars += data.length;
      if (imageChars > 2097152) throw Error('문제집의 이미지 용량이 너무 큽니다.');
      result.imageData = data;
    }
    return result;
  });
}

export function createState(defaults, saved = null) {
  const samples = ['지구는 태양 주위를 돈다.', '문어의 심장은 하나다.', '소리는 진공에서도 전달된다.'];
  let questions = validateQuestions(defaults);
  if (saved?.questions) {
    const stored = validateQuestions(saved.questions);
    const oldSamples = stored.length === 3 && stored.every((q, i) => q.text === samples[i] && saved.questions[i].seconds === 15 && q.answer === (i === 0 ? 'O' : 'X') && q.choiceO === 'O' && q.choiceX === 'X' && !saved.questions[i].scriptQuestion && !saved.questions[i].scriptAnswer && q.explanation === ['지구는 태양 주위를 공전합니다.', '문어의 심장은 세 개입니다.', '소리는 전달할 매질이 필요합니다.'][i]);
    if (!oldSamples) questions = stored;
  }
  return { questions, index: 0, phase: 'cover', mode: 'main', mainState: null, left: saved?.left === 'X' ? 'X' : 'O', deadline: null, remaining: null, topicDeadline: null, topicRemaining: null, topicResumeAfterBlank: false, blank: false };
}

export const secondsLeft = (state, now) => state.deadline === null ? state.remaining : Math.max(0, Math.ceil((state.deadline - now) / 1000));

export function transition(state, action, now) {
  const reset = { deadline: null, remaining: null, topicDeadline: null, topicRemaining: null, topicResumeAfterBlank: false, blank: false };
  const show = index => ({ ...state, ...reset, index, phase: 'topic', topicDeadline: now + 2000 });
  const freeze = value => ({ ...value, deadline: null, remaining: value.deadline !== null ? secondsLeft(value, now) : value.remaining, topicDeadline: null, topicRemaining: value.topicDeadline !== null ? Math.max(0, value.topicDeadline - now) : value.topicRemaining });
  const main = () => state.mode === 'bonus' && state.mainState ? { ...state.mainState, mode: 'main', mainState: null } : state;
  if (state.blank && !['blank', 'cover', 'ready', 'prizes', 'end', 'apply', 'select', 'tick', 'interlude', 'resume-main'].includes(action.type)) return state;
  switch (action.type) {
    case 'show': return show(state.index);
    case 'cover': return { ...main(), ...reset, index: 0, phase: 'cover' };
    case 'interlude': {
      const question = validateQuestions([{ ...action.question, seconds: questionSeconds() }])[0];
      return { ...state, ...reset, mode: 'bonus', mainState: state.mode === 'bonus' ? state.mainState : freeze(state), questions: [question], index: 0, phase: 'topic', topicDeadline: now + 2000 };
    }
    case 'resume-main': return main();
    case 'select': return Number.isInteger(action.index) && action.index >= 0 && action.index < state.questions.length ? { ...state, ...reset, index: action.index, phase: 'ready' } : state;
    case 'ready': return { ...state, ...reset, phase: 'ready' };
    case 'prizes': return { ...state, ...reset, phase: 'prizes' };
    case 'end': return state.mode === 'bonus' ? main() : { ...state, ...reset, phase: 'end' };
    case 'timer':
      if (state.phase === 'topic' && state.topicDeadline === null) return { ...state, topicDeadline: now + (state.topicRemaining ?? 2000), topicRemaining: null };
      if (state.questions[state.index].timerMode === 'manual') return state;
      return state.phase !== 'question' || state.deadline !== null ? state : { ...state, deadline: now + (state.remaining > 0 ? state.remaining : questionSeconds(state.index, state.mode)) * 1000, remaining: null };
    case 'pause': return freeze(state);
    case 'tick':
      if (state.blank) return state;
      if (state.phase === 'topic' && state.topicDeadline !== null && now >= state.topicDeadline) return { ...state, topicDeadline: null, topicRemaining: null, phase: 'question', deadline: state.questions[state.index].timerMode === 'manual' ? null : now + questionSeconds(state.index, state.mode) * 1000 };
      return state.deadline !== null && secondsLeft(state, now) === 0 ? { ...state, deadline: null, remaining: 0 } : state;
    case 'reveal': return state.phase === 'question' ? { ...state, ...reset, phase: 'answer' } : state;
    case 'previous': return state.index > 0 ? show(state.index - 1) : state;
    case 'next': return state.phase !== 'answer' ? state : state.mode === 'bonus' ? main() : state.index + 1 < state.questions.length ? show(state.index + 1) : { ...state, ...reset, phase: 'end' };
    case 'hands': return ['cover', 'ready', 'prizes', 'end'].includes(state.phase) && ['O', 'X'].includes(action.left) ? { ...state, left: action.left } : state;
    case 'blank':
      if (state.phase === 'topic') return state.blank ? { ...state, blank: false, topicDeadline: state.topicResumeAfterBlank ? now + (state.topicRemaining ?? 2000) : null, topicRemaining: state.topicResumeAfterBlank ? null : state.topicRemaining, topicResumeAfterBlank: false } : { ...state, blank: true, topicDeadline: null, topicRemaining: state.topicDeadline !== null ? Math.max(0, state.topicDeadline - now) : state.topicRemaining, topicResumeAfterBlank: state.topicDeadline !== null };
      return { ...state, blank: !state.blank, ...(state.deadline !== null ? { deadline: null, remaining: secondsLeft(state, now) } : {}) };
    case 'apply': return state.mode === 'bonus' ? state : { ...state, ...reset, questions: validateQuestions(action.questions), index: 0, phase: 'ready' };
    default: return state;
  }
}

export function importCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === '"') { if (quoted && source[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && [',', '\r', '\n'].includes(c)) { row.push(field); field = ''; if (c !== ',') { rows.push(row); row = []; if (c === '\r' && source[i + 1] === '\n') i++; } }
    else field += c;
  }
  if (quoted) throw Error('CSV 따옴표가 닫히지 않았습니다.');
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map(c => c.trim()), get = (r, names) => r[header.findIndex(h => names.includes(h))]?.trim() || '';
  return validateQuestions(rows.filter(r => r.some(c => c.trim())).map(r => ({
    text: get(r, ['문제', 'text', 'question']), choiceO: get(r, ['선택지1', '보기1', '보기O', 'choiceO']) || 'O', choiceX: get(r, ['선택지2', '보기2', '보기X', 'choiceX']) || 'X',
    answer: get(r, ['정답', 'answer']), seconds: Number(get(r, ['제한시간', 'seconds', 'timeLimitSec']) || questionSeconds()), explanation: get(r, ['해설', 'explanation']),
    topic: get(r, ['분야', 'topic']), review: get(r, ['검토상태', 'review']), note: get(r, ['진행메모', 'note']),
    category: get(r, ['주제', 'category']),
  })));
}
