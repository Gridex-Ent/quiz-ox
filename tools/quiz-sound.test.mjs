import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuizSound } from '../web/src/quiz/sound.js';

function harness({ rejectResume = false, delayedResume = false } = {}) {
  const contexts = [], loops = new Map(); let loopId = 0, resume;
  class Param {
    value = 0; events = [];
    setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
    linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
    cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  }
  class Node {
    connections = []; disconnected = false;
    connect(other) { this.connections.push(other); }
    disconnect() { this.disconnected = true; }
  }
  class Context {
    state = 'suspended'; currentTime = 12; destination = {}; oscillators = []; gains = []; closeCount = 0;
    constructor() { contexts.push(this); }
    createGain() { const node = new Node(); node.gain = new Param(); this.gains.push(node); return node; }
    createOscillator() {
      const node = new Node(); node.frequency = new Param(); node.starts = []; node.stops = [];
      node.start = time => node.starts.push(time); node.stop = time => node.stops.push(time);
      this.oscillators.push(node); return node;
    }
    async resume() {
      if (rejectResume) throw Error('autoplay denied');
      if (delayedResume) await new Promise(resolve => { resume = resolve; });
      if (this.state !== 'closed') this.state = 'running';
    }
    async close() { this.state = 'closed'; this.closeCount++; }
  }
  const sound = createQuizSound({ AudioContext: Context, setInterval: fn => { loops.set(++loopId, fn); return loopId; }, clearInterval: id => loops.delete(id) });
  return { sound, contexts, loops, get resume() { return resume; } };
}

test('silent until explicit user activation, enabling starts only one background loop', async () => {
  const h = harness();
  assert.equal(h.sound.state.enabled, false); assert.equal(h.contexts.length, 0);
  assert.equal(h.sound.cue('question'), false); assert.equal(h.sound.tick(5), false);
  assert.equal(await h.sound.enable(), true); assert.equal(await h.sound.enable(), true);
  assert.equal(h.contexts.length, 1); assert.equal(h.loops.size, 1);
  assert.ok(h.contexts[0].oscillators.length > 0);
  h.sound.disable();
});

test('music switch cancels scheduled music but keeps effects and volume works at zero', async () => {
  const h = harness(); await h.sound.enable();
  const ctx = h.contexts[0], music = [...ctx.oscillators];
  h.sound.cue('question');
  const effects = ctx.oscillators.slice(music.length);
  h.sound.setMusic(false);
  assert.equal(h.loops.size, 0); assert.ok(music.every(n => n.disconnected));
  assert.ok(effects.every(n => !n.disconnected));
  h.sound.setVolume(0); assert.equal(h.sound.state.volume, 0); assert.equal(ctx.gains[0].gain.value, 0);
  h.sound.setVolume(5); assert.equal(h.sound.state.volume, 1);
  h.sound.setVolume(NaN); assert.equal(h.sound.state.volume, 1);
  h.sound.setMusic(true); h.sound.setMusic(true); assert.equal(h.loops.size, 1);
  h.sound.disable();
});

test('timer ticks are deduplicated and question reveal resets the next countdown', async () => {
  const h = harness(); h.sound.setMusic(false); await h.sound.enable();
  const ctx = h.contexts[0];
  h.sound.cue('question'); const initial = ctx.oscillators.length;
  assert.equal(h.sound.tick(5), true); assert.equal(h.sound.tick(5), false);
  assert.equal(ctx.oscillators.length, initial + 1);
  assert.equal(h.sound.tick(0), true); const ended = ctx.oscillators.length;
  assert.equal(h.sound.tick(0), false); assert.equal(ctx.oscillators.length, ended);
  h.sound.cue('question'); assert.equal(h.sound.tick(5), true);
  assert.equal(h.sound.tick(-1), false); assert.equal(h.sound.tick(1.5), false);
  h.sound.disable();
});

test('disable closes context, cancels every voice and allows a fresh user activation', async () => {
  const h = harness(); await h.sound.enable(); h.sound.cue('question');
  const first = h.contexts[0]; h.sound.disable();
  assert.equal(first.state, 'closed'); assert.equal(first.closeCount, 1); assert.equal(h.loops.size, 0);
  assert.ok(first.oscillators.every(n => n.disconnected));
  const oldCount = first.oscillators.length;
  assert.equal(h.sound.tick(3), false); assert.equal(h.sound.cue('answer'), false);
  assert.equal(first.oscillators.length, oldCount);
  await h.sound.enable(); assert.equal(h.contexts.length, 2); assert.equal(h.loops.size, 1);
  h.sound.close(); assert.equal(await h.sound.enable(), false); assert.equal(h.loops.size, 0);
});

test('disable during browser resume prevents late activation or background music', async () => {
  const h = harness({ delayedResume: true });
  const activation = h.sound.enable(); h.sound.disable(); h.resume();
  assert.equal(await activation, false); assert.equal(h.sound.state.enabled, false);
  assert.equal(h.contexts[0].state, 'closed'); assert.equal(h.loops.size, 0);
});

test('a new user activation can resume while a cancelled activation is still pending', async () => {
  const h = harness({ delayedResume: true });
  const first = h.sound.enable(), firstResume = h.resume;
  h.sound.disable();
  const second = h.sound.enable();
  firstResume(); assert.equal(await first, false);
  h.resume();
  assert.equal(await second, true); assert.equal(h.contexts.length, 2); assert.equal(h.loops.size, 1);
  h.sound.disable();
});

test('unsupported and blocked audio report failure without throwing or affecting quiz flow', async () => {
  const unsupported = createQuizSound({ AudioContext: null });
  assert.equal(await unsupported.enable(), false); assert.equal(unsupported.state.supported, false);
  assert.match(unsupported.state.error, /지원하지/);
  const h = harness({ rejectResume: true }); assert.equal(await h.sound.enable(), false);
  assert.equal(h.sound.state.enabled, false); assert.match(h.sound.state.error, /다시/);
  assert.equal(h.contexts[0].state, 'closed'); assert.equal(h.loops.size, 0);
});

test('a ten-second clock alternates short tick and tock once per second and finishes once', async () => {
 const h=harness();await h.sound.enable();h.sound.setMusic(false);const ctx=h.contexts[0],initial=ctx.oscillators.length;
 for(let remaining=10;remaining>0;remaining--){const before=ctx.oscillators.length;assert.equal(h.sound.tick(remaining),true);assert.equal(h.sound.tick(remaining),false);assert.equal(ctx.oscillators.length,before+1);const voice=ctx.oscillators.at(-1);assert.equal(voice.type,'triangle');assert.equal(voice.frequency.events[0][1],remaining%2===0?1500:1100);assert.ok(voice.stops[0]-voice.starts[0]<0.08);ctx.currentTime++;}
 assert.equal(ctx.oscillators.length,initial+10);assert.equal(h.sound.tick(0),true);const ended=ctx.oscillators.length;assert.equal(h.sound.tick(0),false);assert.equal(ctx.oscillators.length,ended);h.sound.disable();
});

test('clock skips missed seconds instead of queueing a burst and stops immediately when disabled',async()=>{
 const h=harness();await h.sound.enable();h.sound.setMusic(false);const ctx=h.contexts[0];h.sound.tick(10);const first=ctx.oscillators.length;h.sound.tick(4);assert.equal(ctx.oscillators.length,first+1);h.sound.disable();const count=ctx.oscillators.length;assert.equal(h.sound.tick(3),false);assert.equal(ctx.oscillators.length,count);
});
