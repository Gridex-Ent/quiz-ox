import savedQuizData from '../../../questions/bonus-quiz-2026.json' with { type: 'json' };
import { questionSeconds } from './manual-model.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const phaseNames = { cover: '대문', prizes: '상품 소개', ready: '문제 대기', topic: '주제 소개', question: '문제 공개', answer: '정답 공개', end: '종료' };
export const SAVED_RUNBOOK_GROUPS = Object.freeze(savedQuizData.groups.map(group => Object.freeze({
  ...group, items: Object.freeze(group.items.map(item => Object.freeze({ ...item }))),
})));

export function createSavedRunbookQuestion(id) {
  const group = SAVED_RUNBOOK_GROUPS.find(group => group.items.some(question => question.id === id));
  const item = group?.items.find(question => question.id === id);
  if (!item) throw Error('저장된 번외 문제를 선택해 주세요.');
  const source = item.source ?? group.source ?? savedQuizData.source;
  const provenance = ['authored', 'user-provided'].includes(source.kind) ? `${source.label} (${source.createdAt}) · ${item.id}` : `${source.path}:${item.line} (${source.recordedAt})`;
  return {
    ...createRunbookQuestion({ ...item, category: item.category || group.category || '넌센스' }),
    ...(item.hostNote ? { note: field(item.hostNote, '진행자 멘트') } : {}),
    source: provenance,
  };
}

function field(value, label, { required = false, max = 4000 } = {}) {
  if (value !== undefined && typeof value !== 'string') throw TypeError(`${label}는 글자로 입력해 주세요.`);
  const text = (value || '').trim();
  if (required && !text) throw Error(`${label}를 입력해 주세요.`);
  if (text.length > max) throw Error(`${label}는 ${max}자 이내로 입력해 주세요.`);
  return text;
}

export function createRunbookQuestion(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw TypeError('즉석 문제 내용을 확인해 주세요.');
  const kind = input.kind === undefined ? 'open' : input.kind;
  if (!['open', 'ox'].includes(kind)) throw Error('문제 형식은 주관식 또는 OX를 선택해 주세요.');
  const category = field(input.category, '주제', { max: 60 }) || '번외 퀴즈';
  const question = {
    text: field(input.text, '문제', { required: true, max: 2000 }),
    category, topic: category, answer: 'O', choiceO: 'O', choiceX: 'X', seconds: questionSeconds(),
    explanation: field(input.explanation, '해설'),
  };
  if (kind === 'open') {
    question.kind = 'open';
    question.openAnswer = field(input.openAnswer, '정답', { required: true, max: 1000 });
  } else {
    if (!['O', 'X'].includes(input.answer)) throw Error('OX 정답은 O 또는 X를 선택해 주세요.');
    question.answer = input.answer;
  }
  return question;
}

export function copyRunbookQuestion(question) {
  if (!question || typeof question !== 'object' || Array.isArray(question) || typeof question.text !== 'string' || !question.text.trim() || !['O', 'X'].includes(question.answer) || typeof question.explanation !== 'string') {
    throw Error('복사할 본게임 문제를 선택해 주세요.');
  }
  if (question.kind === 'open' && (typeof question.openAnswer !== 'string' || !question.openAnswer.trim())) throw Error('주관식 문제의 정답을 확인해 주세요.');
  return { ...structuredClone(question), seconds: questionSeconds() };
}

