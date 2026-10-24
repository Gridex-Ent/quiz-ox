import { validateQuestions } from './manual-model.js';

const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const textKey = text => typeof text === 'string' ? text.normalize('NFKC').replace(/\s+/gu, '').toLowerCase() : '';
const draftKeys = draft => new Set(draft.map(question => textKey(question?.text)).filter(Boolean));
const safeSource = value => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
};

// 후보만 검증한다. 진행자가 작성 중인 편집란에는 아직 빈 문제도 있을 수 있다.
export function validateCatalog(value) {
  if (!Array.isArray(value) || !value.length) throw TypeError('문제은행 후보를 한 개 이상 준비해 주세요.');
  const ids = new Set(), texts = new Set();
  return value.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) throw Error('문제은행 후보 ID는 서로 다른 영문 소문자·숫자·하이픈이어야 합니다.');
    if (typeof item.category !== 'string' || !item.category.trim()) throw Error('문제은행 후보의 주제를 확인해 주세요.');
    if (!['상', '중', '하'].includes(item.difficulty)) throw Error('문제은행 후보의 난이도는 상·중·하 중에서 지정해 주세요.');
    const question = validateQuestions([item])[0], key = textKey(question.text);
    if (texts.has(key)) throw Error('문제은행에 같은 문제 문구가 두 번 들어 있습니다.');
    ids.add(item.id); texts.add(key);
    return { id: item.id, ...question, category: question.category.trim(), difficulty: item.difficulty };
  });
}

export function filterCatalog(catalog, { search = '', category = '', answer = '', difficulty = '' } = {}) {
  const needle = textKey(search);
  return catalog.filter(question => (!category || question.category === category) && (!answer || question.answer === answer) && (!difficulty || question.difficulty === difficulty)
    && (!needle || textKey(`${question.text} ${question.category} ${question.explanation}`).includes(needle)));
}

export function appendCatalogSelection(draft, catalog, selectedIds, { maxQuestions = 300 } = {}) {
  if (!Array.isArray(draft)) throw TypeError('편집 중인 문제 목록을 확인해 주세요.');
  if (!Array.isArray(selectedIds) && !(selectedIds instanceof Set)) throw TypeError('가져올 후보를 체크해 주세요.');
  if (!Number.isInteger(maxQuestions) || maxQuestions < 1) throw TypeError('최대 문제 수를 확인해 주세요.');
  const candidates = validateCatalog(catalog), selected = new Set(selectedIds), knownIds = new Set(candidates.map(question => question.id));
  if ([...selected].some(id => !knownIds.has(id))) throw Error('문제은행에 없는 후보가 선택되었습니다. 다시 선택해 주세요.');
  const keys = draftKeys(draft), additions = [];
  let skipped = 0;
  for (const candidate of candidates) {
    if (!selected.has(candidate.id)) continue;
    const key = textKey(candidate.text);
    if (keys.has(key)) { skipped++; continue; }
    keys.add(key);
    const question = structuredClone(candidate);
    delete question.id;
    additions.push(question);
  }
  if (draft.length + additions.length > maxQuestions) throw Error(`문제는 ${maxQuestions}개까지 저장할 수 있습니다. 편집란의 문제 수나 선택 수를 줄여 주세요.`);
  return { questions: [...draft, ...additions], added: additions.length, skipped };
}

