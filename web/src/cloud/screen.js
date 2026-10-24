import { renderQuizStage } from '../quiz/presentation.js';
import { PRIZE_TIERS } from '../quiz/prize-tiers.js';
import { createQuizSound } from '../quiz/sound.js';
import { createYouTubeBgm } from '../quiz/youtube-bgm.js';

const $ = id => document.getElementById(id);
const prizeImage = JSON.parse($('prize-data').textContent);
const KEY = 'ox-manual-cloud-screen-key';
let screenKey = new URLSearchParams(location.hash.slice(1)).get('key') || '';
try { if (screenKey) sessionStorage.setItem(KEY, screenKey); else screenKey = sessionStorage.getItem(KEY) || ''; } catch { /* 저장 제한 시 현재 창에서 연결한다. */ }
if (location.hash) history.replaceState(null, '', location.pathname + location.search);
let revision = -1, view = null, audio = { muted: false, music: true, volume: 0.35 }, offset = 0, timer = null, lastHtml = '', lastRenderToken = '';
let alive = true, audioUnlocked = false, lastSecond = null, lastCue = '', wantedMusic = null, connected = false;
const sound = createQuizSound();
const youtube = createYouTubeBgm({ containerId: 'youtube-player', onStatus: text => { $('youtube-status').textContent = text; }, onState: state => { if (wantedMusic) sound.setMusic(audio.music && (state.error || state.blocked)); } });
const seconds = current => current.deadline === null ? current.remaining : Math.max(0, Math.ceil((current.deadline - (Date.now() + offset)) / 1000));

function status(text, isConnected = false) {
  connected = isConnected;
  $('cloud-screen-status').textContent = text;
  $('screen-tools').className = `screen-tools ${isConnected ? 'connected' : 'disconnected'}`;
}
function questionMusic() { return view?.music?.youtubeId || view?.question?.musicYoutubeId || null; }
function render() {
  if (!view) return;
  const renderToken = `${revision}:${view.phase}:${view.phase === 'question' ? seconds(view) : ''}`;
  if (renderToken !== lastRenderToken) {
    const html = renderQuizStage({ ...view, serverNow: Date.now() + offset }, { prizeImage, tiers: PRIZE_TIERS });
    if (html !== lastHtml) { $('stage').innerHTML = html; lastHtml = html; }
    lastRenderToken = renderToken;
  }
  const enabled = audioUnlocked && !audio.muted && !view.blank;
  sound.setVolume(enabled ? audio.volume : 0);
  youtube.setVolume(audio.volume);
  const music = enabled && audio.music && ['topic', 'question'].includes(view.phase) ? questionMusic() : null;
  $('youtube-panel').hidden = !audioUnlocked || audio.muted || !audio.music || !questionMusic() || !['topic', 'question'].includes(view.phase) || view.blank;
  document.body.classList.toggle('with-youtube', !$('youtube-panel').hidden);
  if (music !== wantedMusic) {
    wantedMusic = music;
    if (music) { sound.setMusic(false); youtube.play(music).then(playing => { if (!playing && wantedMusic === music) sound.setMusic(audio.music); }); }
    else { youtube.pause(); sound.setMusic(enabled && audio.music); }
  } else if (!music) sound.setMusic(enabled && audio.music);
  const cue = `${view.mode}:${view.index}:${view.phase}`;
  if (cue !== lastCue) {
    if (enabled && ['topic', 'question', 'answer'].includes(view.phase)) sound.cue(view.phase);
    lastCue = cue; lastSecond = view.phase === 'question' ? seconds(view) : null;
  } else if (view.phase === 'question') {
    const remaining = seconds(view);
    if (remaining !== lastSecond) {
      if (enabled && remaining === 0 && lastSecond !== null && lastSecond > 0) sound.cue('finish');
      else if (enabled && remaining > 0 && view.deadline !== null) sound.tick(remaining);
      lastSecond = remaining;
    }
  }
  $('screen-audio-enable').textContent = audioUnlocked ? '스크린 소리 끄기' : '스크린 소리 켜기';
}

async function poll() {
  if (!alive || !screenKey) return;
  const started = Date.now(), abort = new AbortController();
  const timeout = setTimeout(() => abort.abort(), 7000);
  try {
    const response = await fetch(`/api/screen/state?revision=${revision}`, { headers: { 'X-Screen-Key': screenKey }, cache: 'no-store', signal: abort.signal });
    if (response.status === 401 || response.status === 403) { screenKey = ''; $('screen-key-panel').hidden = false; $('screen-key-status').textContent = '스크린 키를 확인해 주세요.'; status('스크린 인증 필요'); return; }
    if (response.status !== 304) {
      const data = await response.json();
      if (!response.ok || !data.view || !Number.isInteger(data.revision) || !Number.isFinite(data.serverNow)) throw Error('스크린 상태를 읽지 못했습니다.');
      if (data.revision >= revision) { revision = data.revision; view = data.view; audio = data.audio || audio; offset = data.serverNow - (started + Date.now()) / 2; render(); }
    }
    status(audioUnlocked ? audio.muted ? '연결됨 · 진행실에서 음향 꺼짐' : '연결됨 · 스크린 음향 켜짐' : '연결됨 · 소리는 이 화면에서 켜 주세요', true);
  } catch { status('연결 끊김 · 현재 화면을 유지하며 다시 연결 중'); }
  finally { clearTimeout(timeout); if (alive && screenKey) timer = setTimeout(() => void poll(), 350); }
}

$('screen-key-form').onsubmit = event => {
  event.preventDefault(); screenKey = $('screen-key').value.trim(); if (!screenKey) return;
  try { sessionStorage.setItem(KEY, screenKey); } catch { /* 현재 창 연결은 유지한다. */ }
  $('screen-key').value = ''; $('screen-key-panel').hidden = true; revision = -1; void poll();
};
$('screen-audio-enable').onclick = async () => {
  if (audioUnlocked) { audioUnlocked = false; sound.disable(); youtube.pause(); wantedMusic = null; }
  else if (await sound.enable()) { audioUnlocked = true; void youtube.prepare(); }
  render(); status(connected ? audioUnlocked ? '연결됨 · 스크린 음향 켜짐' : '연결됨 · 소리 꺼짐' : '재연결 중', connected);
};
$('youtube-play').onclick = async () => { if (!audioUnlocked && !await sound.enable()) return; audioUnlocked = true; void youtube.prepare(); wantedMusic = null; render(); };
$('screen-fullscreen').onclick = () => document.documentElement.requestFullscreen().catch(() => status('브라우저의 전체화면 기능을 사용해 주세요.', connected));
let frame = setInterval(render, 100);
window.addEventListener('pagehide', () => { alive = false; clearTimeout(timer); clearInterval(frame); youtube.pause(); sound.disable(); });
window.addEventListener('pageshow', () => { if (alive) return; alive = true; audioUnlocked = false; wantedMusic = null; frame = setInterval(render, 100); if (screenKey) void poll(); });
if (screenKey) void poll(); else { $('screen-key-panel').hidden = false; status('스크린 링크 또는 키 필요'); }
