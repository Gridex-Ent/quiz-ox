import test from 'node:test';
import assert from 'node:assert/strict';
import { createYouTubeBgm } from '../web/src/quiz/youtube-bgm.js';

const VIDEO = 'qZlu2j2SiBA';
function harness({ apiReady = false, protocol = 'http:', previousCallback } = {}) {
  const nodes = [], players = [], statuses = [], states = [], timers = new Map(); let timerId = 0;
  class Node {
    constructor(tag) { this.tagName = tag; this.style = {}; this.attributes = {}; this.listeners = new Map(); this.children = []; nodes.push(this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, value) { this.listeners.set(key, value); }
    removeEventListener(key, value) { if (this.listeners.get(key) === value) this.listeners.delete(key); }
    appendChild(node) { node.parent = this; this.children.push(node); }
    replaceChildren(...children) { for (const child of [...this.children]) child.remove(); for (const child of children) this.appendChild(child); }
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); this.parent = null; }
  }
  const head = new Node('head'), container = new Node('div'); container.id = 'youtube-player';
  const doc = { head, createElement: tag => new Node(tag), getElementById: id => nodes.find(node => node.id === id && (node.parent || node === container)) };
  const runtime = { location: { protocol, origin: protocol === 'http:' ? 'http://127.0.0.1:4179' : 'null' }, onYouTubeIframeAPIReady: previousCallback };
  class Player {
    constructor(frame, options) { this.frame = frame; this.options = options; this.loads = []; this.volumes = []; this.pauseCount = 0; this.destroyCount = 0; players.push(this); }
    setVolume(value) { this.volumes.push(value); }
    unMute() { this.unmuted = true; }
    loadVideoById(value) { this.loads.push(value); }
    pauseVideo() { this.pauseCount++; }
    destroy() { this.destroyCount++; this.frame.remove(); }
    emit(event, data) { this.options.events[event]({ target: this, data }); }
  }
  if (apiReady) runtime.YT = { Player };
  const bgm = createYouTubeBgm({
    containerId: container.id, onStatus: value => statuses.push(value), onState: value => states.push(value), window: runtime, document: doc,
    setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  return {
    bgm, head, container, players, statuses, states, runtime, timers,
    get script() { return doc.getElementById('ox-youtube-iframe-api'); },
    loadApi() { runtime.YT = { Player }; runtime.onYouTubeIframeAPIReady(); },
    expire() { const [id, timer] = timers.entries().next().value; timers.delete(id); timer.fn(); },
  };
}
async function prepare(h) {
  const promise = h.bgm.prepare();
  if (!h.players.length) h.loadApi();
  h.players[0].emit('onReady');
  assert.equal(await promise, true);
  return h.players[0];
}

test('explicit preparation loads one visible controlled player without starting playback', async () => {
  let previousCalls = 0;
  const h = harness({ previousCallback: () => previousCalls++ });
  assert.equal(h.head.children.length, 0);
  assert.equal(await h.bgm.play(VIDEO), false); assert.equal(h.head.children.length, 0);
  const first = h.bgm.prepare(), second = h.bgm.prepare();
  assert.equal(first, second); assert.equal(h.head.children.length, 1);
  assert.equal(h.script.src, 'https://www.youtube.com/iframe_api');
  h.loadApi(); assert.equal(previousCalls, 1); assert.equal(h.players.length, 1);
  const player = h.players[0], frame = player.frame;
  assert.equal(frame.width, '300'); assert.equal(frame.height, '200');
  assert.equal(frame.style.width, '100%'); assert.equal(frame.style.minWidth, '200px');
  assert.equal(frame.style.minHeight, '200px'); assert.notEqual(frame.style.display, 'none');
  assert.match(frame.attributes.allow, /autoplay/); assert.equal(frame.attributes.referrerpolicy, 'strict-origin-when-cross-origin');
  const url = new URL(frame.src);
  assert.equal(url.hostname, 'www.youtube.com'); assert.equal(url.searchParams.get('controls'), '1');
  assert.equal(url.searchParams.get('autoplay'), '0'); assert.equal(url.searchParams.get('playsinline'), '1');
  assert.equal(url.searchParams.get('origin'), 'http://127.0.0.1:4179');
  player.emit('onReady'); assert.equal(await first, true); assert.equal(player.loads.length, 0);
  assert.equal(h.bgm.state.ready, true); assert.equal(h.bgm.state.playing, false); h.bgm.dispose();
});

test('pause cancels a play waiting for API readiness immediately and prevents late playback', async () => {
  const h = harness(); const preparation = h.bgm.prepare(), requested = h.bgm.play(VIDEO);
  h.bgm.pause(); assert.equal(await requested, false);
  h.loadApi(); h.players[0].emit('onReady'); assert.equal(await preparation, true);
  assert.equal(h.players[0].loads.length, 0); assert.equal(h.bgm.state.playing, false); h.bgm.dispose();
});

test('play reports success only after actual PLAYING and supports volume and late-event cancellation', async () => {
  const h = harness({ apiReady: true }), player = await prepare(h);
  h.bgm.setVolume(0.21); const requested = h.bgm.play(VIDEO);
  assert.deepEqual(player.loads, [{ videoId: VIDEO, startSeconds: 0 }]);
  assert.equal(player.volumes.at(-1), 21); assert.equal(player.unmuted, true); assert.equal(h.bgm.state.playing, false);
  player.emit('onStateChange', 3); assert.equal(h.bgm.state.playing, false);
  player.emit('onStateChange', 1); assert.equal(await requested, true); assert.equal(h.bgm.state.playerState, 1);
  assert.equal(h.bgm.state.playing, true);
  h.bgm.pause(); player.emit('onStateChange', 1);
  assert.equal(h.bgm.state.playing, false); assert.equal(player.pauseCount, 2);
  h.bgm.setVolume(5); assert.equal(player.volumes.at(-1), 100);
  h.bgm.setVolume(-1); assert.equal(player.volumes.at(-1), 0); h.bgm.dispose();
});

test('autoplay denial exposes a manual-play prompt and a later direct retry can succeed', async () => {
  const h = harness({ apiReady: true }), player = await prepare(h);
  const first = h.bgm.play(VIDEO); player.emit('onAutoplayBlocked');
  assert.equal(await first, false); assert.equal(h.bgm.state.blocked, true); assert.match(h.bgm.state.error, /직접 재생/);
  const second = h.bgm.play(VIDEO); player.emit('onStateChange', 1);
  assert.equal(await second, true); assert.equal(h.bgm.state.blocked, false); assert.equal(h.bgm.state.error, ''); h.bgm.dispose();
});

test('network failure and eight-second timeout settle preparation and allow an explicit retry', async () => {
  const h = harness(); const first = h.bgm.prepare(); h.script.listeners.get('error')();
  assert.equal(await first, false); assert.equal(h.head.children.length, 0); assert.equal(h.timers.size, 0);
  assert.match(h.bgm.state.error, /인터넷/);
  const second = h.bgm.prepare(); assert.equal([...h.timers.values()][0].ms, 8000);
  h.expire(); assert.equal(await second, false); assert.match(h.bgm.state.error, /시간이 초과/);
  const third = h.bgm.prepare(); h.loadApi(); h.players[0].emit('onReady'); assert.equal(await third, true); h.bgm.dispose();
});

test('unavailable embeds and absent Referer are explicit playback failures rather than playing claims', async () => {
  const h = harness({ apiReady: true }), player = await prepare(h);
  for (const [code, message] of [[101, /외부 화면/], [153, /서버/], [100, /비공개/]]) {
    const request = h.bgm.play(VIDEO); player.emit('onError', code);
    assert.equal(await request, false); assert.equal(h.bgm.state.playing, false); assert.match(h.bgm.state.error, message);
  }
  h.bgm.dispose();
});

test('a new play supersedes an old one and a stalled playback times out without stopping the quiz', async () => {
  const h = harness({ apiReady: true }), player = await prepare(h);
  const first = h.bgm.play(VIDEO), second = h.bgm.play(VIDEO);
  assert.equal(await first, false); assert.equal(player.loads.length, 2);
  h.expire(); assert.equal(await second, false); assert.equal(h.bgm.state.ready, true); assert.equal(h.bgm.state.playing, false);
  assert.match(h.bgm.state.error, /確認|확인/); h.bgm.dispose();
});

test('dispose settles queued work and ignores late ready events, and file origins are not sent', async () => {
  const h = harness({ apiReady: true, protocol: 'file:' });
  const preparation = h.bgm.prepare(), player = h.players[0], request = h.bgm.play(VIDEO);
  assert.equal(new URL(player.frame.src).searchParams.has('origin'), false);
  h.bgm.dispose(); assert.equal(await preparation, false); assert.equal(await request, false);
  player.emit('onReady'); player.emit('onStateChange', 1);
  assert.equal(h.bgm.state.ready, false); assert.equal(h.bgm.state.playing, false);
  assert.equal(h.timers.size, 0); assert.equal(await h.bgm.prepare(), false); assert.equal(await h.bgm.play(VIDEO), false);
});
