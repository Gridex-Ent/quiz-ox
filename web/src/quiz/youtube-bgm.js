const DEFAULT_VIDEO = 'qZlu2j2SiBA';
const SCRIPT_ID = 'ox-youtube-iframe-api';
const API_URL = 'https://www.youtube.com/iframe_api';

// 공식 영상이 보이는 IFrame Player만 사용한다. 음원 추출·숨긴 재생은 하지 않는다.
// API: https://developers.google.com/youtube/iframe_api_reference
export function createYouTubeBgm({
  containerId,
  onStatus = () => {},
  onState = () => {},
  window: runtime = globalThis,
  document: doc = globalThis.document,
  setTimeout: schedule = globalThis.setTimeout,
  clearTimeout: cancel = globalThis.clearTimeout,
  timeoutMs = 8000,
} = {}) {
  let player = null, ready = false, playing = false, blocked = false, disposed = false;
  let error = '', videoId = '', playerState = -1, volume = 0.35;
  let preparing = null, finishPrepare = null, pendingPlay = null, waitingPlay = null;
  let setupGeneration = 0, playGeneration = 0, wantsPlayback = false;

  const snapshot = () => ({ ready, playing, error, blocked, videoId, playerState });
  function publish(message) {
    if (message) { try { onStatus(message); } catch { /* UI 알림 실패가 퀴즈를 멈추지 않는다. */ } }
    try { onState(snapshot()); } catch { /* UI 알림 실패가 퀴즈를 멈추지 않는다. */ }
  }
  function settlePlay(result) {
    if (!pendingPlay) return;
    const pending = pendingPlay; pendingPlay = null;
    cancel(pending.timer); pending.resolve(result);
  }
  function cancelWaitingPlay() {
    if (!waitingPlay) return;
    const pending = waitingPlay; waitingPlay = null; pending.resolve(false);
  }
  function pause() {
    playGeneration++; wantsPlayback = false; playing = false;
    cancelWaitingPlay(); settlePlay(false);
    try { player?.pauseVideo(); } catch { /* 네트워크/플레이어 실패와 퀴즈 진행을 분리한다. */ }
    publish(ready ? '공식 영상 일시정지' : '공식 영상 재생 대기');
  }
  function videoError(code) {
    const messages = {
      2: '공식 영상 ID를 확인해 주세요.',
      5: '이 브라우저에서 영상을 재생하지 못했습니다. YouTube에서 직접 확인해 주세요.',
      100: '공식 영상을 찾을 수 없거나 비공개 상태입니다.',
      101: '이 영상은 외부 화면 재생이 허용되지 않습니다. YouTube에서 직접 확인해 주세요.',
      150: '이 영상은 외부 화면 재생이 허용되지 않습니다. YouTube에서 직접 확인해 주세요.',
      153: 'YouTube가 재생 화면을 확인하지 못했습니다. 바탕화면 바로가기로 서버를 시작한 뒤 다시 시도해 주세요.',
    };
    return messages[code] || 'YouTube 재생 오류가 발생했습니다. 인터넷 연결을 확인하고 직접 재생을 눌러 주세요.';
  }
  function prepare() {
    if (disposed) return Promise.resolve(false);
    if (ready) return Promise.resolve(true);
    if (preparing) return preparing;
    if (!doc?.getElementById(containerId)) {
      error = '공식 영상을 표시할 화면이 없습니다.'; publish(error);
      return Promise.resolve(false);
    }
    const setup = ++setupGeneration;
    let resolveAttempt, settled = false, timer = null, frame = null, script = null, ownScript = false;
    let previousCallback, apiCallback;
    const attempt = new Promise(resolve => { resolveAttempt = resolve; });
    preparing = attempt; error = ''; blocked = false;
    function cleanupCallback() {
      if (apiCallback && runtime.onYouTubeIframeAPIReady === apiCallback) {
        if (previousCallback === undefined) delete runtime.onYouTubeIframeAPIReady;
        else runtime.onYouTubeIframeAPIReady = previousCallback;
      }
      script?.removeEventListener('error', scriptError);
    }
    function complete(ok, message) {
      if (settled) return;
      settled = true; cancel(timer); cleanupCallback();
      if (preparing === attempt) preparing = null;
      finishPrepare = null;
      if (!ok) {
        setupGeneration++; ready = false; playing = false; wantsPlayback = false;
        error = message || '공식 영상을 준비하지 못했습니다. 인터넷 연결을 확인해 주세요.';
        cancelWaitingPlay(); settlePlay(false);
        try { player?.destroy(); } catch { /* 실패한 플레이어만 정리한다. */ }
        player = null; frame?.remove();
        if (ownScript) script?.remove();
      }
      publish(message); resolveAttempt(ok);
    }
    finishPrepare = complete;
    function scriptError() { complete(false, 'YouTube에 연결하지 못했습니다. 인터넷 연결을 확인하고 소리 켜기를 다시 눌러 주세요.'); }
    function active() { return !disposed && setup === setupGeneration; }
    function createPlayer() {
      if (!active() || settled || frame || !runtime.YT?.Player) return;
      try {
        const origin = /^https?:$/.test(runtime.location?.protocol || '') && /^https?:\/\//.test(runtime.location?.origin || '') ? runtime.location.origin : '';
        const params = { enablejsapi: 1, autoplay: 0, controls: 1, playsinline: 1, ...(origin ? { origin } : {}) };
        const query = Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
        frame = doc.createElement('iframe');
        frame.id = `${containerId}-frame`; frame.width = '300'; frame.height = '200';
        frame.title = 'RESCENE Pretty Girl 공식 영상';
        frame.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture; fullscreen');
        frame.setAttribute('allowfullscreen', '');
        frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        frame.style.width = '100%'; frame.style.maxWidth = '300px'; frame.style.height = '200px'; frame.style.minWidth = '200px'; frame.style.minHeight = '200px'; frame.style.border = '0';
        frame.src = `https://www.youtube.com/embed/${DEFAULT_VIDEO}?${query}`;
        doc.getElementById(containerId).replaceChildren(frame);
        player = new runtime.YT.Player(frame, {
          events: {
            onReady(event) {
              if (!active()) { try { event.target.destroy(); } catch { /* 취소된 초기화다. */ } return; }
              player = event.target; ready = true;
              try { player.setVolume(Math.round(volume * 100)); } catch { /* 재생 시 다시 적용한다. */ }
              complete(true, '공식 영상 준비 완료 · 인터넷 연결 필요');
            },
            onStateChange(event) {
              if (!active()) return;
              playerState = event.data;
              if (event.data === 1 && !wantsPlayback) {
                playing = false;
                try { event.target.pauseVideo(); } catch { /* 취소 뒤 늦게 도착한 재생을 멈춘다. */ }
                publish(); return;
              }
              playing = event.data === 1;
              if (playing) { blocked = false; error = ''; settlePlay(true); publish('공식 영상 재생 중'); }
              else if (event.data === 0) { wantsPlayback = false; settlePlay(false); publish('공식 영상 재생 종료'); }
              else if (event.data === 2) publish('공식 영상 일시정지');
              else publish(event.data === 3 ? '공식 영상 불러오는 중' : undefined);
            },
            onAutoplayBlocked() {
              if (!active()) return;
              blocked = true; playing = false;
              error = '자동 재생이 차단되었습니다. 공식 영상의 재생 버튼 또는 직접 재생을 눌러 주세요.';
              settlePlay(false); publish(error);
            },
            onError(event) {
              if (!active()) return;
              blocked = [101, 150, 153].includes(event.data); playing = false; wantsPlayback = false;
              error = videoError(event.data);
              if (!ready) complete(false, error);
              else { settlePlay(false); publish(error); }
            },
          },
        });
      } catch { complete(false, '공식 영상 플레이어를 준비하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
    }
    timer = schedule(() => complete(false, '공식 영상 준비 시간이 초과되었습니다. 인터넷 연결을 확인하고 소리 켜기를 다시 눌러 주세요.'), timeoutMs);
    publish('공식 영상 준비 중 · 인터넷 연결 필요');
    if (runtime.YT?.Player) createPlayer();
    else {
      previousCallback = runtime.onYouTubeIframeAPIReady;
      apiCallback = () => {
        try { previousCallback?.(); } catch { /* 다른 API 사용자의 콜백을 보존한다. */ }
        createPlayer();
      };
      runtime.onYouTubeIframeAPIReady = apiCallback;
      try {
        script = doc.getElementById(SCRIPT_ID);
        if (!script) {
          ownScript = true; script = doc.createElement('script'); script.id = SCRIPT_ID; script.src = API_URL; script.async = true;
        }
        script.addEventListener('error', scriptError, { once: true });
        if (ownScript) doc.head.appendChild(script);
      } catch { complete(false, 'YouTube에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.'); }
    }
    return attempt;
  }
  async function play(id) {
    if (disposed) return false;
    if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{11}$/.test(id)) {
      error = '공식 영상 ID를 확인해 주세요.'; publish(error); return false;
    }
    const request = ++playGeneration;
    cancelWaitingPlay(); settlePlay(false); videoId = id; wantsPlayback = true; blocked = false; error = '';
    if (!ready) {
      if (!preparing) {
        wantsPlayback = false; error = '소리 켜기를 눌러 공식 영상을 먼저 준비해 주세요.'; publish(error); return false;
      }
      const available = await new Promise(resolve => {
        const pending = { resolve }; waitingPlay = pending;
        preparing.then(ok => { if (waitingPlay === pending) waitingPlay = null; resolve(ok); });
      });
      if (!available || disposed || request !== playGeneration) return false;
    }
    if (disposed || request !== playGeneration || !player || !wantsPlayback) return false;
    publish('공식 영상 재생 요청 중');
    return new Promise(resolve => {
      const timer = schedule(() => {
        if (request !== playGeneration) return;
        playing = false; error = '공식 영상 재생을 확인하지 못했습니다. 인터넷 연결을 확인하고 직접 재생을 눌러 주세요.';
        settlePlay(false); publish(error);
      }, timeoutMs);
      pendingPlay = { timer, resolve };
      try {
        player.setVolume(Math.round(volume * 100));
        player.unMute();
        player.loadVideoById({ videoId: id, startSeconds: 0 });
      } catch {
        playing = false; wantsPlayback = false; error = '공식 영상을 재생하지 못했습니다. 직접 재생을 눌러 주세요.';
        settlePlay(false); publish(error);
      }
    });
  }
  function setVolume(value) {
    const number = Number(value); if (!Number.isFinite(number)) return;
    volume = Math.max(0, Math.min(1, number));
    try { if (ready) player?.setVolume(Math.round(volume * 100)); } catch { /* 소리 조절 실패가 퀴즈를 멈추지 않는다. */ }
  }
  function dispose() {
    if (disposed) return;
    pause(); disposed = true;
    finishPrepare?.(false, '공식 영상 연결을 종료했습니다.');
    setupGeneration++;
    try { player?.destroy(); } catch { /* 종료된 플레이어도 안전하게 정리한다. */ }
    player = null; ready = false; playing = false; publish();
  }
  return { prepare, play, pause, setVolume, dispose, get state() { return snapshot(); } };
}