export function createQuestionBank({ root, catalog, getDraft, onImport, onEdit } = {}) {
  if (!root || typeof root.querySelector !== 'function' || typeof getDraft !== 'function' || typeof onImport !== 'function' || typeof onEdit !== 'function') throw TypeError('문제은행 표시 영역과 편집 연결을 확인해 주세요.');
  const candidates = validateCatalog(catalog), categories = [...new Set(candidates.map(question => question.category))];
  const selected = new Set();
  let busy = false, alive = true;
  root.innerHTML = `<p class="qb-intro">${candidates.length}개 후보에서 필요한 문제를 체크해 편집란 끝에 추가하세요. 기존 문제와 순서는 유지됩니다. 가져온 뒤 <b>문제·순서 저장</b>을 눌러야 진행 목록과 스크린에 반영됩니다.</p><p class="qb-meta">난이도는 일반 성인 행사 기준의 진행자 참고 분류입니다. 하: 워밍업·한 단계 판단 / 중: 개념·흔한 오해 / 상: 전문 지식·여러 단계 추론</p>
<div class="qb-toolbar"><label>문제 검색<input type="search" data-qb-search placeholder="문제·주제·해설 검색" autocomplete="off"></label><label>주제<select data-qb-category><option value="">전체 주제</option>${categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('')}</select></label><label>정답<select data-qb-answer><option value="">O / X 모두</option><option value="O">O 정답</option><option value="X">X 정답</option></select></label><label>난이도<select data-qb-difficulty><option value="">전체 난이도</option><option value="하">하</option><option value="중">중</option><option value="상">상</option></select></label></div>
<p class="qb-meta" data-qb-count role="status" aria-live="polite"></p><div class="qb-actions"><button type="button" data-qb-select-visible>현재 검색 결과 모두 선택</button><button type="button" data-qb-clear>선택 해제</button><button type="button" class="primary" data-qb-import>선택한 문제 가져오기</button><button type="button" data-qb-edit>편집란으로 이동</button></div><p data-qb-message role="status" aria-live="polite"></p><div class="qb-grid" data-qb-list></div>`;
  const names = ['search', 'category', 'answer', 'difficulty', 'count', 'select-visible', 'clear', 'import', 'edit', 'message', 'list'];
  const elements = Object.fromEntries(names.map(name => [name, root.querySelector(`[data-qb-${name}]`)]));
  const filters = () => ({ search: elements.search.value, category: elements.category.value, answer: elements.answer.value, difficulty: elements.difficulty.value });
  const visibleCandidates = () => filterCatalog(candidates, filters());
  const message = text => { elements.message.textContent = text; };
  function refresh() {
    if (!alive) return;
    const draft = getDraft(), keys = draftKeys(draft), visible = visibleCandidates();
    const newSelected = candidates.filter(question => selected.has(question.id) && !keys.has(textKey(question.text))).length;
    const visibleIds = new Set(visible.map(question => question.id)), hiddenSelected = [...selected].filter(id => !visibleIds.has(id)).length;
    elements.count.textContent = `전체 ${candidates.length}개 · 검색 결과 ${visible.length}개 · 선택 ${selected.size}개 (새로 추가 ${newSelected}개) · 필터 밖 선택 ${hiddenSelected}개 · 현재 편집란 ${draft.length}개`;
    elements['select-visible'].disabled = busy || !visible.some(question => !keys.has(textKey(question.text)) && !selected.has(question.id));
    elements.clear.disabled = busy || !selected.size;
    elements.import.disabled = busy || !newSelected;
    elements.edit.disabled = busy;
    elements.search.disabled = busy; elements.category.disabled = busy; elements.answer.disabled = busy; elements.difficulty.disabled = busy;
    elements.list.innerHTML = visible.length ? visible.map(question => {
      const duplicate = keys.has(textKey(question.text));
      const links = [...new Set((question.sources || []).map(safeSource).filter(Boolean))];
      return `<article class="qb-card${duplicate ? ' qb-in-draft' : ''}"><span class="qb-tag">${escapeHtml(question.category)}</span> <span class="qb-tag qb-difficulty" data-difficulty="${escapeHtml(question.difficulty)}">난이도 ${escapeHtml(question.difficulty)}</span><label class="qb-choice"><input type="checkbox" data-qb-id="${escapeHtml(question.id)}"${selected.has(question.id) ? ' checked' : ''}${duplicate || busy ? ' disabled' : ''}><span class="qb-question">${escapeHtml(question.text)}</span></label><p class="qb-meta">${duplicate ? '편집란에 있음 · 중복 추가하지 않습니다' : '일반 문제 · 자동 10초'}</p><details class="qb-details"><summary>정답·해설·출처 확인</summary><p><b>정답 ${escapeHtml(question.answer)}</b> · ${escapeHtml(question.explanation)}</p>${question.source ? `<p class="qb-meta">${escapeHtml(question.source)}</p>` : ''}${links.length ? `<ul class="qb-sources">${links.map((url, index) => `<li><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">출처 ${index + 1} ↗</a></li>`).join('')}</ul>` : ''}</details></article>`;
    }).join('') : '<p class="qb-empty">검색 결과가 없습니다. 검색어나 주제를 바꿔 주세요.</p>';
  }
  const choose = event => {
    if (busy) return;
    const input = event.target.closest?.('input[data-qb-id]');
    if (!input || input.disabled || !candidates.some(question => question.id === input.dataset.qbId)) return;
    if (input.checked) selected.add(input.dataset.qbId); else selected.delete(input.dataset.qbId);
    refresh();
    elements.list.querySelector?.(`input[data-qb-id="${input.dataset.qbId}"]`)?.focus?.({ preventScroll: true });
  };
  const selectVisible = () => {
    if (busy) return;
    const keys = draftKeys(getDraft());
    for (const question of visibleCandidates()) if (!keys.has(textKey(question.text))) selected.add(question.id);
    refresh();
  };
  const clear = () => { if (!busy) { selected.clear(); message('선택을 해제했습니다.'); refresh(); } };
  const importSelected = async () => {
    if (busy || !selected.size) return;
    try {
      const result = appendCatalogSelection(getDraft(), candidates, selected);
      if (!result.added) { message('선택한 문제는 이미 편집란에 있습니다.'); refresh(); return; }
      busy = true; message('선택한 문제를 편집란에 가져오는 중입니다.'); refresh();
      const accepted = await onImport(result);
      if (!alive) return;
      if (accepted === false) { message('가져온 내용을 보관하지 못했습니다. 선택 상태는 유지했습니다. 편집란과 저장 상태를 확인해 주세요.'); return; }
      selected.clear();
      message(`편집란 끝에 ${result.added}개를 추가했습니다.${result.skipped ? ` 이미 있는 ${result.skipped}개는 건너뛰었습니다.` : ''} “편집란으로 이동”에서 검토한 뒤 “문제·순서 저장”을 눌러 주세요.`);
    } catch (error) { if (alive) message(error.message || '선택한 문제를 가져오지 못했습니다. 선택 상태는 유지했습니다.'); }
    finally { busy = false; refresh(); }
  };
  const edit = () => { if (!busy && alive) onEdit(); };
  const bindings = [[elements.search, 'input', refresh], [elements.category, 'change', refresh], [elements.answer, 'change', refresh], [elements.difficulty, 'change', refresh], [elements.list, 'change', choose], [elements['select-visible'], 'click', selectVisible], [elements.clear, 'click', clear], [elements.import, 'click', importSelected], [elements.edit, 'click', edit]];
  for (const [element, name, listener] of bindings) element.addEventListener(name, listener);
  refresh();
  return {
    render: refresh, refresh,
    destroy() {
      alive = false;
      for (const [element, name, listener] of bindings) element.removeEventListener(name, listener);
      root.innerHTML = '';
    },
  };
}
