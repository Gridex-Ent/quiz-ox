import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appSource = readFileSync(new URL('../web/src/offline/standalone.js', import.meta.url), 'utf8');
const mediaSource = readFileSync(new URL('./offline-media.js', import.meta.url), 'utf8');
const fixture = [
  { text: '첫 문제', choiceO: '빛', choiceX: '전기', answer: 'X', seconds: 5, explanation: '비공개 해설 하나', scriptAnswer: '비공개 정답 대본 하나', topic: '주제', source: '근거', sources: ['참고 자료'], review: '후보', note: '진행 메모' },
  { text: '둘째 문제', choiceO: 'O', choiceX: 'X', answer: 'O', seconds: 5, explanation: '비공개 해설 둘', scriptQuestion: '둘째 문제 원래 대본' },
];

function harness({ saved, speechFails = false, audioFails = false, loadFails = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: id === 'event-data' ? JSON.stringify(fixture) : '', innerHTML: '', value: '', checked: false,
      replaceChildren(...children) { this.children = children; }, select() {}, click() {}, dataset: {},
    });
    return elements.get(id);
  };
  let now = 10000;
  const savedData = new Map(saved ? [['ox-banquet-standalone-v1', JSON.stringify(saved)]] : []);
  class FakeMedia {
    constructor(callbacks) { this.callbacks = callbacks; this.effects = []; this.history = []; }
    voices() { return [{ name: '한국어', voiceURI: 'local-ko' }]; }
    unlock() { return Promise.resolve(true); }
    setVolume() {} setDucking() {} startMusic() {} stopMusic() {}
    stopCueListening() { this.callbacks.onMicState('off'); }
    stopSpeech() { this.callbacks.onSpeaking(false); this.current = null; }
    speak(text, options) {
      this.current = { text, options }; this.history.push(this.current);
      if (speechFails) { options.onError('한국어 음성 없음'); return false; }
      this.callbacks.onSpeaking(true); return true;
    }
    async loadAudio(file) { if (loadFails) throw Error('invalid audio'); return { name: file.name, duration: 1 }; }
    playAudio(buffer, options) {
      this.current = { text: buffer.name, options, recording: true }; this.history.push(this.current);
      if (audioFails) { options.onError('녹음 재생 실패'); return false; }
      this.callbacks.onSpeaking(true); return true;
    }
    finish() { const current = this.current; this.current = null; this.callbacks.onSpeaking(false); current?.options.onEnd(); }
    effect(name) { this.effects.push(name); }
    dispose() {}
  }
  const context = vm.createContext({
    document: { getElementById: element, querySelector: () => ({ textContent: '' }) },
    window: { QuizMedia: FakeMedia, addEventListener() {} },
    localStorage: { getItem: key => savedData.get(key) ?? null, setItem: (key, value) => savedData.set(key, value) },
    structuredClone, Option: function(text, value) { this.text = text; this.value = value; },
    Date: class extends Date { static now() { return now; } },
    setInterval() {}, setTimeout() {}, confirm: () => true, navigator: {}, URL, Blob,
  });
  vm.runInContext(appSource, context);
  const run = source => vm.runInContext(source, context);
  return {
    run, media: run('media'), element, savedData,
    advance(ms) { now += ms; run('tick()'); },
    state() { return JSON.parse(run('JSON.stringify({index,phase,step,busy,waiting,deadline,remaining,caption})')); },
    stage() { return run('stage()'); },
    click(id) { assert.equal(element(id).disabled, false, `${id} should be enabled`); element(id).onclick(); },
  };
}

