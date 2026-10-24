import { DEFAULT_EVENT_INFO, validateEventInfo } from '../quiz/event-info.js';
import { validatePrizeInfo } from '../quiz/prize-info.js';

const clone = value => structuredClone(value);

export function createCloudTransport({
  onState = () => {}, onStatus = () => {}, onConnection = () => {},
  fetch: request = globalThis.fetch.bind(globalThis),
  setTimeout: schedule = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout,
  now = () => Date.now(), intervalMs = 500, timeoutMs = 8000,
  commandId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
} = {}) {
  let bank = null, modelState = null, timer = null, polling = null, stopped = true, prizeLoaded = false;
  let busy = false, connected = false, authenticated = true, uncertain = false;
  let meta = { revision: -1, bankVersion: -1, prizeVersion: -1, serverNow: 0, offsetMs: 0, screenPath: '', event: clone(DEFAULT_EVENT_INFO), prize: null, audio: { muted: false, music: true, volume: 0.35 } };
  const connection = () => ({ connected, busy, authenticated, uncertain });
  const publishConnection = () => onConnection(connection());
  const fail = (message, status, code) => Object.assign(new Error(message), { status, code });

  async function http(path, options = {}) {
    const abort = new AbortController();
    const deadline = schedule(() => abort.abort(), timeoutMs);
    try {
      const response = await request(path, { credentials: 'same-origin', cache: 'no-store', ...options, signal: abort.signal });
      if (response.status === 304) return null;
      let payload;
      try { payload = await response.json(); } catch { throw fail('서버 응답을 읽지 못했습니다. 연결을 확인해 주세요.', response.status, 'BAD_RESPONSE'); }
      if (!response.ok) {
        if (response.status === 401) { authenticated = false; connected = false; publishConnection(); }
        throw fail(payload?.error?.message || payload?.error || payload?.message || (response.status === 401 ? '진행자 로그인이 만료됐습니다. 다시 로그인해 주세요.' : '클라우드 요청을 완료하지 못했습니다.'), response.status, response.status === 409 ? 'CONFLICT' : 'HTTP_ERROR');
      }
      return payload;
    } finally { cancel(deadline); }
  }

  function accept(payload, startedAt) {
    if (!payload) { connected = true; authenticated = true; uncertain = false; publishConnection(); return; }
    if (!Number.isInteger(payload.revision) || !Number.isInteger(payload.bankVersion) || !payload.state || !Number.isFinite(payload.serverNow)) throw fail('진행 상태 형식을 확인하지 못했습니다.', 0, 'BAD_STATE');
    if (payload.revision < meta.revision) return;
    const nextBank = payload.bank === undefined ? bank : clone(payload.bank);
    if (!Array.isArray(nextBank) || !nextBank.length || (payload.bank === undefined && payload.bankVersion !== meta.bankVersion)) { bank = null; throw fail('문제 목록을 다시 불러오는 중입니다.', 0, 'MISSING_BANK'); }
    const hydrate = scalar => {
      const result = clone(scalar);
      result.questions = scalar.mode === 'bonus' ? [clone(scalar.bonusQuestion)] : nextBank;
      delete result.bonusQuestion;
      if (scalar.mode === 'bonus' && !result.questions[0]) throw fail('번외 문제를 다시 불러오는 중입니다.', 0, 'BAD_STATE');
      result.mainState = scalar.mainState ? { ...clone(scalar.mainState), questions: nextBank, mainState: null } : null;
      return result;
    };
    const nextState = hydrate(payload.state);
    const event = payload.event === undefined ? meta.event : validateEventInfo(payload.event);
    const prizeVersion = payload.prizeVersion ?? Math.max(0, meta.prizeVersion);
    if (!Number.isInteger(prizeVersion) || prizeVersion < 0) throw fail('상품 이미지 버전을 확인하지 못했습니다.', 0, 'BAD_STATE');
    const hasPrize = Object.hasOwn(payload, 'prize');
    if (!hasPrize && payload.prizeVersion !== undefined && (!prizeLoaded || prizeVersion !== meta.prizeVersion)) {
      prizeLoaded = false;
      throw fail('변경된 상품 이미지를 다시 불러오는 중입니다.', 0, 'MISSING_PRIZE');
    }
    const prize = hasPrize ? validatePrizeInfo(payload.prize) : meta.prize;
    bank = nextBank;
    meta = { ...meta, event: clone(event), prize: clone(prize), prizeVersion, revision: payload.revision, bankVersion: payload.bankVersion, serverNow: payload.serverNow, offsetMs: payload.serverNow - (startedAt + now()) / 2, ...(payload.screenPath ? { screenPath: payload.screenPath } : {}), ...(payload.audio ? { audio: clone(payload.audio) } : {}) };
    prizeLoaded = true;
    modelState = nextState; connected = true; authenticated = true; uncertain = false;
    publishConnection(); onState(clone(nextState), clone(meta));
  }

  function later() {
    if (stopped || timer !== null) return;
    timer = schedule(() => { timer = null; void poll().catch(() => {}); }, intervalMs);
  }
  async function poll(force = false) {
    if (polling) { await polling; if (!force) return; }
    const startedAt = now();
    const task = (async () => {
      try {
        const query = new URLSearchParams({ revision: String(force ? -1 : meta.revision), bank: String(bank ? meta.bankVersion : -1), prize: String(prizeLoaded ? meta.prizeVersion : -1) });
        const payload = await http(`/api/admin/state?${query}`);
        accept(payload, startedAt);
      } catch (error) {
        connected = false; publishConnection();
        onStatus(error.status === 401 ? error.message : '연결이 끊겼습니다. 같은 진행 위치로 다시 연결하는 중입니다.');
        throw error;
      } finally { if (polling === task) polling = null; later(); }
    })();
    polling = task;
    return task;
  }

  async function send(action) {
    if (busy) throw fail('앞선 조작을 저장 중입니다. 잠시 기다려 주세요.', 0, 'BUSY');
    if (!authenticated) throw fail('진행자 로그인이 필요합니다.', 401, 'AUTH_REQUIRED');
    if (uncertain || !connected || meta.revision < 0) throw fail('연결 상태를 확인한 뒤 다시 조작해 주세요.', 0, 'NOT_CONNECTED');
    busy = true; publishConnection();
    const id = commandId(), startedAt = now();
    try {
      const payload = await http('/api/admin/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ commandId: id, revision: meta.revision, action }) });
      accept(payload, startedAt);
      return clone(meta);
    } catch (error) {
      if (error.status === 409) {
        await poll(true).catch(() => {});
        onStatus('다른 화면에서 진행 상태가 바뀌었습니다. 현재 문제를 확인하고 다시 눌러 주세요.');
      } else if (!error.status || error.code === 'BAD_RESPONSE') {
        uncertain = true; connected = false; publishConnection();
        const recovered = await poll(true).then(() => true).catch(() => false);
        onStatus(recovered ? '조작 결과를 다시 확인했습니다. 현재 문제를 확인해 주세요.' : '조작 결과를 확인 중입니다. 연결이 복구될 때까지 현재 화면을 유지합니다.');
      } else onStatus(error.message);
      throw error;
    } finally { busy = false; publishConnection(); }
  }

  return {
    async connect() { stopped = false; await poll(true); return clone(meta); },
    send,
    saveBank(questions) { return send({ type: 'apply', questions }); },
    async loadRecipients() { return http('/api/admin/recipients'); },
    async saveRecipients(records, revision) { return http('/api/admin/recipients', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, records }) }); },
    async logout() { await http('/api/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); this.destroy(); authenticated = false; connected = false; publishConnection(); },
    refresh() { return poll(true); },
    destroy() { stopped = true; if (timer !== null) cancel(timer); timer = null; },
    get state() { return { ...clone(meta), ...connection(), modelState: modelState ? clone(modelState) : null }; },
  };
}
