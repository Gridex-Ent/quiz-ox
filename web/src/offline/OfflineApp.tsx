import { useEffect, useState } from 'react';
import { KEY, readState, importCsv, validateQuestions, choiceLabel, eventQuestions, type OfflineState, type Question } from './model';
import './offline.css';

export function OfflineApp({ projection }: { projection: boolean }) {
  const [state, setState] = useState(readState);
  const [now, setNow] = useState(() => Date.now());
  const [draft, setDraft] = useState<Question[]>(() => readState().questions);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const sync = (e: StorageEvent) => { if (e.key === KEY || e.key === null) setState(readState()); };
    window.addEventListener('storage', sync);
    const timer = window.setInterval(() => setNow(Date.now()), 100);
    return () => { window.removeEventListener('storage', sync); clearInterval(timer); };
  }, []);
  function update(change: Partial<OfflineState>) {
    const next = { ...state, ...change };
    try { localStorage.setItem(KEY, JSON.stringify(next)); setState(next); setMessage(''); }
    catch { setMessage('브라우저 저장 공간을 사용할 수 없습니다. 일반 브라우저 창에서 다시 열어 주세요.'); }
  }
  const q = state.questions[state.index]!;
  const seconds = state.deadline === null ? state.remaining : Math.max(0, Math.ceil((state.deadline - now) / 1000));
  function show(index: number) { update({ index, phase: 'question', deadline: null, remaining: null, blank: false }); }
  function edit(index: number, change: Partial<Question>) { setDraft(draft.map((q, i) => i === index ? { ...q, ...change } : q)); }
  async function importFile(file?: File) {
    if (!file) return;
    try { const text = await file.text(); setDraft(file.name.toLowerCase().endsWith('.json') ? validateQuestions(JSON.parse(text)) : importCsv(text)); setMessage('불러왔습니다. 검토 후 “문제 적용”을 누르세요. CSV 이미지는 사용하지 않습니다.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : '파일을 읽지 못했습니다.'); }
  }
  function backup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(state.questions, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'ox-questions.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const right = state.left === 'O' ? 'X' : 'O';
  const visibleLabel = (choice: 'O' | 'X') => state.phase === 'ready' ? choice === 'O' ? '보기 1' : '보기 2' : choiceLabel(q, choice);
  const customChoices = q.choiceO !== 'O' || q.choiceX !== 'X';
  const display = <div className={`off-stage ${state.blank ? 'off-blank' : ''}`}>
    {!state.blank && <>
      <div className="off-eyebrow">OX QUIZ · {state.phase === 'ready' ? '준비' : state.phase === 'end' ? 'FINISH' : `${state.index + 1} / ${state.questions.length}`}</div>
      {state.phase === 'ready' ? <><h1>OX 퀴즈</h1><p>정답이라고 생각하는 쪽의 손을 들어 주세요!</p></> :
        state.phase === 'end' ? <><h1>수고하셨습니다!</h1><p>모두 큰 박수로 마무리해 주세요.</p></> : <>
          <h1 className="off-question">{q.text}</h1>
          {state.phase === 'answer' ? <><div className={`off-answer choice-${q.answer}`}>정답 {choiceLabel(q, q.answer)}</div><p className="off-explanation">{q.explanation}</p></> :
            <div className="off-timer">{seconds === null ? '손을 들어 선택해 주세요' : seconds === 0 ? '시간 종료! 손을 그대로 유지해 주세요' : `${seconds}초`}</div>}
        </>}
      {state.phase !== 'end' && <div className={`off-hands ${customChoices || state.phase === 'ready' ? 'off-custom-choices' : ''}`}><div className={`choice-${state.left}`}><span>왼손</span><strong>{visibleLabel(state.left)}</strong></div><div className={`choice-${right}`}><span>오른손</span><strong>{visibleLabel(right)}</strong></div></div>}
      {state.phase !== 'end' && <small>참가자 본인의 왼손 · 오른손 기준</small>}
    </>}
  </div>;
  if (projection) return <main className="off-projection">{display}<button className="off-fullscreen" onClick={() => document.documentElement.requestFullscreen().catch(() => setMessage('F11 키로 전체화면을 켜 주세요.'))}>전체화면</button>{message && <p role="alert">{message}</p>}</main>;
  return <main className="off-admin">
    <header><div><div className="off-eyebrow">LOCAL · OFFLINE</div><h1>OX 퀴즈 진행실</h1><p>휴대폰 접속 없이, 손을 들고 함께하는 퀴즈</p></div><a className="off-open" href="/offline/screen" target="ox-projection">프로젝션 창 열기 ↗</a></header>
    <p className="off-note">같은 브라우저의 프로젝션 창을 보조 모니터로 옮겨 전체화면으로 표시하세요. 정답은 공개 버튼을 누를 때만 보입니다. 탈락·부활·우승자는 사회자가 현장에서 판정합니다.</p>
    {message && <p className="off-note" role="status">{message}</p>}
    <div className="off-layout"><section className="off-panel"><h2>진행 제어</h2>
      <label>문제 선택<select value={state.index} onChange={e => update({ index: Number(e.target.value), phase: 'ready', deadline: null, remaining: null })}>{state.questions.map((q, i) => <option key={i} value={i}>{i + 1}. {q.text}</option>)}</select></label>
      <p className="off-secret">관리자 전용 정답: <b>{choiceLabel(q, q.answer)}</b><br />{q.explanation}</p>
      {(q.review || q.note || q.topic) && <div className="off-review"><b>{q.topic}{q.review ? ` · ${q.review}` : ''}</b>{q.note && <p>{q.note}</p>}</div>}
      <div className="off-buttons"><button className="primary" onClick={() => show(state.index)}>문제 표시</button><button disabled={state.phase !== 'question'} onClick={() => update({ deadline: Date.now() + q.seconds * 1000, remaining: null })}>타이머 시작 / 다시 시작</button>
      <button disabled={state.phase !== 'question' || (state.deadline === null && state.remaining === null)} onClick={() => state.deadline !== null ? update({ remaining: seconds, deadline: null }) : update({ deadline: Date.now() + (state.remaining ?? 0) * 1000, remaining: null })}>{state.deadline !== null ? '일시정지' : '타이머 계속'}</button>
      <button disabled={state.phase !== 'question'} onClick={() => update({ phase: 'answer', deadline: null, remaining: null })}>정답 공개</button>
      <button disabled={state.index === 0} onClick={() => show(state.index - 1)}>이전 문제</button><button disabled={state.index === state.questions.length - 1} onClick={() => show(state.index + 1)}>다음 문제</button>
      <button onClick={() => update({ blank: !state.blank })}>{state.blank ? '화면 다시 켜기' : '프로젝션 검은 화면'}</button>
      <button onClick={() => update({ phase: 'ready', deadline: null, remaining: null, blank: false })}>준비 화면</button><button onClick={() => update({ phase: 'end', deadline: null, remaining: null, blank: false })}>종료 화면</button></div>
      <label>손들기 규칙<select value={state.left} disabled={state.phase === 'question' || state.phase === 'answer'} onChange={e => update({ left: e.target.value as 'O' | 'X' })}><option value="O">왼손 보기 1 · 오른손 보기 2</option><option value="X">왼손 보기 2 · 오른손 보기 1</option></select></label>
      <p>현재 문제: 왼손 <b>{choiceLabel(q, state.left)}</b> · 오른손 <b>{choiceLabel(q, right)}</b></p>
    </section><section className="off-preview"><h2>프로젝션 미리보기</h2>{display}</section></div>
    <section className="off-panel off-editor"><h2>문제 편집</h2><p>수정 후 적용하면 준비 화면으로 돌아갑니다. 보기 1·보기 2에 ‘빛 / 전기’처럼 문구를 입력할 수 있습니다. 문제는 이 브라우저에 자동 저장됩니다.</p>
      <p>행사 문제집은 1~6번 10초, 7번부터 5초이며 낭독 후 타이머를 시작합니다. 노래는 먼저 부른 뒤 문제를 출제하세요. 후보·제안 문항과 진행 메모는 관리자에게만 표시됩니다.</p>
      <div className="off-buttons"><label>CSV / JSON 불러오기<input type="file" accept=".csv,.json" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label><button onClick={() => { setDraft(structuredClone(eventQuestions)); setMessage('행사 문제 '+eventQuestions.length+'개를 편집란에 불러왔습니다. 후보와 문안을 검토한 뒤 “문제 적용”을 누르세요.'); }}>행사 {eventQuestions.length}문제 불러오기</button><button onClick={backup}>적용된 문제 백업</button></div>
      <p>CSV: 문제,선택지1,선택지2,정답,제한시간,해설 · 정답은 O/X, A/B 또는 보기 문구를 사용할 수 있습니다. 선택지 열이 없으면 O/X입니다.</p>
      {draft.map((question, i) => <div className="off-edit-row" key={i}>
        <div className="off-edit-heading"><b>{i + 1}번{question.topic ? ` · ${question.topic}` : ''}</b>{question.review && <span className="off-review-badge">원문: {question.review}</span>}<button disabled={draft.length <= 1} onClick={() => setDraft(draft.filter((_, j) => i !== j))}>삭제</button></div>
        <label className="off-edit-question">문제<textarea value={question.text} onChange={e => edit(i, { text: e.target.value })} /></label>
        <label>보기 1<input value={question.choiceO} onChange={e => edit(i, { choiceO: e.target.value })} /></label>
        <label>보기 2<input value={question.choiceX} onChange={e => edit(i, { choiceX: e.target.value })} /></label>
        <label>정답<select value={question.answer} onChange={e => edit(i, { answer: e.target.value as 'O' | 'X' })}><option value="O">보기 1: {question.choiceO}</option><option value="X">보기 2: {question.choiceX}</option></select></label>
        <label>제한시간(초)<input type="number" min="1" max="600" value={question.seconds} onChange={e => edit(i, { seconds: Number(e.target.value) })} /></label>
        <label className="off-edit-explanation">해설<textarea value={question.explanation} onChange={e => edit(i, { explanation: e.target.value })} /></label>
        <label className="off-edit-note">진행 메모 · 관리자 전용<textarea value={question.note ?? ''} onChange={e => edit(i, { note: e.target.value })} /></label>
      </div>)}
      <div className="off-buttons"><button onClick={() => setDraft([...draft, { text: '', answer: 'O', choiceO: 'O', choiceX: 'X', seconds: 15, explanation: '' }])}>+ 문제 추가</button><button className="primary" onClick={() => { try { const questions = validateQuestions(draft); update({ questions, index: 0, phase: 'ready', deadline: null, remaining: null, blank: false }); } catch (e) { setMessage((e as Error).message); } }}>문제 적용</button></div>
    </section>
  </main>;
}