test('published 18-question audio manifest matches every executable cue', async () => {
  const questions = JSON.parse(readFileSync(new URL('../questions/kiee-a-2026-offline.json', import.meta.url), 'utf8'));
  const manifestText = readFileSync(new URL('../questions/OX-audio-manifest.json', import.meta.url), 'utf8');
  const manifest = JSON.parse(manifestText);
  const h = harness({ saved: { questions, left: 'O' } });
  assert.equal(questions.length, 18);
  assert.equal(manifest.cues.length, 38);
  for (const cue of manifest.cues.filter(c => c.key.startsWith('question-'))) {
    assert.doesNotMatch(cue.text, /^(?:[가-힣]+|\d+)\s*번 문제입니다/);
  }
  assert.deepEqual(JSON.parse(h.run('JSON.stringify(cueManifest())')), manifest);
  // Import the same manifest via the actual manifest validation path.
  const files = manifest.cues.map(c => ({ name: c.filename }));
  files.push({ name: 'OX-audio-manifest.json', text: async () => manifestText });
  h.run('audioFiles.clear()');
  await h.run('importAudioFiles')(files);
  assert.match(h.element('audio-summary').textContent, /38 \/ 38개 준비됨/);
  for (let i = 0; i < questions.length; i++) {
    h.run(`selectQuestion(${i});repeatNarration()`);
    assert.equal(h.media.current.recording, true);
    h.media.finish();
    assert.equal(h.state().deadline, null);
    h.run(`readQuestion(${i})`);
    assert.equal(h.media.current.text, manifest.cues.find(c => c.key === `question-${String(i + 1).padStart(2, '0')}`).filename);
    assert.equal(h.state().deadline, null);
    h.media.finish();
    h.advance(questions[i].seconds * 1000);
    assert.equal(h.state().phase, 'question');
    h.run('nextCue()');
    assert.equal(h.state().phase, 'answer');
    assert.equal(h.media.current.recording, true);
    h.media.finish();
  }
});

test('automatic question narration begins directly with the question text', () => {
  const h = harness();
  assert.ok(h.run("script('question')").startsWith(fixture[0].text));
  assert.doesNotMatch(h.run("script('question')"), /번 문제입니다/);
});

test('cue progression waits for narration and timer; duplicate cues do not skip', () => {
  const h = harness();
  h.run('nextCue();nextCue()');
  assert.equal(h.media.history.length, 1);
  assert.equal(h.state().phase, 'ready');
  h.media.finish();
  h.advance(700);
  h.run('nextCue();nextCue()');
  assert.equal(h.state().index, 0);
  assert.equal(h.state().deadline, null);
  h.media.finish();
  assert.equal(h.state().deadline, 15700);
  h.run('nextCue()');
  assert.equal(h.state().phase, 'question');
  h.advance(5000);
  assert.equal(h.state().step, 'reveal');
  assert.equal(h.state().phase, 'question');
  h.run('nextCue();nextCue()');
  assert.equal(h.state().phase, 'answer');
  assert.equal(h.state().index, 0);
  h.media.finish();
  h.advance(700);
  h.run('nextCue();nextCue()');
  assert.equal(h.state().index, 1);
});

for (const usePC of [false, true]) {
  for (const stopped of [false, true]) {
    test(`ready question preview preserves readiness (${usePC ? 'PC' : 'recording'}, ${stopped ? 'stopped/manual' : 'ended'})`, async () => {
      const h = harness();
      await h.run('importAudioFiles([{name:"question-01.wav"}],true)');
      h.run('selectQuestion(0)');
      h.click(usePC ? 'pc-voice' : 'repeat');
      assert.equal(Boolean(h.media.current.recording), !usePC);
      const stale = h.media.current.options.onEnd;
      if (stopped) {
        h.run('stopShow()');
        stale();
        assert.equal(h.state().waiting, true);
        assert.equal(h.element('cue').textContent, '낭독 완료');
        h.click('cue');
        // A second stop must not resurrect the completed preview continuation.
        h.run('stopShow()');
        assert.equal(h.state().waiting, false);
      } else h.media.finish();
      h.advance(6000);
      assert.equal(h.state().phase, 'ready');
      assert.equal(h.state().step, 'question');
      assert.equal(h.state().deadline, null);
      assert.equal(h.element('cue').disabled, false);
      h.click('cue');
      assert.equal(h.state().phase, 'question');
      assert.equal(h.state().deadline, null);
      h.media.finish();
      assert.notEqual(h.state().deadline, null);
      h.advance(5000);
      assert.equal(h.state().step, 'reveal');
      h.click('cue');
      assert.equal(h.state().phase, 'answer');
    });
  }
}

test('answer and explanation never enter projection until reveal', () => {
  const h = harness();
  h.run('readQuestion(0)');
  assert.doesNotMatch(h.stage(), /비공개/);
  h.media.finish(); h.advance(5000);
  assert.doesNotMatch(h.stage(), /비공개/);
  h.run('nextCue()');
  assert.match(h.stage(), /비공개 해설 하나/);
  assert.match(h.stage(), /비공개 정답 대본 하나/);
  h.run('selectQuestion(1)');
  assert.doesNotMatch(h.stage(), /비공개/);
});

