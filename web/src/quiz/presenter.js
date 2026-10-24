import { createState, transition, secondsLeft, validateQuestions, importCsv, choiceLabel, moveQuestion, questionSeconds, questionCategory } from './manual-model.js';
import { createQuizSound } from './sound.js';
import { createYouTubeBgm } from './youtube-bgm.js';
import { createRecipientBook } from './recipients.js';
import { createRunbook } from './runbook.js';
import { encodeQuestionStore, restoreQuestionDraft } from './question-storage.js';
import { refreshQuestionImages } from './question-assets.js';
import { makePublicView, renderQuizStage } from './presentation.js';
import { PRIZE_TIERS } from './prize-tiers.js';
import { createCloudTransport } from '../cloud/transport.js';
import { DEFAULT_EVENT_INFO, validateEventInfo } from './event-info.js';
import { createPrizeSettings } from './prize-settings.js';

const $ = id => document.getElementById(id);
const isCloud = true; // This entry is exclusively the authenticated cloud presenter.
const KEY = isCloud ? 'ox-banquet-cloud-draft-v1' : 'ox-banquet-standalone-v1';
const DEFAULTS = JSON.parse($('event-data').textContent);
const PRIZE_IMAGE = JSON.parse($('prize-data').textContent);
const ASSET_UPDATES = JSON.parse($('asset-updates').textContent);

const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 기존 진행 메모 원문은 보존하고, 이전 낭독 큐 안내만 현재 동작에 맞춰 표시한다.
const progressNote = (text, manual = false) => (text || '')
  .replaceAll('이미지 출처: 한국전력 캐릭터 제작사 코글플래닛(이름이 적히지 않은 단독 이미지).', '이미지: 공식 캐릭터와 대조한 3D 전신 이미지로 교체했다.')
  .replace(/(?:\d+번에 임시 배치\.|초반 \d+번에 (?:배치|추가)\.|배구단 문제 다음인 초반 \d+번에 배치\.|\d+번 정답 공개 후 패자부활전\.)\s*/g, '')
  .replaceAll('문제 낭독이 끝난 뒤 선택 시간을 시작한다.', '문제 공개와 동시에 타이머가 자동 시작된다.')
  .replaceAll('이 문제의 “다음 · 큐”를 누른다. 문제 낭독이 끝나면 선택 시간 5초가 시작된다.', '이 문제를 공개한다. 문제 공개와 동시에 타이머가 자동 시작된다.')
  .replaceAll('문제 공개와 동시에 타이머가 자동 시작된다.', manual ? '시간제한 없이 진행하고 정답은 직접 공개한다.' : '문제가 나타나면 타이머가 자동 시작된다.');
const status = text => { $('status').textContent = text; if (isCloud && $('cloud-error')) $('cloud-error').textContent = text; };
const sound = createQuizSound();
let lastSoundSecond = null;
let musicEnabled = true, activeMusicId = null, recipientBook = null, runbookBook = null;
let cloud = null, cloudMeta = null, cloudConnection = { connected: false, busy: false, authenticated: true };
const prizeSettings = createPrizeSettings({ root: $('prize-settings'), defaultPrize: PRIZE_IMAGE,
  onSave: async prize => (await cloud.send({ type: 'prize', prize })).prize,
});
let recipientChain = Promise.resolve(), recipientLoading = false, recipientEpoch = 0;
const RECIPIENT_PENDING = 'ox-cloud-recipient-pending-v1';
const EVENT_PENDING = 'ox-cloud-event-pending-v1';
const EVENT_FIELDS = ['name', 'date', 'venue', 'message'];
let eventServer = structuredClone(DEFAULT_EVENT_INFO), eventBase = null, eventDraft = null;
let eventDirty = false, eventConflict = false, eventLoaded = false, eventSaving = false, eventEditRevision = 0, eventOwnSaving = null;
const cloudDisabled = new Map();
const clockNow = () => Date.now() + (cloudMeta?.offsetMs || 0);
const focusQuiz = () => $(isCloud ? 'controls' : 'preview').scrollIntoView?.({ block: 'start' });
const youtube = createYouTubeBgm({
  containerId: 'youtube-player',
  onStatus: message => { $('youtube-status').textContent = message; },
  onState: value => {
    $('youtube-state').textContent = value.playing ? 'YouTube 재생 중' : value.blocked ? '재생 버튼을 눌러 주세요' : value.error || (value.ready ? 'YouTube 준비됨' : 'YouTube 대기');
    if (activeMusicId && (value.error || value.blocked)) sound.setMusic(musicEnabled);
    else if (activeMusicId && value.playing) sound.setMusic(false);
  },
});
let state, stored, restored = false;
try { stored = JSON.parse(localStorage.getItem(KEY)); state = createState(DEFAULTS, stored); restored = true; }
catch { state = createState(DEFAULTS); status('저장된 문제를 읽지 못했습니다. 문제 백업을 불러올 수 있습니다.'); }
let draft = structuredClone(state.questions), screen = null, lastPreview = '', lastProjection = '', lastAdvance = -Infinity;
let draftPersisted = true;
let draftRevision = 0;
try { draft = restoreQuestionDraft(stored, state.questions); }
catch (error) { restored = false; status(error.message); }
// 먼저 이전 목록 기준의 편집 차이를 복원한 후, 두 목록의 알려진 이미지만 함께 갱신한다.
state = { ...state, questions: refreshQuestionImages(state.questions, ASSET_UPDATES) };
draft = refreshQuestionImages(draft, ASSET_UPDATES);
const mainState = () => state.mainState || state;
const hasEdits = () => JSON.stringify(draft) !== JSON.stringify(mainState().questions);
const editStatus = text => { $('edit-status').textContent = text; };

