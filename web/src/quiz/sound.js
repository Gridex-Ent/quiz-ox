// 외부 음원·낭독 없이 행사 배경음과 효과음을 합성한다. 활성화한 스크린에서 재생한다.
export function createQuizSound({
  AudioContext: Context = globalThis.AudioContext || globalThis.webkitAudioContext,
  setInterval: startInterval = globalThis.setInterval,
  clearInterval: stopInterval = globalThis.clearInterval,
} = {}) {
  let context = null, master = null, enabled = false, music = true, volume = 0.35;
  let loop = null, nextBeat = 0, beat = 0, lastTick = null, error = '', closed = false;
  let generation = 0, pending = null;
  const voices = new Set();
  const supported = typeof Context === 'function';

  function stopVoices(group) {
    for (const voice of [...voices]) {
      if (group && voice.group !== group) continue;
      voices.delete(voice);
      voice.osc.onended = null;
      try { voice.osc.stop(); } catch { /* 이미 종료된 음도 안전하게 정리한다. */ }
      voice.osc.disconnect(); voice.gain.disconnect();
    }
  }
  function stopLoop() {
    if (loop !== null) stopInterval(loop);
    loop = null;
    stopVoices('music');
  }
  function note(frequency, start, duration, amplitude = 0.18, type = 'sine', group = 'effect', endFrequency = frequency) {
    if (!enabled || !context || context.state !== 'running') return;
    const osc = context.createOscillator(), gain = context.createGain();
    const voice = { osc, gain, group };
    voices.add(voice);
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (endFrequency !== frequency) osc.frequency.linearRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(amplitude, start + Math.min(0.012, duration / 4));
    gain.gain.linearRampToValueAtTime(0, start + duration);
    osc.connect(gain); gain.connect(master);
    osc.onended = () => { voices.delete(voice); osc.disconnect(); gain.disconnect(); };
    osc.start(start); osc.stop(start + duration + 0.025);
  }
  function scheduleMusic() {
    if (!enabled || !music || !context || context.state !== 'running') return;
    // 독자적인 짧은 펜타토닉 패턴. 한 번에 0.25초 앞까지만 예약해 정지가 즉시 반영된다.
    const melody = [523.25, 659.25, 783.99, 880, 783.99, 659.25, 587.33, 659.25];
    if (nextBeat < context.currentTime) nextBeat = context.currentTime + 0.025;
    while (nextBeat < context.currentTime + 0.25) {
      note(melody[beat % melody.length], nextBeat, 0.42, 0.055, 'triangle', 'music');
      if (beat % 4 === 0) note(beat % 8 === 0 ? 130.81 : 174.61, nextBeat, 0.52, 0.075, 'sine', 'music');
      beat++; nextBeat += 0.6;
    }
  }
  function startLoop() {
    if (!enabled || !music || loop !== null) return;
    nextBeat = context.currentTime + 0.025; beat = 0;
    scheduleMusic();
    loop = startInterval(scheduleMusic, 100);
  }
  function disable() {
    generation++; enabled = false; lastTick = null; pending = null;
    stopLoop(); stopVoices();
    const old = context;
    context = null; master = null;
    if (old && old.state !== 'closed') {
      try { Promise.resolve(old.close()).catch(() => {}); } catch { /* 종료 실패가 퀴즈 진행을 막지 않는다. */ }
    }
  }
  async function enable() {
    if (closed) { error = '음향이 종료되었습니다. 화면을 다시 열어 주세요.'; return false; }
    if (!supported) { error = '이 브라우저는 음향을 지원하지 않습니다.'; return false; }
    if (enabled && context?.state === 'running') return true;
    if (pending) return pending;
    if (context) disable();
    const token = generation;
    const attempt = (async () => {
      try {
        context = new Context();
        const target = context;
        master = target.createGain();
        master.gain.setValueAtTime(volume, target.currentTime);
        master.connect(target.destination);
        // enable은 반드시 사용자의 '소리 켜기' 클릭에서 호출한다.
        if (target.state !== 'running') await target.resume();
        if (token !== generation || target !== context || closed) return false;
        if (target.state !== 'running') throw Error('not running');
        enabled = true; error = ''; lastTick = null; startLoop();
        return true;
      } catch {
        if (token === generation) {
          disable();
          error = '소리를 시작하지 못했습니다. 소리 켜기를 다시 눌러 주세요.';
        }
        return false;
      }
    })();
    pending = attempt;
    const result = await attempt;
    if (pending === attempt) pending = null;
    return result;
  }
  function setMusic(value) {
    music = Boolean(value);
    if (music) startLoop(); else stopLoop();
  }
  function setVolume(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    volume = Math.max(0, Math.min(1, number));
    if (context && master) {
      const now = context.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(volume, now + 0.025);
    }
  }
  function finish() {
    const now = context.currentTime + 0.008;
    note(659.25, now, 0.24, 0.16, 'triangle');
    note(523.25, now + 0.23, 0.6, 0.2, 'triangle');
    note(261.63, now + 0.23, 0.65, 0.14);
  }
  function cue(name) {
    if (!enabled || !context || context.state !== 'running') return false;
    const now = context.currentTime + 0.008;
    switch (name) {
      case 'topic': note(330, now, 0.25, 0.12, 'sine', 'effect', 660); break;
      case 'question':
        lastTick = null;
        stopVoices('effect');
        note(392, now, 0.12, 0.18, 'triangle');
        note(523.25, now + 0.13, 0.12, 0.18, 'triangle');
        for (const f of [523.25, 659.25, 783.99]) note(f, now + 0.27, 0.35, 0.14, 'triangle');
        break;
      case 'answer':
        stopVoices('effect');
        for (const [i, f] of [523.25, 659.25, 783.99].entries()) note(f, now + i * 0.09, 0.32, 0.15, 'triangle');
        break;
      case 'finish': finish(); break;
      default: return false;
    }
    return true;
  }
  function tick(seconds) {
    if (!enabled || !context || context.state !== 'running' || !Number.isInteger(seconds) || seconds < 0 || seconds > 600 || seconds === lastTick) return false;
    lastTick = seconds;
    if (seconds === 0) finish();
    else {
      const now = context.currentTime + 0.008;
      // 짧은 삼각파의 하강음을 매초 번갈아 내어 시계의 '똑/딱'을 표현한다.
      // 마지막 초에도 여러 음을 몰아 예약하지 않아 일시정지/재연결 때 잔향이 쌓이지 않는다.
      const frequency = seconds % 2 === 0 ? 1500 : 1100;
      note(frequency, now, 0.045, 0.26, 'triangle', 'effect', frequency * 0.42);
    }
    return true;
  }
  return {
    enable, disable, setMusic, setVolume, cue, tick,
    close() { disable(); closed = true; },
    get state() { return { supported, enabled, music, volume, error, closed }; },
  };
}