test('stopped ready preview retries safely and normal recorded narration still resumes manually', async () => {
  const h = harness();
  await h.run('importAudioFiles([{name:"question-01.wav"}],true)');
  h.run('selectQuestion(0);repeatNarration()');
  const stale = h.media.current.options.onEnd;
  h.run('stopShow();repeatNarration()');
  stale();
  assert.equal(h.state().busy, true);
  assert.equal(h.state().deadline, null);
  h.media.finish();
  assert.equal(h.state().step, 'question');
  assert.equal(h.state().deadline, null);
  h.click('cue');
  h.run('stopShow()');
  assert.equal(h.element('cue').textContent, '낭독 완료 · 타이머 시작');
  h.advance(700);
  h.click('cue');
  assert.notEqual(h.state().deadline, null);
  h.advance(5000);
  assert.equal(h.state().step, 'reveal');
});

test('late speech completion after question change cannot start a stale timer', () => {
  const h = harness();
  h.run('readQuestion(0)');
  const stale = h.media.history.at(-1).options.onEnd;
  h.run('selectQuestion(1)'); stale();
  assert.equal(h.state().index, 1);
  assert.equal(h.state().phase, 'ready');
  assert.equal(h.state().deadline, null);
});

test('missing installed speech requires manual completion before timer starts', () => {
  const h = harness({ speechFails: true });
  h.run('readQuestion(0)');
  assert.equal(h.state().busy, false);
  assert.equal(h.state().waiting, true);
  assert.equal(h.state().deadline, null);
  h.run('nextCue()');
  assert.equal(h.state().waiting, false);
  assert.equal(h.state().deadline, 15000);
});

test('paused countdown remains paused and resumes remaining time', () => {
  const h = harness();
  h.run('readQuestion(0)'); h.media.finish(); h.advance(1000);
  h.element('pause').onclick();
  assert.equal(h.state().remaining, 4);
  h.advance(20000);
  assert.equal(h.state().remaining, 4);
  h.run('nextCue()');
  assert.equal(h.state().deadline, 35000);
  h.advance(4000);
  assert.equal(h.state().phase, 'question');
  assert.equal(h.state().step, 'reveal');
});

test('countdown ticks once per second and timeup occurs once', () => {
  const h = harness();
  h.run('readQuestion(0)'); h.media.finish();
  h.advance(0); h.advance(100);
  for (let i = 0; i < 5; i++) h.advance(1000);
  h.advance(1000);
  assert.equal(h.media.effects.filter(x => x === 'tick').length, 5);
  assert.equal(h.media.effects.filter(x => x === 'timeup').length, 1);
});

test('stop during narration invalidates stale end and manual continuation remains available', () => {
  const h = harness();
  h.run('readQuestion(0)');
  const stale = h.media.history.at(-1).options.onEnd;
  h.run('stopShow()'); stale();
  assert.equal(h.state().waiting, true);
  assert.equal(h.state().deadline, null);
  h.run('nextCue()');
  assert.equal(h.state().deadline, 15000);
});

test('swapped hands render and narrate custom labels consistently', () => {
  const h = harness();
  h.element('hands').onchange({ target: { value: 'X' } });
  h.run('readQuestion(0)');
  assert.match(h.media.current.text, /왼손은 전기, 오른손은 빛/);
  assert.match(h.stage(), /전기<\/b><span>왼손/);
  assert.match(h.stage(), /빛<\/b><span>오른손/);
});

test('validation and persistence retain prepared scripts and source metadata', () => {
  const h = harness(); h.run('save()');
  const saved = JSON.parse(h.savedData.get('ox-banquet-standalone-v1'));
  assert.equal(saved.questions[0].scriptAnswer, fixture[0].scriptAnswer);
  assert.equal(saved.questions[0].source, '근거');
  assert.deepEqual(saved.questions[0].sources, ['참고 자료']);
  assert.equal(saved.questions[0].review, '후보');
  const restored = harness({ saved });
  assert.equal(restored.run('questions[0].choiceX'), '전기');
  assert.equal(restored.run('questions[0].note'), '진행 메모');
});

test('saving current script does not overwrite a different question in a dirty editor', () => {
  const h = harness();
  h.run('selectQuestion(0); draft.splice(0,1)');
  h.element('current-script').value = '첫 문제 수정 대본';
  h.element('script-save').onclick();
  assert.equal(h.run('questions[0].scriptQuestion'), '첫 문제 수정 대본');
  assert.equal(h.run('draft[0].scriptQuestion'), '둘째 문제 원래 대본');
});