function save(source = mainState(), editing = draft) {
  try { localStorage.setItem(KEY, encodeQuestionStore(source.questions, source.left, editing)); draftPersisted = true; return true; }
  catch { draftPersisted = false; const message = '저장하지 못했습니다. 브라우저 저장 공간·권한을 확인하고 다시 저장해 주세요.'; editStatus(message); status(message); return false; }
}
function keepDraft() {
  draftRevision++;
  if (save()) editStatus(hasEdits() ? '편집 내용 자동 보관됨 · 문제·순서 저장을 누르면 진행 목록에 반영됩니다.' : '저장된 문제와 순서입니다.');
}
function dispatch(action) {
  if (isCloud) {
    if (action.type === 'tick') { render(); return; }
    return cloud?.send(action).catch(error => { status(error.message); return null; });
  }
  const before = state;
  state = transition(state, action, Date.now());
  if (state.questions !== before.questions || state.mode !== before.mode || action.type === 'interlude') options();
  syncSound(before);
  if (action.type === 'hands') save();
  render();
  if (['show', 'next', 'previous', 'reveal', 'pause', 'timer', 'blank'].includes(action.type) && ['topic', 'question', 'answer'].includes(state.phase)) $('preview').scrollIntoView?.({ block: 'start' });
}
function syncSound(before) {
  if (state.blank || ['cover', 'prizes', 'ready', 'end'].includes(state.phase)) { lastSoundSecond = null; return; }
  if (state.phase !== before.phase || state.index !== before.index || before.blank) {
    if (state.phase === 'topic') sound.cue('topic');
    else if (state.phase === 'question' && before.phase === 'topic') sound.cue('question');
    else if (state.phase === 'answer') sound.cue('answer');
    lastSoundSecond = state.phase === 'question' ? secondsLeft(state, Date.now()) : null;
    return;
  }
  if (state.phase === 'question') {
    const seconds = secondsLeft(state, Date.now());
    if (seconds !== lastSoundSecond) {
      if (seconds === 0) sound.cue('finish');
      else if (state.deadline !== null) sound.tick(seconds);
      lastSoundSecond = seconds;
    }
  }
}
function syncMusic() {
  if (isCloud) { $('youtube-panel').hidden = true; return; }
  const q = state.questions[state.index];
  $('youtube-panel').hidden = !q.musicYoutubeId || ['cover', 'prizes', 'end'].includes(state.phase);
  $('youtube-play').disabled = !q.musicYoutubeId || state.blank || !['topic', 'question'].includes(state.phase);
  const wanted = sound.state.enabled && musicEnabled && !$('quiz-page').hidden && !state.blank && ['topic', 'question'].includes(state.phase) ? q.musicYoutubeId || null : null;
  if (wanted !== activeMusicId) {
    activeMusicId = wanted;
    if (wanted) {
      sound.setMusic(false);
      youtube.play(wanted).then(playing => { if (!playing && activeMusicId === wanted) sound.setMusic(musicEnabled); });
    } else youtube.pause();
  }
  if (!wanted) sound.setMusic(musicEnabled);
}
let stageCacheKey = null, stageCacheHtml = '';
function stage() {
  const now = clockNow();
  const key = [cloudMeta?.revision ?? -1, state.phase, state.index, state.blank, state.mode, state.phase === 'question' ? secondsLeft(state, now) : null].join('|');
  if (key !== stageCacheKey) {
    stageCacheHtml = renderQuizStage({ ...makePublicView(state, now), event: cloudMeta?.event ?? DEFAULT_EVENT_INFO, prize: cloudMeta?.prize ?? null }, { prizeImage: PRIZE_IMAGE });
    stageCacheKey = key;
  }
  return stageCacheHtml;
}

