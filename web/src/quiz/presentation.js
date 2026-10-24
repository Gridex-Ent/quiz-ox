import { choiceLabel, questionCategory } from './manual-model.js';
import { DEFAULT_EVENT_INFO, validateEventInfo } from './event-info.js';
import { validatePrizeInfo } from './prize-info.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const link = (url, label) => /^https?:\/\//i.test(url || '') ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a>` : escape(label);

// 공개 화면으로 보낼 수 있는 현재 정보만 새 객체에 담는다. 원본 은행/미공개 답은 복사하지 않는다.
export function makePublicView(state, now = Date.now()) {
  const view = {
    phase: state.phase, blank: state.blank, mode: state.mode, index: state.index,
    total: state.questions.length, left: state.left, serverNow: now,
    deadline: state.deadline, remaining: state.remaining,
  };
  if (state.blank || !['topic', 'question', 'answer'].includes(state.phase)) return view;
  const source = state.questions[state.index];
  view.category = questionCategory(source, state.index, state.mode);
  if (source.musicYoutubeId && ['topic', 'question'].includes(state.phase)) view.music = { youtubeId: source.musicYoutubeId, title: source.musicTitle || '문제 배경곡' };
  if (state.phase === 'topic') return view;
  const question = {};
  for (const key of ['text', 'choiceO', 'choiceX', 'kind', 'timerMode']) if (source[key] !== undefined) question[key] = source[key];
  if (source.imageReveal !== 'answer' || state.phase === 'answer') {
    for (const key of ['imageData', 'imageAlt', 'imageSource', 'imageCredit', 'imageLicense', 'imageLicenseUrl']) if (source[key] !== undefined) question[key] = source[key];
  }
  if (state.phase === 'answer') {
    for (const key of ['answer', 'openAnswer', 'explanation']) if (source[key] !== undefined) question[key] = source[key];
  }
  view.question = question;
  return view;
}

export function presentationSeconds(view, now = view.serverNow ?? Date.now()) {
  return view.deadline === null ? view.remaining : Math.max(0, Math.ceil((view.deadline - now) / 1000));
}

function questionImage(question) {
  if (!question.imageData) return '';
  const credit = [question.imageCredit ? escape(question.imageCredit) : '', question.imageSource ? link(question.imageSource, '사진 출처') : '', question.imageLicense ? link(question.imageLicenseUrl, question.imageLicense) : ''].filter(Boolean);
  return `<figure class="question-media"><img class="question-image" src="${escape(question.imageData)}" alt="${escape(question.imageAlt || '문제 참고 이미지')}">${credit.length ? `<figcaption>${credit.join(' · ')}</figcaption>` : ''}</figure>`;
}

