/* Offline media for the administrator window. User-selected audio and local voices; no network requests. */
(function () {
  'use strict';
  const bounded = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  class QuizMedia {
    constructor(callbacks = {}) {
      this.callbacks = callbacks;
      this.context = null; this.master = null; this.musicGain = null;
      this.volume = 0.65; this.ducking = false; this.speaking = false;
      this.musicTimer = null; this.musicStep = 0; this.musicAt = 0; this.nodes = new Set();
      this.speechToken = 0; this.utterance = null; this.recording = null; this.disposed = false;
      this.micToken = 0; this.micWanted = false; this.recognition = null;
      this.micRetryTimer = null; this.micRetries = 0; this.lastCueAt = -Infinity; this.suppressUntil = 0;
      this.synthesis = window.speechSynthesis;
      this.voiceChanged = () => this.emit('onVoices', this.voices());
      this.synthesis?.addEventListener('voiceschanged', this.voiceChanged);
      queueMicrotask(() => { if (!this.disposed) this.voiceChanged(); });
    }
    emit(name, ...args) { if (!this.disposed) this.callbacks[name]?.(...args); }
    status(message) { this.emit('onStatus', message); }
    voices() { return this.synthesis ? this.synthesis.getVoices().filter(voice => voice.localService === true && /^ko(?:[-_]|$)/i.test(voice.lang)) : []; }
    async unlock() {
      if (this.disposed) return false;
      try {
        if (!this.context) {
          const Audio = window.AudioContext || window.webkitAudioContext;
          if (!Audio) throw Error('오디오 미지원');
          this.context = new Audio();
          this.master = this.context.createGain(); this.master.gain.value = this.volume;
          this.musicGain = this.context.createGain(); this.musicGain.gain.value = this.ducking || this.speaking ? 0.12 : 0.55;
          this.musicGain.connect(this.master); this.master.connect(this.context.destination);
        }
        await this.context.resume();
        if (this.disposed) return false;
        if (this.context.state !== 'running') throw Error('오디오 시작 대기');
        return true;
      } catch { this.status('소리를 시작하지 못했습니다. 소리 켜기 버튼을 다시 눌러 주세요.'); return false; }
    }
    setVolume(value) {
      this.volume = bounded(value, 0, 1, 0.65);
      if (this.master && this.context?.state !== 'closed') this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.03);
    }
    setDucking(value) { this.ducking = !!value; this.updateMusicGain(); }
    updateMusicGain() {
      if (this.musicGain && this.context?.state !== 'closed') this.musicGain.gain.setTargetAtTime(this.ducking || this.speaking ? 0.12 : 0.55, this.context.currentTime, 0.08);
    }
    speakingState(value) { this.speaking = value; this.updateMusicGain(); this.emit('onSpeaking', value); }
    stopSpeech() {
      this.speechToken += 1;
      if (this.utterance) { this.utterance.onend = null; this.utterance.onerror = null; this.utterance.onstart = null; }
      this.utterance = null;
      if (this.recording) {
        this.recording.onended = null;
        try { this.recording.stop(); } catch { /* already ended */ }
        this.recording.disconnect(); this.recording = null;
      }
      this.synthesis?.cancel();
      this.suppressUntil = performance.now() + 1200;
      this.speakingState(false);
    }
    async loadAudio(file) {
      if (!await this.unlock()) throw Error('소리를 시작하지 못했습니다. 파일 불러오기를 다시 눌러 주세요.');
      const buffer = await this.context.decodeAudioData(await file.arrayBuffer());
      if (this.disposed) throw Error('창을 닫아 음성 불러오기를 중단했습니다.');
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw Error('재생할 음성이 없습니다.');
      return buffer;
    }
    async playAudio(buffer, options = {}) {
      this.stopSpeech();
      if (this.disposed) return false;
      const token = this.speechToken;
      const valid = () => !this.disposed && token === this.speechToken;
      // Pending browser audio activation also counts as narration for cue suppression.
      this.speakingState(true);
      let source = null;
      try {
        const unlocked = await this.unlock();
        if (!valid()) return false;
        if (!unlocked) throw Error('오디오 시작이 허용되지 않았습니다.');
        source = this.context.createBufferSource(); source.buffer = buffer;
        source.connect(this.master); this.recording = source;
        source.onended = () => {
          if (!valid() || this.recording !== source) return;
          this.recording = null; source.disconnect();
          this.suppressUntil = performance.now() + 1200;
          this.speakingState(false); options.onEnd?.();
        };
        source.start(); return true;
      } catch {
        if (!valid()) return false;
        if (source) { source.onended = null; source.disconnect(); }
        this.recording = null; this.suppressUntil = performance.now() + 1200; this.speakingState(false);
        const message = '녹음 음성을 재생하지 못했습니다. 현재 대본 다시 읽기로 재시도하거나 PC 음성으로 읽기를 선택하세요.';
        this.status(message); options.onError?.(message); return false;
      }
    }
    speak(text, options = {}) {
      this.stopSpeech();
      if (this.disposed) return false;
      const message = String(text || '').trim();
      const voices = this.voices();
      const voice = options.voiceURI ? voices.find(item => item.voiceURI === options.voiceURI) : voices[0];
      const fail = reason => { this.status(reason); options.onError?.(reason); return false; };
      if (!message) return fail('읽을 대사가 없습니다.');
      if (!voice || !this.synthesis || !window.SpeechSynthesisUtterance) return fail('설치된 한국어 오프라인 음성을 찾지 못했습니다. 음성을 선택하거나 화면의 대본을 직접 읽어 주세요.');
      const token = this.speechToken;
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.voice = voice; utterance.lang = voice.lang;
      utterance.rate = bounded(options.rate, 0.5, 1.5, 1);
      utterance.volume = bounded(options.volume, 0, 1, this.volume);
      this.utterance = utterance;
      // Suppress mic cues while queued, too: a delayed start must not double-advance.
      this.speakingState(true);
      const finish = error => {
        if (this.disposed || token !== this.speechToken || this.utterance !== utterance) return;
        this.utterance = null; this.suppressUntil = performance.now() + 1200;
        this.speakingState(false);
        if (error) { const reason = '대사 읽기가 중단되었습니다. 대본을 다시 누르거나 직접 진행해 주세요.'; this.status(reason); options.onError?.(reason); }
        else options.onEnd?.();
      };
      utterance.onend = () => finish(false);
      utterance.onerror = () => finish(true);
      try { this.synthesis.resume(); this.synthesis.speak(utterance); return true; }
      catch { finish(true); return false; }
    }
    tone(frequency, duration, delay = 0, gain = 0.07, type = 'sine', music = false) {
      const ctx = this.context;
      if (this.disposed || !ctx || ctx.state !== 'running') return;
      const oscillator = ctx.createOscillator(), envelope = ctx.createGain();
      const start = ctx.currentTime + Math.max(0, delay);
      oscillator.type = type; oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), start + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(envelope); envelope.connect(music ? this.musicGain : this.master);
      const node = { oscillator, envelope, music }; this.nodes.add(node);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.nodes.delete(node); };
      oscillator.start(start); oscillator.stop(start + duration + 0.03);
    }
    effect(name) {
      if (!this.context || this.context.state !== 'running') return false;
      if (name === 'tick') this.tone(1200, 0.09, 0, 0.055, 'triangle');
      else if (name === 'timeup') { this.tone(660, 0.45, 0, 0.09, 'triangle'); this.tone(880, 0.55, 0.05, 0.06); }
      else if (name === 'correct') [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.24, i * 0.10, 0.07, 'triangle'));
      else if (name === 'fanfare') [523, 523, 523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.28, i * 0.15, 0.065, 'triangle'));
      else if (name === 'question') [392, 523, 659].forEach((f, i) => this.tone(f, 0.20, i * 0.09, 0.065));
      else return false;
      return true;
    }
    startMusic() {
      if (this.disposed || this.context?.state !== 'running') { this.status('배경음악을 재생하려면 먼저 소리를 켜 주세요.'); return false; }
      if (this.musicTimer !== null) return true;
      this.musicAt = this.context.currentTime + 0.03; this.musicStep = 0;
      const notes = [261.63, 329.63, 392, 329.63, 220, 261.63, 329.63, 261.63, 174.61, 220, 261.63, 220, 196, 246.94, 293.66, 246.94];
      const schedule = () => {
        const ctx = this.context;
        if (!ctx || ctx.state !== 'running') return;
        if (this.musicAt < ctx.currentTime) this.musicAt = ctx.currentTime + 0.03;
        while (this.musicAt < ctx.currentTime + 0.65) {
          const delay = this.musicAt - ctx.currentTime;
          const note = notes[this.musicStep % notes.length];
          this.tone(note, 0.68, delay, 0.045, 'sine', true);
          if (this.musicStep % 4 === 0) this.tone(note / 2, 1.75, delay, 0.04, 'sine', true);
          this.musicStep += 1; this.musicAt += 0.5;
        }
      };
      schedule(); this.musicTimer = setInterval(schedule, 200); return true;
    }
    stopMusic() {
      clearInterval(this.musicTimer); this.musicTimer = null;
      for (const node of this.nodes) if (node.music) { try { node.oscillator.stop(); } catch { /* already ended */ } }
    }
    micState(state, message) { this.emit('onMicState', state); if (message) this.status(message); }
    stopCueListening() {
      this.micToken += 1; this.micWanted = false;
      clearTimeout(this.micRetryTimer); this.micRetryTimer = null;
      const recognition = this.recognition; this.recognition = null;
      if (recognition) { recognition.onend = null; recognition.onerror = null; recognition.onresult = null; recognition.onstart = null; try { recognition.abort(); } catch { /* not started */ } }
      this.micState('off');
    }
    async startCueListening() {
      this.stopCueListening();
      if (this.disposed) return false;
      const token = this.micToken;
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const unavailable = () => { this.micState('unavailable', '이 브라우저에서 한국어 오프라인 큐 인식을 사용할 수 없습니다. 다음 버튼 또는 프레젠터를 사용해 주세요.'); return false; };
      if (!Recognition || typeof Recognition.available !== 'function') return unavailable();
      let recognition;
      try {
        recognition = new Recognition();
        if (!('processLocally' in recognition)) return unavailable();
        recognition.processLocally = true;
        if (recognition.processLocally !== true) return unavailable();
        this.micState('starting', '설치된 한국어 오프라인 음성 인식을 확인합니다.');
        const available = await Recognition.available({ langs: ['ko-KR'], processLocally: true });
        if (this.disposed || token !== this.micToken) return false;
        if (available !== 'available') return unavailable();
      } catch { if (this.disposed || token !== this.micToken) return false; return unavailable(); }
      this.recognition = recognition; this.micWanted = true; this.micRetries = 0;
      recognition.lang = 'ko-KR'; recognition.continuous = true; recognition.interimResults = false; recognition.maxAlternatives = 1;
      const valid = () => !this.disposed && this.micWanted && token === this.micToken && this.recognition === recognition;
      const fail = message => { if (valid()) { this.stopCueListening(); this.micState('error', message); } };
      let startedAt = 0;
      const start = () => { if (!valid()) return; try { recognition.start(); } catch { fail('마이크를 시작하지 못했습니다. 권한과 다른 앱의 마이크 사용을 확인해 주세요.'); } };
      recognition.onstart = () => { if (valid()) { startedAt = performance.now(); this.micState('listening', '오프라인 큐 인식 중 · “큐”라고 말하면 다음 진행 신호를 보냅니다.'); } };
      recognition.onresult = event => {
        if (!valid()) return;
        this.micRetries = 0;
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]; if (!result.isFinal) continue;
          const text = String(result[0]?.transcript || '').normalize('NFKC').trim();
          const now = performance.now();
          if (this.speaking || now < this.suppressUntil || now - this.lastCueAt < 1800) continue;
          const compact = text.replace(/[\s\p{P}\p{S}]/gu, '');
          const cue = /(?:^|[\s.!?。！？…])큐[\s.!?。！？…]*$/u.test(text) || /(?:문제나갑니다|자기소개|상품소개|다음문제|시작)큐$/u.test(compact);
          if (!cue || /하지마|하지말|말하지|아직|취소|예를들|예시|라고|말하면|신호는/u.test(compact)) continue;
          this.lastCueAt = now; this.emit('onCue', text);
        }
      };
      recognition.onerror = event => {
        if (!valid()) return;
        if (event.error === 'no-speech') return;
        fail(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? '마이크 접근이 허용되지 않았습니다. 다음 버튼 또는 프레젠터로 진행해 주세요.' : `오프라인 큐 인식을 멈췄습니다 (${event.error || '인식 오류'}). 다음 버튼 또는 프레젠터로 진행해 주세요.`);
      };
      recognition.onend = () => {
        if (!valid()) return;
        if (performance.now() - startedAt > 15000) this.micRetries = 0;
        this.micRetries += 1;
        if (this.micRetries > 3) { fail('마이크 인식이 반복해서 종료되어 멈췄습니다. 버튼으로 진행하거나 마이크를 다시 켜 주세요.'); return; }
        this.micState('starting');
        this.micRetryTimer = setTimeout(start, 350 * this.micRetries);
      };
      start(); return valid();
    }
    dispose() {
      if (this.disposed) return;
      this.stopCueListening(); this.stopSpeech(); this.stopMusic();
      this.synthesis?.removeEventListener('voiceschanged', this.voiceChanged);
      this.disposed = true;
      for (const node of this.nodes) { try { node.oscillator.stop(); } catch { /* already ended */ } }
      this.nodes.clear();
      if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
    }
  }
  window.QuizMedia = QuizMedia;
}());