const sameEvent = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const eventNotice = text => { $('event-status').textContent = text; };
function fillEventFields() { for (const field of EVENT_FIELDS) $(`event-${field}`).value = eventDraft[field]; }
function persistEventDraft() {
  try {
    if (eventDirty) sessionStorage.setItem(EVENT_PENDING, JSON.stringify({ version: 1, event: eventDraft, base: eventBase }));
    else sessionStorage.removeItem(EVENT_PENDING);
    return true;
  } catch { eventNotice('행사 입력을 이 탭에 임시 보관하지 못했습니다. 창을 닫기 전에 서버 저장을 완료해 주세요.'); return false; }
}
function eventControls() {
  $('event-save').disabled = !eventLoaded || eventSaving || eventConflict || !cloudConnection.connected || cloudConnection.busy || !cloudConnection.authenticated;
  $('event-reload').disabled = !eventLoaded || eventSaving;
}
function acceptEvent(next) {
  next = validateEventInfo(next ?? DEFAULT_EVENT_INFO);
  eventServer = structuredClone(next);
  if (!eventLoaded) {
    eventLoaded = true;
    if (!eventDraft) { eventDraft = structuredClone(next); eventBase = structuredClone(next); fillEventFields(); eventNotice('저장된 행사 설정입니다. 저장하면 대문과 종료 화면에 반영됩니다.'); }
    else {
      eventDirty = !sameEvent(eventDraft, next);
      eventConflict = eventDirty && !sameEvent(eventBase, next);
      eventNotice(eventConflict ? '다른 화면에서 행사 설정이 바뀌었습니다. 복원한 입력은 유지했습니다. 최신 설정을 불러온 뒤 다시 편집해 주세요.' : eventDirty ? '이 탭의 미저장 행사 입력을 복원했습니다. 검토 후 행사 설정 저장을 눌러 주세요.' : '서버 행사 설정과 같습니다.');
      if (!eventDirty) eventBase = structuredClone(next);
      persistEventDraft();
    }
  } else if (eventOwnSaving && sameEvent(next, eventOwnSaving.event)) {
    eventBase = structuredClone(next); eventConflict = false;
    eventDirty = !sameEvent(eventDraft, next); persistEventDraft();
  } else if (!eventDirty && !eventOwnSaving) {
    if (!sameEvent(eventDraft, next)) { eventDraft = structuredClone(next); eventBase = structuredClone(next); fillEventFields(); eventNotice('서버의 최신 행사 설정을 불러왔습니다.'); }
  } else if (!sameEvent(eventBase, next)) {
    eventConflict = true;
    eventNotice('다른 화면에서 행사 설정이 바뀌었습니다. 작성 중인 입력은 유지했습니다. 최신 설정을 불러온 뒤 다시 편집해 주세요.');
  }
  eventControls();
}
if (isCloud) {
  try {
    const pending = JSON.parse(sessionStorage.getItem(EVENT_PENDING));
    if (pending?.version === 1 && pending.event && pending.base && EVENT_FIELDS.every(key => typeof pending.event[key] === 'string')) {
      eventDraft = Object.fromEntries(EVENT_FIELDS.map(key => [key, pending.event[key]]));
      eventBase = validateEventInfo(pending.base); eventDirty = true; fillEventFields();
      eventNotice('미저장 행사 입력을 복원했습니다. 서버 설정을 확인하는 중입니다.');
    }
  } catch { eventNotice('이전 행사 입력을 읽지 못했습니다. 서버 설정을 확인한 뒤 다시 입력해 주세요.'); }
}
$('event-nav').hidden = !isCloud;
$('event-nav').onclick = () => adminPage('event');
$('event-back').onclick = () => adminPage('quiz');
$('event-form').oninput = () => {
  eventDraft = Object.fromEntries(EVENT_FIELDS.map(key => [key, $(`event-${key}`).value]));
  eventBase ||= structuredClone(eventServer);
  eventEditRevision++; eventDirty = !sameEvent(eventDraft, eventServer);
  if (persistEventDraft()) eventNotice(eventConflict ? '다른 화면의 변경과 충돌했습니다. 입력은 유지했습니다. 최신 설정을 확인해 주세요.' : eventDirty ? '미저장 행사 입력 · 이 탭에 임시 보관했습니다. 행사 설정 저장 후 화면에 반영됩니다.' : '저장된 행사 설정과 같습니다.');
  eventControls();
};
$('event-reload').onclick = () => {
  if (eventDirty && !confirm('작성 중인 행사 입력을 지우고 서버의 최신 행사 설정을 불러올까요?')) return;
  eventDraft = structuredClone(eventServer); eventBase = structuredClone(eventServer); eventDirty = false; eventConflict = false; eventEditRevision++;
  fillEventFields(); if (persistEventDraft()) eventNotice('서버의 최신 행사 설정을 불러왔습니다.'); eventControls();
};
$('event-form').onsubmit = async e => {
  e.preventDefault();
  if (eventSaving) return;
  if (!eventLoaded || !cloudConnection.connected) { eventNotice('서버 연결을 확인한 뒤 다시 저장해 주세요. 입력은 유지됩니다.'); return; }
  if (eventConflict || !sameEvent(eventBase, eventServer)) { eventConflict = true; eventNotice('다른 화면의 행사 설정 변경을 먼저 확인해 주세요. 작성 중인 입력은 유지됩니다.'); eventControls(); return; }
  try {
    const event = validateEventInfo(Object.fromEntries(EVENT_FIELDS.map(key => [key, $(`event-${key}`).value])));
    const revision = eventEditRevision;
    eventSaving = true; eventOwnSaving = { event, revision }; eventControls(); eventNotice('행사 설정을 서버에 저장하는 중입니다…');
    const acknowledged = await cloud.send({ type: 'event', event });
    if (!sameEvent(acknowledged.event, event)) { eventConflict = true; eventNotice('저장 후 다른 화면에서 행사 설정이 다시 바뀌었습니다. 입력을 유지했으니 최신 설정을 확인해 주세요.'); return; }
    eventBase = structuredClone(acknowledged.event); eventConflict = false;
    if (revision === eventEditRevision) { eventDraft = structuredClone(eventBase); eventDirty = false; fillEventFields(); }
    else eventDirty = !sameEvent(eventDraft, eventBase);
    if (persistEventDraft()) eventNotice(eventDirty ? '앞선 행사 설정은 저장했습니다. 저장 중 추가한 입력은 보관했으니 다시 저장해 주세요.' : '행사 설정을 클라우드에 저장했습니다. 대문과 종료 화면에 반영했습니다.');
  } catch (error) {
    eventDirty = true;
    if (persistEventDraft()) eventNotice(`${error.message} 행사 입력은 유지했습니다. ${eventConflict ? '다른 화면의 변경을 확인해 주세요.' : '연결을 확인한 뒤 다시 저장해 주세요.'}`);
  } finally { eventSaving = false; eventOwnSaving = null; eventControls(); }
};