export function renderQuizStage(view, { prizeImage = {}, now = view.serverNow ?? Date.now() } = {}) {
  if (view.blank) return '<div class="stage black"></div>';
  const event = validateEventInfo(view.event ?? DEFAULT_EVENT_INFO);
  const eventDetails = [event.date.replaceAll('-', '.'), event.venue].filter(Boolean).map(escape).join(' · ');
  const details = eventDetails ? `<p class="event-details">${eventDetails}</p>` : '';
  const message = event.message ? `<p class="event-message">${escape(event.message)}</p>` : '';
  if (view.phase === 'cover') return `<div class="stage cover-stage${event.name.length + event.venue.length + event.message.length > 200 ? ' event-dense' : ''}"><div class="cover-layout"><div class="cover-hero"><div class="eyebrow">OX QUIZ · 함께하는 시간</div><h1>${escape(event.name)}</h1>${details}${message}<p class="gesture-guide">O는 주먹, X는 보자기</p><div class="cover-symbols" aria-hidden="true"><span class="O">✊ O</span><span class="X">🖐 X</span></div><p class="cover-wait">잠시 후 시작합니다</p></div><section class="cover-guide" aria-labelledby="cover-guide-title"><p class="cover-guide-label">게임 방법</p><h2 id="cover-guide-title">이렇게 참여해요</h2><ol class="cover-steps"><li><span class="cover-step-number" aria-hidden="true">01</span><div><b>문제와 보기 확인</b><p>시간이 흐르는 동안 정답을 생각해 주세요.</p></div></li><li><span class="cover-step-number" aria-hidden="true">02</span><div><b>시간이 끝나면 손들기</b><p>O는 주먹, X는 보자기로 손을 들어 주세요.</p><small>선택형 문제도 첫 번째 보기는 주먹, 두 번째 보기는 보자기입니다.</small></div></li><li><span class="cover-step-number" aria-hidden="true">03</span><div><b>정답 공개 기다리기</b><p>든 모양을 그대로 유지해 주세요.<br>진행자의 안내에 따라 참여해 주세요.</p></div></li></ol><p class="cover-timing"><span>본게임 · 번외 퀴즈 모두 <strong>10초</strong></span><span>노래 문제는 <strong>시간제한 없음</strong></span></p></section></div></div>`;
  if (view.phase === 'prizes') {
    const image = view.prize ? validatePrizeInfo(view.prize) : prizeImage;
    return `<div class="stage prize-stage"><div class="eyebrow">OX QUIZ</div><h1 class="prize-title">오늘의 상품</h1><figure class="prize-art prize-single"><img src="${escape(image.imageData)}" alt="${escape(image.imageAlt || '오늘의 상품')}">${image.caption ? `<figcaption>${escape(image.caption)}</figcaption>` : ''}</figure></div>`;
  }
  if (view.phase === 'ready') return '<div class="stage"><div class="eyebrow">OX QUIZ · READY</div><h1>함께하는 손들기 퀴즈</h1><p>시간이 끝나면 O는 주먹, X는 보자기로 손을 들어 주세요.</p><small>첫 번째 보기 = 주먹 · 두 번째 보기 = 보자기</small></div>';
  if (view.phase === 'end') return `<div class="stage end-stage"><div class="eyebrow">OX QUIZ · FINISH</div><h1>${escape(event.name)}</h1>${details}<p>함께해 주셔서 감사합니다!</p>${message}<small>모두 큰 박수로 마무리해 주세요.</small></div>`;
  if (view.phase === 'topic') return `<div class="stage topic-stage"><div class="eyebrow">NEXT QUIZ · ${view.index + 1} / ${view.total}</div><p>이번 문제의 주제</p><h1>${escape(view.category)}</h1><small>잠시 후 문제가 공개됩니다</small></div>`;
  const q = view.question;
  if (!q) return '<div class="stage"><p>진행실 연결을 기다리고 있습니다.</p></div>';
  const right = view.left === 'O' ? 'X' : 'O', t = presentationSeconds(view, now);
  const answer = view.phase === 'answer' ? `<div class="answer ${q.answer === 'X' ? 'X' : 'O'}">정답 ${escape(q.kind === 'open' ? q.openAnswer : choiceLabel(q, q.answer))}</div><p class="explanation">${escape(q.explanation)}</p>` : q.timerMode === 'manual' ? '<p class="no-timer">노래를 듣고 정답을 골라 주세요</p>' : `<div class="timer ${t > 0 && t <= 5 ? 'urgent' : ''}">${t === null ? '정답을 생각해 주세요' : t === 0 ? '시간 종료! 정답 공개를 기다려 주세요' : `${t}초${view.deadline === null ? ' · 일시정지' : ''}`}</div>`;
  const hand = choice => `<div class="hand ${choice} ${choiceLabel(q, choice).length === 1 ? 'symbol' : ''}"><b><span class="gesture-symbol" aria-hidden="true">${choice === 'O' ? '✊' : '🖐'}</span> ${escape(choiceLabel(q, choice))}</b><span>${choice === 'O' ? '주먹' : '보자기'}</span></div>`;
  return `<div class="stage quiz-stage${view.phase === 'answer' ? ' answer-stage' : ''}${q.kind === 'open' ? ' open-stage' : ''}"><div class="eyebrow">${view.mode === 'bonus' ? 'BONUS QUIZ · 번외 퀴즈' : `QUIZ · ${view.index + 1} / ${view.total}`}</div><div class="question-visual"><h1>${escape(q.text)}</h1>${questionImage(q)}</div>${answer}${q.kind === 'open' ? '' : `<div class="hands">${hand(view.left)}${hand(right)}</div>`}<small>${q.kind === 'open' ? '정답을 생각하고 진행자의 안내에 따라 답해 주세요' : '시간이 끝나면 주먹 또는 보자기로 손을 들고, 든 모양을 유지해 주세요'}</small></div>`;
}