test('double button cue in manual mode does not complete narration immediately', () => {
  const h = harness({ speechFails: true });
  h.run('nextCue();nextCue()');
  assert.equal(h.state().waiting, true);
  assert.equal(h.state().phase, 'ready');
  h.advance(700); h.run('nextCue()');
  assert.equal(h.state().waiting, false);
  h.advance(700); h.run('nextCue();nextCue()');
  assert.equal(h.state().phase, 'question');
  assert.equal(h.state().waiting, true);
  assert.equal(h.state().deadline, null);
});

test('stop exactly at elapsed deadline still permits answer cue', () => {
  const h = harness();
  h.run('readQuestion(0)'); h.media.finish();
  h.run('deadline=Date.now();stopShow()');
  assert.equal(h.state().remaining, 0);
  h.run('nextCue()');
  assert.equal(h.state().phase, 'answer');
});

test('presenter Space advances once from another focused button and ignores editable inputs', () => {
  const h = harness();
  h.run("globalThis.prevented=0;keyboard({key:' ',target:{tagName:'BUTTON',id:'music'},preventDefault(){prevented++;}})");
  assert.equal(h.run('prevented'), 1);
  assert.equal(h.media.history.length, 1);
  assert.equal(h.state().busy, true);
  assert.equal(h.run('music'), false);
  h.run("keyboard({key:' ',target:{tagName:'BUTTON',id:'music'},preventDefault(){prevented++;}})");
  assert.equal(h.run('prevented'), 2);
  assert.equal(h.media.history.length, 1);
  h.media.finish(); h.advance(700);
  for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
    h.run(`keyboard({key:' ',target:{tagName:'${tagName}'},preventDefault(){prevented++;}})`);
  }
  h.run("keyboard({key:' ',target:{tagName:'DIV',isContentEditable:true},preventDefault(){prevented++;}})");
  assert.equal(h.run('prevented'), 2);
  assert.equal(h.media.history.length, 1);
  assert.equal(h.state().phase, 'ready');
});

test('closing without installed speech keeps completion cue enabled until manually finished', () => {
  const h = harness({ speechFails: true });
  h.run('closeShow()');
  assert.equal(h.state().phase, 'end');
  assert.equal(h.state().waiting, true);
  assert.equal(h.element('cue').disabled, false);
  h.click('cue');
  assert.equal(h.state().waiting, false);
  assert.equal(h.state().step, 'finished');
  assert.equal(h.element('cue').disabled, true);
});

function mediaHarness({ holdResume = false, playbackThrows = false } = {}) {
  let now = 10000;
  const cues = []; const states = []; const utterances = []; const sources = []; const resumers = [];
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    resume() {
      if (holdResume) return new Promise(resolve => resumers.push(() => { this.state = 'running'; resolve(); }));
      this.state = 'running'; return Promise.resolve();
    }
    createGain() { return { gain: { value: 1, setTargetAtTime() {} }, connect() {} }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, stop() { this.stopped = true; }, start() { if (playbackThrows) throw Error('device failed'); this.started = true; } };
      sources.push(source); return source;
    }
    async decodeAudioData() { return { duration: 1 }; }
    async close() { this.state = 'closed'; }
  }
  class Recognition {
    static async available() { return 'available'; }
    constructor() { this.processLocally = false; }
    start() { this.onstart?.(); } abort() {}
  }
  const synthesis = { getVoices: () => [{ localService: true, lang: 'ko-KR', voiceURI: 'local' }, { localService: false, lang: 'ko-KR', voiceURI: 'cloud' }],
    addEventListener() {}, removeEventListener() {}, cancel() {}, resume() {}, speak: item => utterances.push(item) };
  const window = { AudioContext, speechSynthesis: synthesis, SpeechRecognition: Recognition, SpeechSynthesisUtterance: function(text) { this.text = text; } };
  const context = vm.createContext({ window, SpeechSynthesisUtterance: window.SpeechSynthesisUtterance, performance: { now: () => now }, queueMicrotask() {}, setTimeout() {}, clearTimeout() {}, clearInterval() {}, setInterval() {} });
  vm.runInContext(mediaSource, context);
  const media = new window.QuizMedia({ onCue: text => cues.push(text), onMicState: state => states.push(state) });
  return { media, cues, states, utterances, sources, releaseAudio() { resumers.splice(0).forEach(resolve => resolve()); }, advance(ms) { now += ms; }, result(text) { media.recognition.onresult({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: text } }] }); } };
}