// 인스턴스를 유지한 채 페이지를 숨기면 즉석 문제와 체크 상태가 유지된다.
// questions/index/phase에는 번외 문제로 교체하기 전 본게임 상태를 전달한다.
export function createRunbook({ root, onQuiz, onBack } = {}) {
  if (!root || typeof root.querySelector !== 'function' || !('innerHTML' in root)) throw TypeError('런북을 표시할 요소가 필요합니다.');
  if (typeof onQuiz !== 'function' || typeof onBack !== 'function') throw TypeError('런북 출제·복귀 함수를 연결해 주세요.');
  root.innerHTML = `<section class="panel"><h2>본게임 진행 위치</h2><p data-runbook-status role="status"></p><p class="hint">번외 문제는 본게임의 문제 내용과 순서를 바꾸지 않습니다. 마친 뒤 본게임으로 돌아가세요.</p><button class="primary" type="button" data-runbook-back>본게임으로 돌아가기</button></section>
<section class="panel"><h2>사회자 진행 순서</h2><ol style="padding-left:24px;line-height:1.7">
<li><label style="display:flex;flex-direction:row;align-items:baseline"><input type="checkbox" style="width:auto"> 대문에서 참가자를 맞이합니다.</label></li>
<li><label style="display:flex;flex-direction:row;align-items:baseline"><input type="checkbox" style="width:auto"> 상품 소개 페이지에서 오늘의 상품을 소개합니다.</label></li>
<li><label style="display:flex;flex-direction:row;align-items:baseline"><input type="checkbox" style="width:auto"> 첫 문제는 워밍업입니다. 틀려도 탈락하지 않는다고 안내합니다.</label></li>
<li><label style="display:flex;flex-direction:row;align-items:baseline"><input type="checkbox" style="width:auto"> 문제 공개 → 주제 2초 → 문제와 자동 타이머 → 직접 정답 공개 → 다음 문제로 진행합니다.</label><p class="hint">본게임·번외 일반 문제는 모두 10초이며 노래 문제는 제한시간이 없습니다. 시간 종료만으로 정답이 공개되지 않습니다.</p></li>
<li><label style="display:flex;flex-direction:row;align-items:baseline"><input type="checkbox" style="width:auto"> 페이커 문제 뒤 패자부활전의 진행 여부와 방식은 사회자가 판단합니다.</label></li>
<li><label style="display:flex;flex-direction:row;align-items:baseline"><input type="checkbox" style="width:auto"> 종료 화면을 띄운 뒤 상품 수령 기록을 작성합니다.</label></li>
</ol></section>
<section class="panel"><h2>저장된 번외 퀴즈</h2><p class="hint">${SAVED_RUNBOOK_GROUPS.map(group => escapeHtml(group.label)).join(' · ')}. 본게임 순서와 별도로 골라 출제합니다.</p><label>번호 · 문제<select data-runbook-saved-select aria-label="저장된 번외 문제">${SAVED_RUNBOOK_GROUPS.map(group => `<optgroup label="${escapeHtml(group.label)}">${group.items.map(item => `<option value="${escapeHtml(item.id)}">${item.number}. ${escapeHtml(item.text)}</option>`).join('')}</optgroup>`).join('')}</select></label><p data-runbook-saved-answer class="hint" style="white-space:pre-wrap" aria-label="저장된 번외 정답 (관리자 전용)"></p><div class="buttons"><button class="primary" type="button" data-runbook-saved-launch>선택한 번외 문제 출제</button></div><p class="hint">정답 공개 전에는 위 정답이 진행자에게만 보입니다. 정답 공개를 누르면 정답·해설을 참가자에게 보여 주며, 진행자 멘트는 계속 진행실에만 표시합니다.</p></section>
<section class="panel"><h2>본게임 문제를 복사해 번외 출제</h2><label>복사할 문제<select data-runbook-main-select aria-label="번외로 복사할 본게임 문제"></select></label><div class="buttons"><button type="button" data-runbook-copy>선택한 문제로 번외 출제</button></div><p class="hint">사진·노래 정보와 정답·해설을 함께 복사합니다. 일반 번외 제한시간은 10초이며 노래 문제는 제한시간이 없습니다.</p></section>
<section class="panel"><h2>즉석 번외 퀴즈</h2><form data-runbook-form novalidate><div class="editor-grid">
<label>문제 형식<select data-runbook-kind><option value="open">주관식</option><option value="ox">OX</option></select></label>
<label>주제<input data-runbook-category maxlength="60" placeholder="예: 넌센스, 상식"></label>
<label class="wide">문제<textarea data-runbook-text maxlength="2000" required></textarea></label>
<label class="wide" data-runbook-open-fields>주관식 정답<input data-runbook-answer maxlength="1000" required autocomplete="off"></label>
<label data-runbook-ox-fields hidden>OX 정답<select data-runbook-ox-answer><option value="O">O</option><option value="X">X</option></select></label>
<label class="wide">해설·진행 멘트<textarea data-runbook-explanation maxlength="4000"></textarea></label>
</div><div class="buttons"><button class="primary" type="submit" data-runbook-submit>즉석 문제 출제</button></div></form><p class="hint">주관식은 정답을 자유롭게 말하는 방식입니다. 번외 제한시간은 10초이며 정답은 직접 공개합니다. 작성한 내용은 이 창에서 유지됩니다.</p></section>
<p data-runbook-message role="status" aria-live="polite"></p>`;
  const get = name => {
    const element = root.querySelector(`[data-runbook-${name}]`);
    if (!element) throw Error(`런북 요소를 찾지 못했습니다: ${name}`);
    return element;
  };
  const elements = Object.fromEntries(['status', 'saved-select', 'saved-answer', 'saved-launch', 'main-select', 'copy', 'form', 'kind', 'category', 'text', 'answer', 'explanation', 'open-fields', 'ox-fields', 'ox-answer', 'submit', 'message', 'back'].map(name => [name, get(name)]));
  let questions = [], inBonus = false, alive = true, questionSignature = null;
  const message = text => { elements.message.textContent = text; };
  const launch = question => {
    const result = onQuiz(question);
    const success = () => { if (alive) message('번외 문제를 출제했습니다. 정답을 공개한 뒤 본게임으로 돌아가세요.'); };
    if (result?.then) {
      message('번외 문제를 서버에 반영하는 중입니다.');
      void result.then(success).catch(error => { if (alive) message(error.message || '번외 문제를 출제하지 못했습니다. 연결을 확인해 주세요.'); });
    } else success();
  };
  const showSavedAnswer = () => {
    if (!alive) return;
    try {
      const selected = createSavedRunbookQuestion(elements['saved-select'].value);
      elements['saved-answer'].textContent = `관리자 전용 정답: ${selected.kind === 'open' ? selected.openAnswer : selected.answer}${selected.explanation ? `\n${selected.explanation}` : ''}${selected.note ? `\n\n진행자 전용 멘트\n${selected.note}` : ''}`;
    } catch (error) { elements['saved-answer'].textContent = error.message; }
  };
  const launchSaved = () => {
    if (inBonus || !alive) return;
    try { launch(createSavedRunbookQuestion(elements['saved-select'].value)); }
    catch (error) { message(error.message); }
  };
  const copy = () => {
    if (inBonus || !alive) return;
    try { launch(copyRunbookQuestion(questions[Number(elements['main-select'].value)])); }
    catch (error) { message(error.message); }
  };
  const submit = event => {
    event.preventDefault();
    if (inBonus || !alive) return;
    try {
      launch(createRunbookQuestion({
        kind: elements.kind.value, category: elements.category.value, text: elements.text.value,
        openAnswer: elements.answer.value, answer: elements['ox-answer'].value, explanation: elements.explanation.value,
      }));
    } catch (error) { message(error.message); }
  };
  const changeKind = () => {
    const open = elements.kind.value === 'open';
    elements['open-fields'].hidden = !open;
    elements['open-fields'].style.display = open ? '' : 'none';
    elements.answer.required = open;
    elements['ox-fields'].hidden = open;
    elements['ox-fields'].style.display = open ? 'none' : '';
  };
  const back = () => { if (alive) onBack(); };
  const bindings = [[elements['saved-select'], 'change', showSavedAnswer], [elements['saved-launch'], 'click', launchSaved], [elements.copy, 'click', copy], [elements.form, 'submit', submit], [elements.kind, 'change', changeKind], [elements.back, 'click', back]];
  for (const [element, name, listener] of bindings) element.addEventListener(name, listener);
  elements['saved-select'].value = SAVED_RUNBOOK_GROUPS[0].items[0].id;
  showSavedAnswer();
  changeKind();
  return {
    render({ questions: nextQuestions = [], index = 0, phase = 'ready', inBonus: nextBonus = false } = {}) {
      if (!alive) return;
      if (!Array.isArray(nextQuestions)) throw TypeError('본게임 문제 목록을 확인해 주세요.');
      questions = nextQuestions;
      inBonus = Boolean(nextBonus);
      const currentIndex = Number.isInteger(index) && index >= 0 && index < questions.length ? index : 0;
      const location = questions.length ? `${currentIndex + 1} / ${questions.length}번` : '문제 없음';
      elements.status.textContent = `${inBonus ? '번외 퀴즈 진행 중 · 본게임 대기' : '현재 본게임'}: ${location} · ${phaseNames[phase] || '진행 대기'}`;
      const signature = JSON.stringify(questions.map(question => [question.text, question.category, question.topic]));
      if (signature !== questionSignature) {
        const selected = questionSignature === null ? currentIndex : Number(elements['main-select'].value);
        elements['main-select'].innerHTML = questions.map((question, i) => `<option value="${i}">${i + 1}. ${escapeHtml(question.text)}</option>`).join('');
        elements['main-select'].value = String(Number.isInteger(selected) && selected >= 0 && selected < questions.length ? selected : currentIndex);
        questionSignature = signature;
      }
      elements['main-select'].disabled = inBonus || !questions.length;
      elements.copy.disabled = inBonus || !questions.length;
      elements.submit.disabled = inBonus;
      elements['saved-select'].disabled = inBonus;
      elements['saved-launch'].disabled = inBonus;
      elements.back.textContent = inBonus ? '본게임으로 돌아가기' : '진행 화면으로';
    },
    destroy() {
      if (!alive) return;
      alive = false;
      for (const [element, name, listener] of bindings) element.removeEventListener(name, listener);
      root.innerHTML = '';
    },
  };
}