function cloudControls() {
  if (!isCloud) return;
  const locked = !cloudConnection.connected || cloudConnection.busy || !cloudConnection.authenticated;
  if (!locked && cloudDisabled.size) { for (const [element, disabled] of cloudDisabled) element.disabled = disabled; cloudDisabled.clear(); }
  if (locked) {
    for (const element of document.querySelectorAll('.page-nav button,#controls button,#question-select,#hands,#music-toggle,#volume,#apply,#apply-top,#runbook-book button')) {
      if (!cloudDisabled.has(element)) cloudDisabled.set(element, element.disabled);
      element.disabled = true;
    }
  }
  $('cloud-status').textContent = !cloudConnection.authenticated ? '로그인이 만료되었습니다. 다시 로그인해 주세요.' : cloudConnection.busy ? '서버에 반영하는 중…' : cloudConnection.connected ? '● 클라우드 연결됨 · 핸드폰과 스크린을 함께 제어합니다.' : '연결 확인 중 · 마지막 진행 상태를 보관하고 있습니다.';
  $('cloud-login').hidden = cloudConnection.authenticated;
  eventControls();
  prizeSettings.setConnection(cloudConnection);
}

function render() {
  syncMusic();
  const html = stage(), q = state.questions[state.index], active = state.phase === 'question', introducing = state.phase === 'topic';
  if (html !== lastPreview) { $('preview').innerHTML = html; lastPreview = html; }
  if (screen && !screen.closed) {
    try { const target = screen.document.getElementById('stage'); if (target && html !== lastProjection) { target.innerHTML = html; lastProjection = html; } }
    catch { screen = null; status('프로젝션 창을 다시 열어 주세요.'); }
  }
  $('connection').textContent = isCloud ? '노트북에서 스크린 링크를 열면 핸드폰 조작이 함께 반영됩니다.' : screen && !screen.closed ? '● 프로젝션 창 열림' : '프로젝션 창을 열어 주세요.';
  $('question-select').value = state.index; $('hands').value = state.left;
  $('secret').textContent = `관리자 전용 정답: ${q.kind === 'open' ? q.openAnswer : choiceLabel(q, q.answer)}\n${q.explanation}`;
  $('review').textContent = [`현재 ${state.index + 1}번`, q.topic, q.review === '번호 임시' ? '' : q.review, progressNote(q.note, q.timerMode === 'manual')].filter(Boolean).join(' · ');
  $('show').disabled = state.blank || active || introducing;
  $('start').hidden = state.phase !== 'cover';
  $('start-nav').hidden = state.phase !== 'cover';
  $('recipients-open').hidden = state.phase !== 'end';
  $('recipients-nav').disabled = state.mode === 'bonus' || ['topic', 'question', 'answer'].includes(state.phase);
  $('interlude-banner').hidden = state.mode !== 'bonus';
  $('question-prep').hidden = state.mode === 'bonus';
  $('question-select').disabled = state.mode === 'bonus';
  $('main-position').textContent = state.mainState ? `본게임 ${state.mainState.index + 1}번을 보관 중입니다.` : '';
  $('phase-buttons').hidden = Boolean(q.musicYoutubeId && ['topic', 'question', 'answer'].includes(state.phase));
  $('reveal').disabled = state.blank || !active;
  $('next').disabled = state.blank || state.phase !== 'answer';
  $('next').textContent = state.mode === 'bonus' ? '③ 본게임으로 돌아가기' : state.index === state.questions.length - 1 ? '③ 종료 화면' : '③ 다음 문제';
  $('previous').disabled = state.blank || state.index === 0;
  $('timer-start').disabled = state.blank || (!active && !(introducing && state.topicDeadline === null)) || state.deadline !== null;
  $('timer-start').textContent = introducing ? '주제 예고 계속' : state.deadline !== null ? '자동 타이머 진행 중' : state.remaining > 0 ? '타이머 계속' : '타이머 다시 시작';
  $('pause').disabled = state.blank || (state.deadline === null && state.topicDeadline === null);
  $('timer-controls').hidden = q.timerMode === 'manual' && !introducing;
  $('timing-hint').textContent = q.timerMode === 'manual' ? '이 노래 문제는 시간 표시와 카운트다운 없이 진행합니다. 노래가 끝나면 정답을 직접 공개해 주세요.' : '주제 2초 후 문제와 타이머가 시작됩니다. 본게임과 번외 퀴즈는 모두 10초입니다. 노래 문제는 시간제한 없이 진행하며 정답은 직접 공개합니다.';
  $('end').textContent = state.mode === 'bonus' ? '번외 종료 · 본게임 복귀' : '종료 화면';
  $('hands').disabled = ['topic', 'question', 'answer'].includes(state.phase);
  $('blank').textContent = state.blank ? '화면 다시 켜기' : '화면 가리기';
  $('step').textContent = state.blank ? '화면을 다시 켠 뒤 직접 진행해 주세요.' : introducing ? `${questionCategory(q, state.index, state.mode)} · 주제 2초 예고 후 문제와 타이머가 시작됩니다.` : state.deadline !== null ? `${state.index + 1}번 · ${questionSeconds(state.index, state.mode)}초 자동 타이머 진행 중. 정답은 직접 공개합니다.` : state.phase === 'answer' ? '정답 확인 후 다음 문제를 눌러 주세요.' : state.phase === 'question' ? q.timerMode === 'manual' ? '노래가 끝나면 정답을 직접 공개해 주세요.' : '타이머가 멈췄습니다. 계속하거나 정답을 공개해 주세요.' : '시작하기 → 상품 소개 → 주제 2초 → 문제·타이머 → 정답 공개';
  $('audio-toggle').textContent = sound.state.enabled ? '소리 끄기' : '소리 켜기';
  $('audio-status').textContent = sound.state.error || (sound.state.enabled ? '소리 켜짐 · 배경음악과 효과음은 이 관리자 창에서 재생됩니다.' : '소리 꺼짐 · 소리 켜기를 누르면 배경음악과 효과음이 시작됩니다.');
  if (isCloud) {
    $('audio-toggle').textContent = cloudMeta?.audio?.muted ? '스크린 음향 켜기' : '스크린 음향 끄기';
    $('audio-status').textContent = '노트북 스크린에서 소리 켜기를 한 번 누른 뒤 이곳에서 음향을 제어하세요.';
    $('cloud-current').textContent = `${state.mode === 'bonus' ? '번외' : `${state.index + 1} / ${state.questions.length}`} · ${state.phase === 'topic' ? '주제 예고' : state.phase === 'answer' ? '정답 공개됨' : state.phase === 'question' ? q.timerMode === 'manual' ? '시간제한 없음' : `${secondsLeft(state, clockNow()) ?? 0}초${state.deadline === null ? ' · 일시정지' : ''}` : '대기'}\n${q.text}`;
  }
  cloudControls();
}
function advance() {
  const now = Date.now();
  if (now - lastAdvance < 650 || state.blank || state.phase === 'topic' || state.deadline !== null) return;
  lastAdvance = now;
  if (state.phase === 'cover') dispatch({ type: 'prizes' });
  else if (['ready', 'prizes'].includes(state.phase)) dispatch({ type: 'show' });
  else if (state.phase === 'question') dispatch({ type: 'reveal' });
  else if (state.phase === 'answer') dispatch({ type: 'next' });
}
function keyboard(e) {
  if ($('quiz-page').hidden) return;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.repeat || e.target?.isContentEditable || e.target?.closest?.('#editor') || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName)) return;
  if (['PageDown', 'ArrowRight', 'ArrowDown', ' '].includes(e.key)) { e.preventDefault(); advance(); }
  else if (e.key === 'Escape') { e.preventDefault(); dispatch({ type: 'pause' }); }
}
function options() { $('question-select').replaceChildren(...state.questions.map((q, i) => new Option(`${i + 1}. ${q.text}`, i))); }
function moveDraft(from, to) {
  try {
    const reordered = moveQuestion(draft, from, to);
    if (reordered === draft) { status('이미 선택한 번호에 있습니다.'); return; }
    draft = reordered; editor(); keepDraft();
    const row = $('editor').querySelector?.(`[data-row="${to}"]`);
    row?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row?.querySelector('button[data-move-from]:not(:disabled)')?.focus({ preventScroll: true });
    if (draftPersisted) status(`${from + 1}번 문제를 ${to + 1}번으로 옮겼습니다. “문제·순서 저장”을 누르면 선택 목록에도 반영됩니다.`);
  } catch (e) { status(e.message); }
}
function editor() {
  $('editor').innerHTML = draft.map((q, i) => `<div class="editor-row" data-row="${i}"><div class="editor-heading"><p><b>${i + 1}번 문제</b></p><div class="order-controls" role="group" aria-label="${i + 1}번 문제 순서"><button data-move-from="${i}" data-move-by="-1" aria-label="${i + 1}번 문제 위로"${i === 0 ? ' disabled' : ''}>↑ 위로</button><button data-move-from="${i}" data-move-by="1" aria-label="${i + 1}번 문제 아래로"${i === draft.length - 1 ? ' disabled' : ''}>↓ 아래로</button><label class="order-target">이동할 번호<input type="number" min="1" max="${draft.length}" value="${i + 1}" data-order-target="${i}" aria-label="${i + 1}번 문제 이동할 번호"></label><button data-jump-from="${i}" aria-label="${i + 1}번 문제 순서 이동">이동</button></div></div><div class="editor-grid"><label>주제<input ${i === 0 ? 'readonly aria-label="1번 주제 (워밍업 고정)"' : `data-i="${i}" data-key="category"`} value="${esc(questionCategory(q, i))}" placeholder="문학, 노래, 스포츠, 연예, 전기…"></label><label class="wide">문제<textarea data-i="${i}" data-key="text">${esc(q.text)}</textarea></label><label>첫 번째 보기<input data-i="${i}" data-key="choiceO" value="${esc(q.choiceO)}"></label><label>두 번째 보기<input data-i="${i}" data-key="choiceX" value="${esc(q.choiceX)}"></label><label class="wide">해설<textarea data-i="${i}" data-key="explanation">${esc(q.explanation)}</textarea></label><label>정답<select data-i="${i}" data-key="answer"><option value="O"${q.answer === 'O' ? ' selected' : ''}>첫 번째 보기</option><option value="X"${q.answer === 'X' ? ' selected' : ''}>두 번째 보기</option></select></label><label>제한시간<input type="text" value="${q.timerMode === 'manual' ? '표시 안 함' : questionSeconds(i) + '초'}" readonly aria-label="${i + 1}번 자동 제한시간"></label></div><p class="review">${esc(progressNote(q.note, q.timerMode === 'manual'))}</p><button data-remove="${i}"${draft.length === 1 ? ' disabled' : ''}>삭제</button></div>`).join('');
}
$('open').onclick = () => {
  if (isCloud) { if (cloudMeta?.screenPath) window.open(cloudMeta.screenPath, 'ox-cloud-screen'); return; }
  if (screen && !screen.closed) { screen.focus(); render(); return; }
  screen = window.open('', 'ox-banquet-projection', 'popup=yes,width=1280,height=720');
  if (!screen) { status('팝업을 허용한 뒤 다시 눌러 주세요.'); return; }
  lastProjection = '';
  screen.document.open();
  screen.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>OX 퀴즈 · 프로젝션</title><style>${document.querySelector('head > style').textContent}</style></head><body class="projection"><div id="stage"></div><button class="fullscreen" id="full">전체화면 · F11</button></body></html>`);
  screen.document.close();
  screen.document.getElementById('full').onclick = () => screen.document.documentElement.requestFullscreen().catch(() => status('프로젝션 창에서 F11을 눌러 주세요.'));
  screen.addEventListener('keydown', keyboard); render(); status('프로젝션 창을 보조 화면으로 옮겨 주세요.');
};
for (const [id, type] of Object.entries({ show: 'show', reveal: 'reveal', next: 'next', previous: 'previous', 'timer-start': 'timer', pause: 'pause', ready: 'ready', prizes: 'prizes', 'prizes-nav': 'prizes', 'ready-nav': 'ready', blank: 'blank', end: 'end' })) $(id).onclick = () => dispatch({ type });
for (const id of ['prizes', 'prizes-nav', 'start', 'start-nav']) $(id).onclick = () => { adminPage('quiz'); dispatch({ type: 'prizes' }); focusQuiz(); };
$('ready-nav').onclick = () => { adminPage('quiz'); dispatch({ type: 'ready' }); $('controls').scrollIntoView?.({ block: 'start', behavior: 'smooth' }); };
async function cloudRecipients() {
  if (recipientLoading || recipientBook) return;
  const epoch = recipientEpoch;
  recipientLoading = true; $('recipients-book').textContent = '클라우드 명단을 불러오는 중입니다.';
  try {
    await recipientChain.catch(() => {});
    const remote = await cloud.loadRecipients();
    if (epoch !== recipientEpoch || $('recipients-page').hidden) return;
    let version = remote.revision, pending = null, blocked = false, sequence = 0;
    try { pending = JSON.parse(sessionStorage.getItem(RECIPIENT_PENDING)); } catch { /* 손상된 초안은 자동 전송하지 않는다. */ }
    const restorable = pending?.baseRevision === version && Array.isArray(pending?.value?.recipients);
    const initial = restorable ? pending.value : { version: 1, recipients: remote.records };
    const memory = { getItem: () => JSON.stringify(initial), setItem: (key, value) => sessionStorage.setItem('ox-cloud-recipient-cache-v1', value) };
    recipientBook = createRecipientBook({ root: $('recipients-book'), tiers: PRIZE_TIERS, storage: memory, remote: true, pending: restorable,
      onSave(value) {
        const request = ++sequence;
        sessionStorage.setItem(RECIPIENT_PENDING, JSON.stringify({ baseRevision: version, value, request }));
        recipientChain = recipientChain.catch(() => {}).then(async () => {
          if (blocked) {
            const latest = await cloud.loadRecipients();
            if (latest.revision !== version) throw Error('서버의 명단이 달라졌습니다. 명단 화면을 다시 열어 보관된 입력과 비교해 주세요.');
            blocked = false;
          }
          try {
            const saved = await cloud.saveRecipients(value.recipients, version);
            version = saved.revision;
            const waiting = JSON.parse(sessionStorage.getItem(RECIPIENT_PENDING));
            if (waiting?.request === request) sessionStorage.removeItem(RECIPIENT_PENDING);
            else if (waiting) sessionStorage.setItem(RECIPIENT_PENDING, JSON.stringify({ ...waiting, baseRevision: version }));
          } catch (error) { blocked = true; throw error; }
        });
        return recipientChain;
      },
    });
    const recovery = $('cloud-recipient-recovery');
    recovery.hidden = !pending || restorable;
    if (pending?.value?.recipients && !restorable) {
      $('cloud-recipient-draft-backup').onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(pending.value, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = 'OX-미저장-수령기록.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      $('cloud-recipient-draft-restore').onclick = () => { if (confirm('현재 서버 명단을 이 기기에 보관된 입력으로 바꾸어 저장할까요?')) { recipientBook.importJson(JSON.stringify(pending.value)); recovery.hidden = true; } };
    }
  } catch (error) { if (epoch === recipientEpoch) { $('recipients-book').textContent = '명단을 불러오지 못했습니다. 연결을 확인한 뒤 화면을 다시 열어 주세요.'; status(error.message); } }
  finally {
    recipientLoading = false;
    if (epoch !== recipientEpoch && !$('recipients-page').hidden && !recipientBook) void cloudRecipients();
  }
}

function adminPage(page, paused = false) {
  if (page === 'recipients' && (state.mode === 'bonus' || ['topic', 'question', 'answer'].includes(state.phase))) return;
  const navigation = isCloud ? ++recipientEpoch : 0;
  if (page === 'runbook' && !paused) {
    if (isCloud) { void dispatch({ type: 'pause' })?.then(result => { if (result && navigation === recipientEpoch) adminPage(page, true); }); return; }
    dispatch({ type: 'pause' });
  }
  $('quiz-page').hidden = page !== 'quiz';
  $('recipients-page').hidden = page !== 'recipients';
  $('runbook-page').hidden = page !== 'runbook';
  $('event-page').hidden = page !== 'event';
  if (isCloud && page !== 'recipients' && recipientBook) { recipientBook.destroy(); recipientBook = null; }
  if (page === 'recipients') {
    if (isCloud) void cloudRecipients();
    else recipientBook ||= createRecipientBook({ root: $('recipients-book'), tiers: PRIZE_TIERS });
    $('recipients-page').scrollIntoView?.({ block: 'start' });
  } else if (page === 'runbook') {
    runbookBook ||= createRunbook({ root: $('runbook-book'),
      onQuiz: question => {
        if (isCloud) return cloud.send({ type: 'interlude', question }).then(() => adminPage('quiz')).catch(error => { status(error.message); throw error; });
        dispatch({ type: 'interlude', question }); adminPage('quiz');
      },
      onBack: () => { if (state.mode === 'bonus') { if (isCloud) { void dispatch({ type: 'resume-main' })?.then(result => { if (result) adminPage('quiz'); }); return; } dispatch({ type: 'resume-main' }); } adminPage('quiz'); },
    });
    const current = state.mainState || state;
    runbookBook.render({ questions: current.questions, index: current.index, phase: current.phase, inBonus: state.mode === 'bonus' });
    $('runbook-page').scrollIntoView?.({ block: 'start' });
  } else if (page === 'event') $('event-page').scrollIntoView?.({ block: 'start' });
  else focusQuiz();
}
$('runbook-nav').onclick = () => adminPage('runbook');
$('return-main').onclick = () => { dispatch({ type: 'resume-main' }); adminPage('quiz'); };
$('cover-nav').onclick = () => { adminPage('quiz'); dispatch({ type: 'cover' }); focusQuiz(); };
$('recipients-nav').onclick = () => adminPage('recipients');
$('recipients-open').onclick = () => adminPage('recipients');
$('recipients-back').onclick = () => adminPage('quiz');
$('question-select').onchange = e => dispatch({ type: 'select', index: Number(e.target.value) });
$('hands').onchange = e => dispatch({ type: 'hands', left: e.target.value });
$('editor').oninput = e => { const el = e.target; if (el.dataset.key) { draft[Number(el.dataset.i)][el.dataset.key] = el.dataset.key === 'seconds' ? Number(el.value) : el.value; keepDraft(); } };
$('editor').onclick = e => {
  const target = e.target.closest?.('button') || e.target;
  if (target.disabled) return;
  if (target.dataset.moveFrom !== undefined) {
    const from = Number(target.dataset.moveFrom); moveDraft(from, from + Number(target.dataset.moveBy));
  } else if (target.dataset.jumpFrom !== undefined) {
    const from = Number(target.dataset.jumpFrom);
    const value = $('editor').querySelector(`[data-order-target="${from}"]`).value.trim();
    if (!value) { status('이동할 번호를 입력해 주세요.'); return; }
    moveDraft(from, Number(value) - 1);
  } else if (target.dataset.remove !== undefined && draft.length > 1) { draft.splice(Number(target.dataset.remove), 1); editor(); keepDraft(); }
};
$('add').onclick = () => { draft.push({ text: '', category: '상식', choiceO: 'O', choiceX: 'X', answer: 'O', seconds: 10, explanation: '' }); editor(); keepDraft(); };
async function applyDraft() {
  try {
    const questions = validateQuestions(refreshQuestionImages(draft, ASSET_UPDATES));
    if (['topic', 'question', 'answer'].includes(state.phase) && !confirm('진행을 멈추고 문제와 새 순서를 저장할까요?')) return;
    if (isCloud) {
      const savingRevision = draftRevision;
      await cloud.saveBank(questions);
      if (savingRevision === draftRevision) { draft = structuredClone(mainState().questions); editor(); }
      save();
      const message = savingRevision === draftRevision ? `${questions.length}개 문제·순서를 클라우드에 저장했습니다. 스크린과 문제 선택 목록에도 반영했습니다.` : '앞선 편집은 클라우드에 저장했습니다. 저장 중 추가한 편집은 보관했으니 다시 문제·순서 저장을 눌러 주세요.';
      editStatus(message); status(message); return;
    }
    if (!save({ questions, left: state.left }, questions)) return;
    dispatch({ type: 'apply', questions }); draft = structuredClone(state.questions); editor();
    const message = `${questions.length}개 문제·순서 저장 완료 · 문제 선택 목록을 갱신했습니다.`;
    editStatus(message); status(message);
  } catch (e) { editStatus(e.message); status(e.message); }
}
$('apply').onclick = applyDraft;
$('apply-top').onclick = applyDraft;
$('event-questions').onclick = () => { draft = validateQuestions(DEFAULTS); editor(); keepDraft(); if (draftPersisted) status(`행사 ${DEFAULTS.length}문제를 편집란에 불러왔습니다. 검토 후 문제·순서 저장을 눌러 주세요.`); };
$('import').onchange = async e => {
  const file = e.target.files[0]; if (!file) return;
  try { const text = await file.text(); draft = file.name.toLowerCase().endsWith('.json') ? validateQuestions(JSON.parse(text)) : importCsv(text); editor(); keepDraft(); if (draftPersisted) status('불러왔습니다. 검토 후 문제·순서 저장을 눌러 주세요.'); }
  catch (err) { status(err.message); } e.target.value = '';
};
$('backup').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify((state.mainState || state).questions, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'OX-questions.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('audio-toggle').onclick = async () => {
  if (isCloud) { await dispatch({ type: 'audio', muted: !cloudMeta?.audio?.muted }); return; }
  if (sound.state.enabled) sound.disable(); else if (await sound.enable()) void youtube.prepare();
  render();
};
$('music-toggle').onchange = e => { if (isCloud) { void dispatch({ type: 'audio', music: e.target.checked }); return; } musicEnabled = e.target.checked; render(); };
$('volume').oninput = e => { if (isCloud) return; const value = Number(e.target.value) / 100; sound.setVolume(value); youtube.setVolume(value); };
$('volume').onchange = e => { if (isCloud) void dispatch({ type: 'audio', volume: Number(e.target.value) / 100 }); };
$('youtube-play').onclick = async () => {
  if (!sound.state.enabled && !await sound.enable()) { render(); return; }
  musicEnabled = true; $('music-toggle').checked = true;
  void youtube.prepare(); activeMusicId = null; render();
};
window.addEventListener('pagehide', () => { youtube.pause(); sound.disable(); });
window.addEventListener('keydown', keyboard);
window.addEventListener('beforeunload', e => {
  let pendingRecipients;
  try { pendingRecipients = isCloud && !!sessionStorage.getItem(RECIPIENT_PENDING); } catch { pendingRecipients = isCloud && recipientBook && !recipientBook.state.saved; }
  if ((screen && !screen.closed) || (!draftPersisted && hasEdits()) || pendingRecipients || eventDirty || eventSaving || prizeSettings.hasPending) { e.preventDefault(); e.returnValue = ''; }
});
options(); editor(); render();
if (restored && save()) editStatus(hasEdits() ? '이전 편집 내용을 복원했습니다. 문제·순서 저장을 누르면 진행 목록에 반영됩니다.' : '저장된 문제와 순서입니다.');
if (!isCloud && ['cover', 'prizes'].includes(state.phase)) focusQuiz();
if (isCloud) {
  cloud = createCloudTransport({
    onState(next, meta) {
      const previous = state, edited = hasEdits(), bankChanged = !cloudMeta || cloudMeta.bankVersion !== meta.bankVersion;
      const prizeChanged = !cloudMeta || cloudMeta.prizeVersion !== meta.prizeVersion;
      state = next; cloudMeta = meta;
      acceptEvent(meta.event);
      if (prizeChanged) prizeSettings.accept(meta.prize ?? null);
      if (bankChanged && !edited) { draft = structuredClone(mainState().questions); editor(); }
      else if (bankChanged && edited) editStatus('편집 내용은 보관했습니다. 서버의 새 문제 목록을 확인한 뒤 문제·순서 저장을 눌러 주세요.');
      if (bankChanged || previous.mode !== state.mode) options();
      $('music-toggle').checked = meta.audio.music; $('volume').value = Math.round(meta.audio.volume * 100);
      if (meta.screenPath) { $('cloud-screen-link').href = meta.screenPath; $('cloud-screen-url').value = new URL(meta.screenPath, location.href).href; }
      if (!$('runbook-page').hidden && runbookBook) { const main = mainState(); runbookBook.render({ questions: main.questions, index: main.index, phase: main.phase, inBonus: state.mode === 'bonus' }); }
      if (bankChanged) save();
      render();
    },
    onStatus: status,
    onConnection(value) { cloudConnection = value; cloudControls(); render(); },
  });
  $('cloud-copy-link').onclick = async () => { try { await navigator.clipboard.writeText($('cloud-screen-url').value); status('스크린 링크를 복사했습니다. 노트북에서 열어 주세요.'); } catch { $('cloud-screen-url').select(); status('표시된 스크린 주소를 복사해 주세요.'); } };
  $('cloud-logout').onclick = async () => { try { await cloud.logout(); location.assign('/'); } catch (error) { status(error.message); } };
  void cloud.connect().catch(error => status(error.message));
}
setInterval(() => dispatch({ type: 'tick' }), 100);