test('voice selector only exposes Korean local voices', () => {
  const h = mediaHarness();
  assert.equal(h.media.voices().length, 1);
  assert.equal(h.media.voices()[0].voiceURI, 'local');
});

test('voice cues debounce, reject negation, and stay suppressed during narration', async () => {
  const h = mediaHarness(); await h.media.startCueListening();
  h.result('큐'); h.result('큐'); assert.equal(h.cues.length, 1);
  h.advance(2000); h.result('아직 큐'); assert.equal(h.cues.length, 1);
  h.result('다음 문제 큐'); assert.equal(h.cues.length, 2);
  h.advance(2000); h.media.speak('준비된 대본', {}); h.result('큐'); assert.equal(h.cues.length, 2);
  h.utterances.at(-1).onend(); h.result('큐'); assert.equal(h.cues.length, 2);
  h.advance(1300); h.result('큐'); assert.equal(h.cues.length, 3);
});

test('cancelled speech callback cannot finish a replacement utterance', () => {
  const h = mediaHarness(); let count = 0;
  h.media.speak('첫 대본', { onEnd: () => count++ });
  const stale = h.utterances.at(-1).onend;
  h.media.speak('새 대본', { onEnd: () => count += 10 });
  stale(); assert.equal(count, 0);
  h.utterances.at(-1).onend(); assert.equal(count, 10);
});

test('recorded question waits for actual completion before starting its timer', async () => {
  const h = harness({ speechFails: true });
  await h.run('importAudioFiles([{name:"question-01.wav"}],true)');
  h.run('readQuestion(0)');
  assert.equal(h.media.current.recording, true);
  assert.equal(h.state().deadline, null);
  h.advance(4000);
  assert.equal(h.state().deadline, null);
  h.media.finish();
  assert.equal(h.state().deadline, 19000);
  assert.equal(h.state().busy, false);
});

test('cue audio import requires explicit matching confirmation or matching manifest text', async () => {
  const h = harness();
  await h.run('importAudioFiles([{name:"question-01.wav"}])');
  assert.equal(h.run('audioFiles.size'), 0);
  assert.match(h.element('audio-import-result').textContent, /확인란/);
  await h.run('importAudioFiles([{name:"question-01.wav"},{name:"cues.json",text:async()=>JSON.stringify(cueManifest())}])');
  assert.equal(h.run('audioFiles.size'), 1);
  assert.equal(h.run('audioFiles.get("question-01").text'), h.run('script("question")'));
});

test('stale manifest and unrecognized filenames are never attached to another cue', async () => {
  const h = harness();
  await h.run('importAudioFiles([{name:"question-01.wav"},{name:"cues.json",text:async()=>JSON.stringify({format:"ox-cue-audio-v1",cues:[{key:"question-01",text:"이전 대본"}]})}])');
  assert.equal(h.run('audioFiles.size'), 0);
  assert.match(h.element('audio-import-result').textContent, /현재 대본이 다릅니다/);
  await h.run('importAudioFiles([{name:"professor-reference.wav"},{name:"question-99.mp3"}],true)');
  assert.equal(h.run('audioFiles.size'), 0);
  assert.match(h.element('audio-import-result').textContent, /파일명 또는 문제 번호/);
});

test('changing hands invalidates recorded automatic script without silent TTS fallback', async () => {
  const h = harness();
  await h.run('importAudioFiles([{name:"question-01.wav"}],true)');
  h.run('left="X";readQuestion(0)');
  assert.equal(h.media.history.length, 0);
  assert.equal(h.state().waiting, true);
  assert.equal(h.state().deadline, null);
  assert.match(h.element('status').textContent, /대본이 변경/);
  h.click('pc-voice');
  assert.equal(h.media.history.length, 1);
  assert.equal(h.media.current.recording, undefined);
  h.media.finish();
  assert.notEqual(h.state().deadline, null);
});

test('recording decode failure remains visible and requires an explicit alternative', async () => {
  const h = harness({ loadFails: true });
  await h.run('importAudioFiles([{name:"question-01.wav"}],true)');
  assert.match(h.element('audio-list').textContent, /파일을 읽지 못/);
  h.run('readQuestion(0)');
  assert.equal(h.media.history.length, 0);
  assert.equal(h.state().waiting, true);
  assert.equal(h.state().deadline, null);
});

