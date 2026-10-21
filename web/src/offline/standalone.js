'use strict';
const $ = id => document.getElementById(id);
const KEY = 'ox-banquet-standalone-v1';
const DEFAULTS = JSON.parse($('event-data').textContent);
const defaultSettings = {cohost:'아스트라',host:'김희진',voiceURI:'',rate:1,volume:0.65,speak:true,countVoice:true,intro:'',closing:''};
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validText = value => typeof value === 'string' ? value : '';
function validate(value) {
 if(!Array.isArray(value)||!value.length) throw Error('문제를 한 개 이상 넣어 주세요.');
 return value.map((q,i)=>{
  if(!q||typeof q.text!=='string'||!q.text.trim()||!Number.isInteger(q.seconds)||q.seconds<1||q.seconds>600||typeof q.explanation!=='string') throw Error((i+1)+'번 문제: 문제·해설·제한시간(1~600초)을 확인해 주세요.');
  const choiceO=q.choiceO===undefined?'O':validText(q.choiceO).trim(),choiceX=q.choiceX===undefined?'X':validText(q.choiceX).trim();
  if(!choiceO||!choiceX||choiceO===choiceX) throw Error((i+1)+'번: 서로 다른 보기를 두 개 입력해 주세요.');
  let answer=String(q.answer).trim();
  if(!['O','X'].includes(answer)) answer=answer==='A'?'O':answer==='B'?'X':answer===choiceO?'O':answer===choiceX?'X':answer;
  if(!['O','X'].includes(answer)) throw Error((i+1)+'번 정답은 O/X, A/B 또는 보기의 내용이어야 합니다.');
  const result={text:q.text.trim(),choiceO,choiceX,answer,seconds:q.seconds,explanation:q.explanation};
  for(const key of ['topic','review','note','source','scriptQuestion','scriptAnswer']) if(typeof q[key]==='string') result[key]=q[key];
  if(Array.isArray(q.sources)) result.sources=q.sources.filter(s=>typeof s==='string');
  return result;
 });
}
const oldSamples=['지구는 태양 주위를 돈다.','문어의 심장은 하나다.','소리는 진공에서도 전달된다.'];
const isOldSamples=qs=>qs.length===3&&qs.every((q,i)=>q.text===oldSamples[i]&&q.seconds===15&&q.answer===(i===0?'O':'X')&&!q.scriptQuestion&&!q.scriptAnswer&&q.choiceO==='O'&&q.choiceX==='X'&&q.explanation===['지구는 태양 주위를 공전합니다.','문어의 심장은 세 개입니다.','소리는 전달할 매질이 필요합니다.'][i]);
let questions=validate(DEFAULTS),left='O',settings={...defaultSettings};
try{
 const saved=JSON.parse(localStorage.getItem(KEY));
 if(saved){const qs=validate(saved.questions);questions=isOldSamples(qs)?validate(DEFAULTS):qs;left=saved.left==='X'?'X':'O';
  if(saved.settings){for(const k of ['cohost','host','voiceURI','intro','closing']) if(typeof saved.settings[k]==='string') settings[k]=saved.settings[k];
   if(Number.isFinite(saved.settings.rate))settings.rate=Math.max(.7,Math.min(1.3,saved.settings.rate));
   if(Number.isFinite(saved.settings.volume))settings.volume=Math.max(0,Math.min(1,saved.settings.volume));
   if(typeof saved.settings.speak==='boolean')settings.speak=saved.settings.speak;
   if(typeof saved.settings.countVoice==='boolean')settings.countVoice=saved.settings.countVoice;}
 }
}catch{$('status').textContent='저장된 문제를 읽지 못해 행사 문제집을 열었습니다. 백업 파일을 불러올 수 있습니다.';}
let draft=structuredClone(questions),index=0,phase='ready',step='intro',blank=false,deadline=null,remaining=null,screen=null;
let busy=false,waiting=false,completion=null,narrationToken=0,scriptKind='intro',caption='',spoken=false,music=false,mic=false,lastTick=null,lastKey=0,lastCue=-Infinity,lastStage='',lastScriptKey='';
const status=text=>{$('status').textContent=text;};
const audioFiles=new Map();let audioImportToken=0;
const media=new window.QuizMedia({onStatus:status,onSpeaking:value=>{spoken=value;render();},onVoices:()=>voices(),onCue:()=>nextCue(),onMicState:value=>{mic=value==='listening'||value==='starting';render();}});
function save(){try{localStorage.setItem(KEY,JSON.stringify({questions,left,settings}));}catch{status('자동 저장을 사용할 수 없습니다. 문제 백업으로 파일을 저장해 주세요.');}}
function label(q,choice){return choice==='O'?q.choiceO:q.choiceX;}
function sayLabel(value){return value==='O'?'오':value==='X'?'엑스':value;}
function timeLeft(){return deadline===null?remaining:Math.max(0,Math.ceil((deadline-Date.now())/1000));}
function script(kind,q=questions[index]){
 const right=left==='O'?'X':'O';
 if(kind==='intro')return settings.intro||`안녕하세요. ${settings.host} 사회자와 함께 진행할 ${settings.cohost}입니다. 오늘은 화면을 보고 손을 들어 정답을 선택해 주세요. 참가자 본인의 왼손과 오른손 기준입니다. 각 문제의 보기와 손 방향은 화면에 표시됩니다. 문제 낭독이 끝나면 선택 시간이 시작됩니다. 맛보기 문제는 틀려도 탈락하지 않습니다. 준비되셨나요?`;
 if(kind==='closing')return settings.closing||`모든 문제를 마쳤습니다. 함께해 주신 여러분께 감사드립니다. 우승자와 참가자 모두에게 큰 박수 부탁드립니다. 지금까지 공동 사회자 ${settings.cohost}였습니다.`;
 if(kind==='question')return q.scriptQuestion||`${q.text} 왼손은 ${sayLabel(label(q,left))}, 오른손은 ${sayLabel(label(q,right))}입니다. 제한시간은 ${q.seconds}초입니다. 지금부터 선택해 주세요.`;
 if(kind==='answer')return q.scriptAnswer||`정답은 ${sayLabel(label(q,q.answer))}입니다. ${q.explanation}`;
 return '';
}
function cueKey(kind,n=index){return kind==='question'||kind==='answer'?kind+'-'+String(n+1).padStart(2,'0'):kind;}
function cueManifest(){
 const cue=(kind,q,n)=>({key:cueKey(kind,n),filename:cueKey(kind,n)+'.wav',text:script(kind,q)});
 return {format:'ox-cue-audio-v1',cues:[cue('intro'),...questions.flatMap((q,n)=>[cue('question',q,n),cue('answer',q,n)]),cue('closing')]};
}
function audioProblem(item,text){
 if(item.text!==text)return '대본이 변경되어 사용 중지 · 새 대본으로 제작 후 다시 불러오세요.';
 if(item.loading)return '파일을 읽는 중입니다.';
 return item.error||'';
}
function renderAudioFiles(){
 const cues=cueManifest().cues,available=cues.filter(c=>{const a=audioFiles.get(c.key);return a&&!audioProblem(a,c.text);}).length;
 const current=audioFiles.get(cueKey(scriptKind));
 $('audio-current').textContent='현재 대본: '+(current?(audioProblem(current,script(scriptKind))||current.name+' · 녹음 음성 사용'):'등록된 파일 없음 · PC 음성 사용');
 $('audio-summary').textContent='녹음 음성 '+available+' / '+cues.length+'개 준비됨'+(audioFiles.size>available?' · 확인이 필요한 파일 '+(audioFiles.size-available)+'개':'')+' · 파일은 이 창을 닫으면 사라집니다.';
 $('audio-list').textContent=Array.from(audioFiles,([key,item])=>{const cue=cues.find(c=>c.key===key);return key+' — '+item.name+' — '+(!cue?'현재 문제 목록에 없는 파일':audioProblem(item,cue.text)||'준비됨');}).join('\n')||'아직 불러온 녹음 파일이 없습니다. 생성된 교수님 음성은 HTML에 포함되어 있지 않습니다.';
 $('audio-import').disabled=busy||deadline!==null;$('audio-clear').disabled=busy||deadline!==null||!audioFiles.size;
 $('pc-voice').disabled=busy||deadline!==null||!scriptAllowed(scriptKind);
}
async function importAudioFiles(files,confirmed=false){
 if(!files.length)return;
 const token=++audioImportToken,cues=cueManifest().cues;
 try{
  const manifests=files.filter(f=>/\.json$/i.test(f.name));
  if(manifests.length>1)throw Error('대본 목록 JSON은 한 개만 선택해 주세요.');
  let entries=null;
  if(manifests.length){
   const manifest=JSON.parse(await manifests[0].text());
   if(manifest.format!=='ox-cue-audio-v1'||!Array.isArray(manifest.cues))throw Error('이 화면에서 내려받은 음성 제작용 대본 JSON을 선택해 주세요.');
   entries=new Map();
   for(const entry of manifest.cues){if(!entry||typeof entry.key!=='string'||typeof entry.text!=='string'||entries.has(entry.key))throw Error('대본 목록의 형식 또는 중복 항목을 확인해 주세요.');entries.set(entry.key,entry.text);}
  }else if(!confirmed)throw Error('녹음과 현재 대본이 같은지 확인한 뒤 확인란을 선택하거나, 제작에 쓴 대본 JSON을 음성과 함께 불러오세요.');
  if(token!==audioImportToken)return;
  const audio=files.filter(f=>! /\.json$/i.test(f.name));
  if(!audio.length)throw Error('MP3 또는 WAV 음성 파일도 함께 선택해 주세요.');
  const seen=new Set(),results=[];
  for(const file of audio){
   const match=/^(intro|closing|(?:question|answer)-\d{2,})\.(mp3|wav)$/i.exec(file.name);
   const key=match?.[1].toLowerCase(),cue=cues.find(c=>c.key===key);
   if(!cue){results.push(file.name+': 파일명 또는 문제 번호를 확인하세요.');continue;}
   if(seen.has(key)){results.push(file.name+': 같은 대본의 파일을 두 개 선택했습니다. 첫 파일만 사용합니다.');continue;}seen.add(key);
   if(entries&&entries.get(key)!==cue.text){results.push(file.name+': 제작용 대본과 현재 대본이 다릅니다. 파일을 등록하지 않았습니다.');continue;}
   const item={name:file.name,text:cue.text,loading:true};audioFiles.set(key,item);renderAudioFiles();
   try{item.buffer=await media.loadAudio(file);item.loading=false;results.push(file.name+': 준비됨');}
   catch{item.loading=false;item.error='파일을 읽지 못했습니다. 유효한 MP3/WAV를 다시 불러오세요.';results.push(file.name+': '+item.error);}
   if(token!==audioImportToken)return;
   renderAudioFiles();
  }
  $('audio-import-result').textContent=results.join('\n');status('녹음 파일 확인을 마쳤습니다. 아래 파일별 결과를 확인하세요.');
 }catch(error){if(token===audioImportToken){$('audio-import-result').textContent=error.message;status(error.message);}}
 if(token===audioImportToken)renderAudioFiles();
}
function scriptAllowed(kind){return kind!=='answer'||phase==='answer';}
function updateScript(force=false){
 const key=index+':'+scriptKind+':'+phase;
 if(force||key!==lastScriptKey){$('current-script').value=scriptAllowed(scriptKind)?script(scriptKind):'';lastScriptKey=key;}
 $('script-label').textContent=({intro:'시작 인사',question:(index+1)+'번 문제 낭독',answer:(index+1)+'번 정답·해설',closing:'마무리'})[scriptKind]+' · 수정 후 “이 대본 저장”';
}
function invalidateNarration(){narrationToken++;media.stopSpeech();busy=false;waiting=false;completion=null;spoken=false;}
function setNarrationCompletion(onComplete){
 const token=narrationToken;
 completion=()=>{if(token!==narrationToken||!completion)return;completion=null;waiting=false;busy=false;spoken=false;caption='';onComplete();render();};
 completion.action=onComplete;
}
function runNarration(kind,onComplete,usePC=false){
 invalidateNarration();scriptKind=kind;caption=script(kind);updateScript(true);const token=narrationToken;setNarrationCompletion(onComplete);
 const done=completion;waiting=true;media.setDucking(true);
 if(!settings.speak&&!usePC){status('수동 낭독 모드입니다. 읽기를 마친 뒤 “낭독 완료”를 눌러 주세요.');render();return;}
 busy=true;waiting=false;render();
 const playback={voiceURI:settings.voiceURI,rate:settings.rate,volume:settings.volume,onEnd:done,onError:message=>{
  if(token!==narrationToken)return;busy=false;waiting=true;spoken=false;status(message||'음성을 재생하지 못했습니다. 직접 읽은 뒤 “낭독 완료”를 누르세요.');render();
 }};
 const recording=usePC?null:audioFiles.get(cueKey(kind));
 if(recording){
  const problem=audioProblem(recording,caption);
  if(problem){playback.onError(problem+' PC 음성으로 읽기를 선택하거나 직접 읽은 뒤 낭독 완료를 누르세요.');return;}
  status(recording.name+' 녹음 음성을 재생합니다.');void media.playAudio(recording.buffer,playback);
 }else{status('PC 음성으로 대본을 읽습니다.');media.speak(caption,playback);}
}
function completeNarration(){const done=completion;if(!done)return;media.stopSpeech();busy=false;waiting=false;done();}
function intro(){phase='ready';step='question';blank=false;runNarration('intro',()=>{step='question';});}
function readQuestion(n){
 invalidateNarration();index=n;phase='question';step='timer';blank=false;deadline=null;remaining=null;lastTick=null;media.effect('question');
 runNarration('question',()=>startTimer());
}
function startTimer(){invalidateNarration();caption='';step='timer';remaining=null;deadline=Date.now()+questions[index].seconds*1000;lastTick=null;render();}
function reveal(){
 if(phase!=='question'||busy||waiting)return;
 invalidateNarration();deadline=null;remaining=null;phase='answer';step='next';media.effect('correct');runNarration('answer',()=>{step='next';});
}
function closeShow(){invalidateNarration();deadline=null;remaining=null;phase='end';step='finished';blank=false;media.effect('fanfare');runNarration('closing',()=>{music=false;media.stopMusic();});}
function cueLabel(){
 if(busy)return '낭독 중…';
 if(waiting)return scriptKind==='question'&&phase==='question'?'낭독 완료 · 타이머 시작':'낭독 완료';
 if(phase==='question'&&deadline!==null)return '선택 시간 진행 중';
 if(phase==='question'&&remaining>0)return '타이머 계속';
 if(step==='intro')return '다음 · 시작 인사 읽기';
 if(step==='question')return '다음 · '+(index+1)+'번 문제 읽기';
 if(step==='reveal')return '다음 · 정답·해설 읽기';
 if(step==='next')return index===questions.length-1?'다음 · 마무리 읽기':'다음 · '+(index+2)+'번 문제 읽기';
 return step==='finished'?'진행 완료':'다음 · 큐';
}
function nextCue(){
 if(busy||deadline!==null||blank)return;
 const now=Date.now();if(now-lastCue<650)return;lastCue=now;
 void media.unlock();
 if(waiting){completeNarration();return;}
 if(phase==='question'&&remaining>0){deadline=Date.now()+remaining*1000;remaining=null;render();return;}
 if(step==='intro'){intro();return;}
 if(step==='question'){readQuestion(index);return;}
 if(step==='reveal'||(phase==='question'&&remaining===0)){reveal();return;}
 if(step==='next'){if(index===questions.length-1)closeShow();else readQuestion(index+1);}
}
function selectQuestion(n){invalidateNarration();index=n;phase='ready';step='question';scriptKind='question';deadline=null;remaining=null;caption='';blank=false;render();updateScript(true);}
function stage(){
 if(blank)return '<div class="stage black"></div>';
 const q=questions[index],t=timeLeft(),right=left==='O'?'X':'O',active=phase==='question'||phase==='answer';
 let content=phase==='ready'?'<h1>함께하는 손들기 퀴즈</h1><p>화면의 보기를 보고 정답 쪽의 손을 들어 주세요.</p>':phase==='end'?'<h1>수고하셨습니다!</h1><p>모두 큰 박수로 마무리해 주세요.</p>':'<h1>'+esc(q.text)+'</h1>'+(phase==='answer'?'<div class="answer '+q.answer+'">정답 '+esc(label(q,q.answer))+'</div><p>'+esc(q.explanation)+'</p>':'<div class="timer '+(t!==null&&t>0&&t<=5?'urgent':'')+'">'+(busy||waiting?'문제를 듣고 선택해 주세요':t===null?'선택 준비':t===0?'시간 종료! 손을 그대로 유지해 주세요':t<=5?t:t+'초')+'</div>');
 const hands=active?'<div class="hands"><div class="hand '+left+(label(q,left).length===1?' symbol':'')+'"><b>'+esc(label(q,left))+'</b><span>왼손</span></div><div class="hand '+right+(label(q,right).length===1?' symbol':'')+'"><b>'+esc(label(q,right))+'</b><span>오른손</span></div></div><small>참가자 본인의 왼손 · 오른손 기준</small>':'';
 return '<div class="stage"><div class="eyebrow">QUIZ · '+(phase==='ready'?'READY':phase==='end'?'FINISH':(index+1)+' / '+questions.length)+'</div>'+content+hands+'<div class="cohost '+(spoken?'speaking ':'')+(phase==='ready'&&busy?'intro':'')+'"><span class="orb" aria-hidden="true"></span><b>'+esc(settings.cohost)+'</b></div>'+(caption?'<p class="caption">'+esc(caption)+'</p>':'')+'</div>';
}
function render(){
 const t=timeLeft();
 const html=stage();if(html!==lastStage){$('preview').innerHTML=html;lastStage=html;}
 if(screen&&!screen.closed){try{const target=screen.document.getElementById('stage');if(target&&target.innerHTML!==html)target.innerHTML=html;}catch{screen=null;status('프로젝션 창을 다시 열어 주세요.');}}
 $('connection').textContent=screen&&!screen.closed?'● 프로젝션 창 열림 · 리모컨 사용 전 이 창 또는 프로젝션 창을 클릭하세요.':'프로젝션 창을 열어 주세요.';
 $('question-select').value=index;$('hands').value=left;
 $('secret').textContent='관리자 전용 정답: '+label(questions[index],questions[index].answer)+'\n'+questions[index].explanation;
 $('review').textContent=[questions[index].review,questions[index].note].filter(Boolean).join(' · ');
 $('cue').textContent=cueLabel();$('cue').disabled=busy||deadline!==null||(step==='finished'&&!waiting)||blank;
 $('step').textContent=busy?'대본 낭독을 마칠 때까지 기다립니다.':waiting?'읽기를 마치면 완료 버튼으로 이어갑니다.':phase==='question'&&t===0?'다음 큐를 받으면 정답을 공개하고 해설을 읽습니다.':'시작 인사 → 문제 낭독 → 타이머 → 정답·해설 → 다음 문제';
 $('reveal').disabled=phase!=='question'||busy||waiting;
 $('timer-start').disabled=phase!=='question'||busy;
 $('pause').disabled=phase!=='question'||busy||waiting||((deadline===null&&remaining===null)||t===0);
 $('pause').textContent=deadline===null&&remaining>0?'타이머 계속':'일시정지';
 $('repeat').disabled=deadline!==null||!scriptAllowed(scriptKind);
 $('show').disabled=busy||deadline!==null;$('previous').disabled=index===0||busy;
 $('hands').disabled=phase==='question'||phase==='answer';$('blank').textContent=blank?'화면 다시 켜기':'화면 가리기';
 $('music').textContent=music?'배경음악 끄기':'배경음악 켜기';$('mic').textContent=mic?'음성 큐 듣기 끄기':'음성 “큐” 듣기 켜기';
 $('mic-status').textContent=mic?'마이크 켜짐 · “큐”라고 말하면 다음 단계로 진행합니다. 낭독 중에는 큐를 무시합니다.':'마이크 꺼짐 · 기기 내 한국어 인식이 지원되어야 합니다. 리모컨과 버튼도 사용할 수 있습니다.';
 media.setDucking(busy||waiting||(t!==null&&t<=5));
 // The stage waits quietly for a voice cue, avoiding BGM feedback into the microphone.
 if(music&&!(mic&&!busy&&deadline===null))media.startMusic();else media.stopMusic();
 updateScript();renderAudioFiles();
}
function tick(){
 const t=timeLeft();
 if(phase==='question'&&deadline!==null&&t!==lastTick){lastTick=t;if(t>0&&t<=5){media.effect('tick');if(settings.countVoice&&media.voices().length)media.speak(['','일','이','삼','사','오'][t],{voiceURI:settings.voiceURI,rate:1.1,volume:settings.volume});}
  if(t===0){deadline=null;remaining=0;step='reveal';media.stopSpeech();media.effect('timeup');status('시간 종료. 다음 큐를 주면 정답·해설을 읽습니다.');}}
 render();
}
function keyboard(e){
 if(e.defaultPrevented||e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;
 const el=e.target;if(el?.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(el?.tagName))return;
 if(['PageDown','ArrowRight','ArrowDown',' '].includes(e.key)){
  // A presenter's Space means next, even when a previously clicked control retains focus.
  // preventDefault also cancels the button's native Space click (Enter remains native).
  e.preventDefault();const now=Date.now();if(now-lastKey<650)return;lastKey=now;nextCue();
 }else if(e.key==='Escape'){stopShow();}
}
function stopShow(){
 const done=completion;narrationToken++;media.stopSpeech();busy=false;spoken=false;
 if(done){waiting=true;setNarrationCompletion(done.action);}else waiting=false;
 if(deadline!==null){remaining=timeLeft();deadline=null;if(remaining===0)step='reveal';}
 music=false;media.stopMusic();media.stopCueListening();caption='';status('진행을 멈췄습니다. 다시 읽기 또는 다음 버튼으로 이어갈 수 있습니다.');render();
}
function voices(){
 const list=media.voices();const chosen=settings.voiceURI;$('voice').replaceChildren(...(list.length?list.map(v=>new Option(v.name,v.voiceURI)):[new Option('설치된 한국어 음성 없음','')]));
 if(list.some(v=>v.voiceURI===chosen))$('voice').value=chosen;else if(list.length)settings.voiceURI=list[0].voiceURI;
 $('voice-status').textContent=list.length?'인터넷 없이 사용할 수 있는 한국어 PC 음성 '+list.length+'개 · 행사 전 “소리 · 음성 확인”을 눌러 주세요.':'한국어 PC 음성을 찾지 못했습니다. Windows 음성 설정에서 한국어 음성을 설치하거나 직접 읽고 낭독 완료 버튼을 사용하세요.';
}
function options(){$('question-select').replaceChildren(...questions.map((q,i)=>new Option((i+1)+'. '+q.text,i)));}
function editor(){
 $('editor').innerHTML=draft.map((q,i)=>'<div class="editor-row"><p><b>'+(i+1)+'번</b> <span class="badge">'+esc(q.review||'직접 편집')+'</span></p><div class="editor-grid">'+
  '<label class="wide">문제<textarea data-i="'+i+'" data-key="text">'+esc(q.text)+'</textarea></label><label>첫 번째 보기<input data-i="'+i+'" data-key="choiceO" value="'+esc(q.choiceO)+'"></label><label>두 번째 보기<input data-i="'+i+'" data-key="choiceX" value="'+esc(q.choiceX)+'"></label>'+
  '<label class="wide">해설<textarea data-i="'+i+'" data-key="explanation">'+esc(q.explanation)+'</textarea></label><label>정답<select data-i="'+i+'" data-key="answer"><option value="O"'+(q.answer==='O'?' selected':'')+'>첫 번째 보기</option><option value="X"'+(q.answer==='X'?' selected':'')+'>두 번째 보기</option></select></label><label>제한시간(초)<input type="number" min="1" max="600" data-i="'+i+'" data-key="seconds" value="'+q.seconds+'"></label>'+
  '<label class="wide">문제 낭독 대본 (비우면 자동 구성)<textarea data-i="'+i+'" data-key="scriptQuestion">'+esc(q.scriptQuestion||'')+'</textarea></label><label class="wide">정답 낭독 대본 (공개 후 사용)<textarea data-i="'+i+'" data-key="scriptAnswer">'+esc(q.scriptAnswer||'')+'</textarea></label></div><p class="review">'+esc(q.note||'')+'</p><button data-remove="'+i+'" '+(draft.length===1?'disabled':'')+'>삭제</button></div>').join('');
}
function csv(text){
 const rows=[];let row=[],field='',quoted=false;const s=text.replace(/^\uFEFF/,'');
 for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quoted&&s[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}else if(!quoted&&[',','\r','\n'].includes(c)){row.push(field);field='';if(c!==','){rows.push(row);row=[];if(c==='\r'&&s[i+1]==='\n')i++;}}else field+=c;}
 if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');if(field||row.length){row.push(field);rows.push(row);}
 const header=(rows.shift()||[]).map(c=>c.trim());const get=(r,names)=>r[header.findIndex(h=>names.includes(h))]?.trim()||'';
 return validate(rows.filter(r=>r.some(c=>c.trim())).map(r=>({text:get(r,['문제','text','question']),choiceO:get(r,['선택지1','보기O','choiceO'])||'O',choiceX:get(r,['선택지2','보기X','choiceX'])||'X',answer:get(r,['정답','answer']),seconds:Number(get(r,['제한시간','seconds','timeLimitSec'])||15),explanation:get(r,['해설','explanation']),scriptQuestion:get(r,['문제대본','scriptQuestion']),scriptAnswer:get(r,['정답대본','scriptAnswer']),review:get(r,['검토상태','review']),note:get(r,['진행메모','note'])})));
}
function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('open').onclick=()=>{
 void media.unlock();if(screen&&!screen.closed){screen.focus();render();return;}
 screen=window.open('','ox-banquet-projection','popup=yes,width=1280,height=800');
 if(!screen){status('팝업이 차단되었습니다. 팝업을 허용한 뒤 다시 눌러 주세요.');return;}
 screen.document.open();screen.document.write('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>OX 퀴즈 · 프로젝션</title><style>'+document.querySelector('style').textContent+'</style></head><body class="projection"><div id="stage"></div><button class="fullscreen" id="full">전체화면 · F11</button></body></html>');screen.document.close();
 screen.document.getElementById('full').onclick=()=>screen.document.documentElement.requestFullscreen().catch(()=>status('프로젝션 창에서 F11을 눌러 주세요.'));
 screen.addEventListener('keydown',keyboard);status('프로젝션 창을 보조 화면으로 옮겨 주세요. 이 창에서도 리모컨으로 진행할 수 있습니다.');render();
};
$('cue').onclick=nextCue;$('show').onclick=()=>{void media.unlock();readQuestion(index);};$('reveal').onclick=reveal;$('stop').onclick=stopShow;
function repeatNarration(usePC=false){const kind=scriptKind;runNarration(kind,()=>{if(kind==='question'){if(phase==='question')startTimer();}else{step=kind==='intro'?'question':kind==='answer'?'next':'finished';}},usePC);}
$('repeat').onclick=()=>repeatNarration();$('pc-voice').onclick=()=>repeatNarration(true);
$('question-select').onchange=e=>selectQuestion(Number(e.target.value));$('previous').onclick=()=>selectQuestion(Math.max(0,index-1));
$('timer-start').onclick=()=>{if(waiting)completeNarration();else startTimer();};
$('pause').onclick=()=>{if(deadline!==null){remaining=timeLeft();deadline=null;}else{deadline=Date.now()+remaining*1000;remaining=null;}render();};
$('ready').onclick=()=>{invalidateNarration();phase='ready';step='intro';scriptKind='intro';caption='';deadline=null;remaining=null;blank=false;render();};
$('end').onclick=closeShow;
$('blank').onclick=()=>{if(!blank){stopShow();blank=true;}else blank=false;render();};
$('hands').onchange=e=>{left=e.target.value;save();updateScript(true);render();};
$('editor').oninput=e=>{const el=e.target;if(el.dataset.key)draft[Number(el.dataset.i)][el.dataset.key]=el.dataset.key==='seconds'?Number(el.value):el.value;};
$('editor').onclick=e=>{if(e.target.dataset.remove!==undefined){draft.splice(Number(e.target.dataset.remove),1);editor();}};
$('add').onclick=()=>{draft.push({text:'',choiceO:'O',choiceX:'X',answer:'O',seconds:5,explanation:''});editor();};
$('apply').onclick=()=>{try{const next=validate(draft);if((phase==='question'||phase==='answer')&&!confirm('진행을 멈추고 편집한 문제를 적용할까요?'))return;stopShow();questions=next;draft=structuredClone(questions);selectQuestion(0);save();options();editor();render();status(questions.length+'개 문제를 적용했습니다.');}catch(e){status(e.message);}};
$('event-questions').onclick=()=>{draft=validate(DEFAULTS);editor();status('행사 '+DEFAULTS.length+'문제를 편집 창에 불러왔습니다. “문제 적용”을 누르면 진행에 반영됩니다.');};
$('import').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const text=await file.text();draft=file.name.toLowerCase().endsWith('.json')?validate(JSON.parse(text)):csv(text);editor();status('불러왔습니다. 검토 후 “문제 적용”을 누르세요.');}catch(err){status(err.message);}e.target.value='';};
$('backup').onclick=()=>download(JSON.stringify(questions,null,2),'OX-questions.json','application/json');
$('export-scripts').onclick=()=>download(cueManifest().cues.map(c=>'['+c.filename+' 또는 '+c.key+'.mp3]\n'+c.text).join('\n\n'),'OX-cohost-scripts.txt','text/plain;charset=utf-8');
$('script-save').onclick=()=>{
 const text=$('current-script').value.trim();
 const synchronized=JSON.stringify(draft)===JSON.stringify(questions);
 if(scriptKind==='intro')settings.intro=text;else if(scriptKind==='closing')settings.closing=text;else{const field=scriptKind==='question'?'scriptQuestion':'scriptAnswer';questions[index][field]=text;if(synchronized){draft[index][field]=text;editor();}}
 save();status(synchronized?'현재 대본을 저장했습니다. 다음 낭독부터 사용합니다.':'현재 적용된 문제의 대본을 저장했습니다. 별도로 편집 중인 문제 목록에는 반영하지 않았습니다.');updateScript(true);renderAudioFiles();
};
$('audio-import').onchange=async e=>{await importAudioFiles(Array.from(e.target.files),$('audio-confirm').checked);e.target.value='';};
$('audio-clear').onclick=()=>{audioImportToken++;audioFiles.clear();$('audio-import-result').textContent='';renderAudioFiles();status('불러온 녹음 파일 연결을 모두 해제했습니다. 다음 낭독부터 PC 음성을 사용합니다.');};
$('export-audio-manifest').onclick=()=>download(JSON.stringify(cueManifest(),null,2),'OX-audio-manifest.json','application/json');
$('script-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('current-script').value);status('대본을 복사했습니다.');}catch{$('current-script').select();status('대본을 선택했습니다. Ctrl+C로 복사하세요.');}};
for(const [id,key] of [['cohost-name','cohost'],['host-name','host']]){$(id).value=settings[key];$(id).onchange=e=>{settings[key]=e.target.value.trim()||defaultSettings[key];save();updateScript(true);render();};}
$('rate').value=settings.rate;$('volume').value=settings.volume;$('speak-enabled').checked=settings.speak;$('count-voice').checked=settings.countVoice;
$('rate').oninput=e=>{settings.rate=Number(e.target.value);save();};$('volume').oninput=e=>{settings.volume=Number(e.target.value);media.setVolume(settings.volume);save();};
$('speak-enabled').onchange=e=>{settings.speak=e.target.checked;save();};$('voice').onchange=e=>{settings.voiceURI=e.target.value;save();};
$('count-voice').onchange=e=>{settings.countVoice=e.target.checked;save();};
$('sound-test').onclick=async()=>{if(busy||deadline!==null){status('진행을 멈춘 뒤 음성을 확인해 주세요.');return;}await media.unlock();media.effect('correct');media.speak('안녕하세요. 준비된 대본을 읽겠습니다.',{voiceURI:settings.voiceURI,rate:settings.rate,volume:settings.volume,onEnd:()=>status('음성 확인을 마쳤습니다.'),onError:status});};
$('music').onclick=async()=>{await media.unlock();music=!music;render();};
$('mic').onclick=()=>{if(mic)media.stopCueListening();else void media.startCueListening();};
window.addEventListener('keydown',keyboard);window.addEventListener('beforeunload',e=>{if(screen&&!screen.closed){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>media.dispose());
options();editor();media.setVolume(settings.volume);voices();render();setInterval(tick,100);