test('recording playback failure can retry or explicitly switch to PC voice', async () => {
  const h = harness({ audioFails: true });
  await h.run('importAudioFiles([{name:"question-01.wav"}],true)');
  h.run('readQuestion(0)');
  assert.equal(h.state().waiting, true);
  assert.equal(h.state().deadline, null);
  assert.equal(h.media.history.length, 1);
  h.click('repeat');
  assert.equal(h.media.history.length, 2);
  assert.equal(h.media.current.recording, true);
  h.click('pc-voice');
  assert.equal(h.media.current.recording, undefined);
  h.media.finish();
  assert.notEqual(h.state().deadline, null);
});

test('stopped recording completion cannot start timer after question selection', async () => {
  const h = harness();
  await h.run('importAudioFiles([{name:"question-01.wav"}],true)');
  h.run('readQuestion(0)');
  const stale = h.media.current.options.onEnd;
  h.run('stopShow();selectQuestion(1)');
  stale();
  assert.equal(h.state().index, 1);
  assert.equal(h.state().deadline, null);
  assert.equal(h.state().phase, 'ready');
});

test('clearing an in-flight import prevents a late decode from restoring the file', async () => {
  const h = harness(); let finishDecode;
  h.media.loadAudio = () => new Promise(resolve => { finishDecode = resolve; });
  const importing = h.run('importAudioFiles([{name:"question-01.wav"}],true)');
  assert.equal(h.run('audioFiles.size'), 1);
  h.click('audio-clear');
  finishDecode({duration: 1});
  await importing;
  assert.equal(h.run('audioFiles.size'), 0);
});

test('audio manifest follows current exact scripts and never persists audio buffers', async () => {
  const h = harness();
  h.run('settings.intro="맞춤 인사";questions[0].scriptQuestion="맞춤 문제";left="X"');
  const manifest = JSON.parse(h.run('JSON.stringify(cueManifest())'));
  assert.equal(manifest.format, 'ox-cue-audio-v1');
  assert.deepEqual(manifest.cues.map(c => c.key), ['intro','question-01','answer-01','question-02','answer-02','closing']);
  assert.equal(manifest.cues[0].text, '맞춤 인사');
  assert.equal(manifest.cues[1].text, '맞춤 문제');
  await h.run('importAudioFiles([{name:"answer-01.wav"}],true)');
  h.run('readQuestion(0);save()');
  assert.doesNotMatch(h.stage(), /answer-01|비공개 해설/);
  assert.doesNotMatch(h.savedData.get('ox-banquet-standalone-v1'), /answer-01.wav|audioFiles|duration/);
});

test('stop while audio activation is pending never starts a delayed recording', async () => {
  const h = mediaHarness({ holdResume: true }); let count = 0;
  const play = h.media.playAudio({duration: 1}, { onEnd: () => count++ });
  assert.equal(h.media.speaking, true);
  h.media.stopSpeech(); h.releaseAudio();
  await play;
  assert.equal(h.sources.length, 0);
  assert.equal(h.media.speaking, false);
  assert.equal(count, 0);
});

test('cancelled audio ended callback cannot complete its replacement and mic waits for echo tail', async () => {
  const h = mediaHarness(); let count = 0;
  await h.media.startCueListening();
  await h.media.playAudio({duration: 1}, { onEnd: () => count++ });
  const stale = h.sources[0].onended;
  h.advance(2000); h.result('큐'); assert.equal(h.cues.length, 0);
  await h.media.playAudio({duration: 1}, { onEnd: () => count += 10 });
  assert.equal(h.sources[0].stopped, true);
  stale(); assert.equal(count, 0);
  h.sources[1].onended();
  assert.equal(count, 10);
  h.result('큐'); assert.equal(h.cues.length, 0);
  h.advance(1300); h.result('큐'); assert.equal(h.cues.length, 1);
});

test('audio start error reports once without completing narration or leaving speaking active', async () => {
  const h = mediaHarness({ playbackThrows: true }); let ended = 0; let errors = 0;
  await h.media.playAudio({duration: 1}, { onEnd: () => ended++, onError: () => errors++ });
  assert.equal(ended, 0);
  assert.equal(errors, 1);
  assert.equal(h.media.speaking, false);
  assert.equal(h.sources[0].onended, null);
});
