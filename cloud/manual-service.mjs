import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createState, transition, validateQuestions, questionSeconds } from '../web/src/quiz/manual-model.js';
import { makePublicView } from '../web/src/quiz/presentation.js';
import { DEFAULT_EVENT_INFO, validateEventInfo } from '../web/src/quiz/event-info.js';
import { validatePrizeInfo } from '../web/src/quiz/prize-info.js';
import { StoreConflictError } from './store.mjs';

const PHASES = new Set(['cover', 'prizes', 'ready', 'topic', 'question', 'answer', 'end']);
const MODEL_ACTIONS = new Set(['show', 'reveal', 'next', 'previous', 'timer', 'pause', 'blank', 'cover', 'ready', 'prizes', 'end', 'select', 'hands', 'interlude', 'resume-main', 'apply']);
const CONFIG_ACTIONS = new Set(['audio', 'event', 'prize']);
const SCALARS = ['index', 'phase', 'mode', 'left', 'deadline', 'remaining', 'topicDeadline', 'topicRemaining', 'topicResumeAfterBlank', 'blank'];
const MAX_COMMANDS = 256;
const blankRecipients = () => Array.from({ length: 7 }, (_, index) => Array.from({ length: index + 1 }, (_, slot) => ({ rank: index + 1, slot: slot + 1, name: '', phone: '' }))).flat();
const clone = value => structuredClone(value);

export class ManualError extends Error {
  constructor(message, statusCode = 400, code = 'invalid_request') { super(message); this.statusCode = statusCode; this.code = code; }
}

function bankOf(state) { return state.mainState?.questions ?? state.questions; }

function validateEvent(raw) {
  try { return validateEventInfo(raw); }
  catch (error) { throw new ManualError(error.message); }
}

function validatePrize(raw) {
  try { return validatePrizeInfo(raw); }
  catch (error) { throw new ManualError(error.message); }
}

export function scalarState(state) {
  const value = Object.fromEntries(SCALARS.map(key => [key, state[key]]));
  value.mainState = state.mainState ? scalarState(state.mainState) : null;
  if (state.mode === 'bonus') value.bonusQuestion = clone(state.questions[0]);
  return value;
}

function validateBank(questions) {
  if (!Array.isArray(questions) || questions.length > 300) throw new ManualError('문제는1~300개까지 저장할 수 있습니다.');
  for (const q of questions) {
    if (!q || typeof q !== 'object') throw new ManualError('문제 형식을 확인해 주세요.');
    for (const [key, value] of Object.entries(q)) if (key !== 'imageData' && typeof value === 'string' && value.length > 20000) throw new ManualError('문제의 한 항목은20,000자 이내여야 합니다.');
  }
  try { return validateQuestions(questions); }
  catch (error) { throw new ManualError(error.message); }
}

function validateState(raw, depth = 0) {
  if (!raw || typeof raw !== 'object' || !PHASES.has(raw.phase) || !['main', 'bonus'].includes(raw.mode) || depth > 1) throw Error('저장된 진행 상태 형식을 읽지 못했습니다.');
  const questions = validateBank(raw.questions);
  if (raw.mode === 'bonus' && questions[0]) questions[0].seconds = questionSeconds(0, 'bonus');
  if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index >= questions.length || !['O', 'X'].includes(raw.left)) throw Error('저장된 문제 위치를 읽지 못했습니다.');
  for (const key of ['deadline', 'remaining', 'topicDeadline', 'topicRemaining']) if (raw[key] !== null && (!Number.isFinite(raw[key]) || raw[key] < 0)) throw Error('저장된 타이머를 읽지 못했습니다.');
  const value = Object.fromEntries(SCALARS.map(key => [key, raw[key]]));
  value.blank = !!raw.blank; value.topicResumeAfterBlank = !!raw.topicResumeAfterBlank; value.questions = questions;
  value.mainState = raw.mainState ? validateState(raw.mainState, depth + 1) : null;
  if (raw.mode === 'bonus' && (questions.length !== 1 || !value.mainState || value.mainState.mode !== 'main')) throw Error('저장된 번외 진행 상태를 읽지 못했습니다.');
  if (raw.mode === 'main' && value.mainState) throw Error('저장된 본게임 상태를 읽지 못했습니다.');
  return value;
}

function validateAudio(raw) {
  if (!raw || typeof raw.muted !== 'boolean' || typeof raw.music !== 'boolean' || !Number.isFinite(raw.volume) || raw.volume < 0 || raw.volume > 1) throw new ManualError('음향 설정을 확인해 주세요.');
  return { muted: raw.muted, music: raw.music, volume: raw.volume };
}

export function validateRecipientRecords(records) {
  if (!Array.isArray(records) || records.length !== 28) throw new ManualError('이 행사의28칸 명단을 입력해 주세요.');
  const bySlot = new Map();
  for (const row of records) {
    if (!row || !Number.isInteger(row.rank) || !Number.isInteger(row.slot) || typeof row.name !== 'string' || typeof row.phone !== 'string' || row.name.length > 100 || row.phone.length > 50 || /\0/.test(row.name + row.phone)) throw new ManualError('이름100자·전화번호50자 이내의 문자열로 입력해 주세요.');
    const key = `${row.rank}:${row.slot}`;
    if (bySlot.has(key)) throw new ManualError('같은 등수·순번이 중복되었습니다.');
    bySlot.set(key, { rank: row.rank, slot: row.slot, name: row.name, phone: row.phone });
  }
  return blankRecipients().map(slot => {
    const row = bySlot.get(`${slot.rank}:${slot.slot}`);
    if (!row) throw new ManualError('명단의 등수·순번이 현재 상품과 다릅니다.');
    return row;
  });
}

function validateDocument(raw) {
  if (!raw || raw.schemaVersion !== 1 || !Number.isSafeInteger(raw.revision) || raw.revision < 0 || !Number.isSafeInteger(raw.bankVersion) || raw.bankVersion < 0 || !Number.isSafeInteger(raw.recipientRevision) || raw.recipientRevision < 0 || (raw.prizeVersion !== undefined && (!Number.isSafeInteger(raw.prizeVersion) || raw.prizeVersion < 0)) || typeof raw.screenKey !== 'string' || raw.screenKey.length < 24 || !Array.isArray(raw.commands)) throw Error('클라우드 저장 형식이 올바르지 않습니다. 원본을 보존하고 시작을 중단합니다.');
  const commands = raw.commands.slice(-MAX_COMMANDS).map(command => {
    if (!command || typeof command.id !== 'string' || typeof command.hash !== 'string') throw Error('저장된 명령 기록을 읽지 못했습니다.');
    return { id: command.id, hash: command.hash };
  });
  return { schemaVersion: 1, revision: raw.revision, bankVersion: raw.bankVersion, recipientRevision: raw.recipientRevision, prizeVersion: raw.prizeVersion ?? 0, screenKey: raw.screenKey, state: validateState(raw.state), audio: validateAudio(raw.audio), event: validateEvent(raw.event === undefined ? DEFAULT_EVENT_INFO : raw.event), prize: validatePrize(raw.prize === undefined ? null : raw.prize), recipients: validateRecipientRecords(raw.recipients), commands };
}

function normalizedAction(raw, state) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || (!MODEL_ACTIONS.has(raw.type) && !CONFIG_ACTIONS.has(raw.type))) throw new ManualError('지원하지 않는 진행 명령입니다.');
  if (raw.type === 'audio') return { type: 'audio', ...validateAudio({ ...state.audio, ...raw }) };
  if (raw.type === 'event') return { type: 'event', event: validateEvent(raw.event) };
  if (raw.type === 'prize') return { type: 'prize', prize: validatePrize(raw.prize) };
  const action = { type: raw.type };
  if (raw.type === 'select') {
    if (!Number.isInteger(raw.index) || raw.index < 0 || raw.index >= state.questions.length || state.mode === 'bonus') throw new ManualError('본게임 문제 번호를 확인해 주세요.');
    action.index = raw.index;
  } else if (raw.type === 'hands') {
    if (!['O', 'X'].includes(raw.left)) throw new ManualError('손들기 방향을 확인해 주세요.');
    action.left = raw.left;
  } else if (raw.type === 'apply') {
    if (state.mode === 'bonus') throw new ManualError('본게임으로 돌아온 뒤 문제를 저장해 주세요.', 409, 'invalid_state');
    action.questions = validateBank(raw.questions);
  } else if (raw.type === 'interlude') {
    const seconds = questionSeconds(0, 'bonus');
    action.question = { ...validateBank([{ ...raw.question, seconds }])[0], seconds };
  }
  return action;
}

export class ManualService {
  static async create({ store, seed, screenKey, now = Date.now } = {}) {
    if (!store?.load || !store?.save) throw Error('진행 상태를 영속 저장할 저장소가 필요합니다.');
    if (screenKey !== undefined && (typeof screenKey !== 'string' || screenKey.length < 24)) throw Error('스크린 키는24자 이상이어야 합니다.');
    const loaded = await store.load();
    let document = loaded ? validateDocument(loaded.value) : {
      schemaVersion: 1, revision: 0, bankVersion: 0, recipientRevision: 0, prizeVersion: 0,
      screenKey: screenKey || randomBytes(32).toString('base64url'),
      state: createState(validateBank(seed)), audio: { muted: false, music: true, volume: 0.35 }, event: clone(DEFAULT_EVENT_INFO), prize: null, recipients: blankRecipients(), commands: [],
    };
    if (typeof document.screenKey !== 'string' || document.screenKey.length < 24) throw Error('스크린 키는24자 이상이어야 합니다.');
    let generation = loaded?.generation ?? null;
    // A server restart must not reveal or advance a round while the presenter is reconnecting.
    if (loaded && (document.state.deadline !== null || document.state.topicDeadline !== null)) document = { ...document, state: transition(document.state, { type: 'pause' }, now()), revision: document.revision + 1 };
    if (screenKey && screenKey !== document.screenKey) document = { ...document, screenKey, revision: document.revision + 1 };
    if (!loaded || document.revision !== loaded.value.revision) generation = (await store.save(document, generation)).generation;
    return new ManualService(store, document, generation, now);
  }

  constructor(store, document, generation, now) { this.store = store; this.document = document; this.generation = generation; this.now = now; this.queue = Promise.resolve(); this.lastPersistenceError = null; }

  serial(task) { const operation = this.queue.then(task); this.queue = operation.catch(() => {}); return operation; }

  async commit(next) {
    try {
      const result = await this.store.save(next, this.generation);
      this.document = next; this.generation = result.generation; this.lastPersistenceError = null;
    } catch (error) {
      this.lastPersistenceError = error;
      if (error instanceof StoreConflictError) {
        const latest = await this.store.load();
        if (latest) { this.document = validateDocument(latest.value); this.generation = latest.generation; this.lastPersistenceError = null; }
        throw new ManualError(error.message, 409, 'storage_conflict');
      }
      throw new ManualError('클라우드 저장에 실패했습니다. 현재 진행 상태는 유지됩니다. 다시 시도해 주세요.', 503, 'storage_failed');
    }
  }

  async recoverAfterFailure() {
    if (!this.lastPersistenceError) return;
    try {
      const latest = await this.store.load();
      if (!latest) throw Error('missing durable state');
      this.document = validateDocument(latest.value); this.generation = latest.generation; this.lastPersistenceError = null;
    } catch { throw new ManualError('저장된 최신 상태를 확인하지 못했습니다. 연결이 복구된 뒤 다시 시도해 주세요.', 503, 'storage_unavailable'); }
  }

  async tickNow() {
    await this.recoverAfterFailure();
    const nextState = transition(this.document.state, { type: 'tick' }, this.now());
    if (nextState !== this.document.state) await this.commit({ ...this.document, state: nextState, revision: this.document.revision + 1 });
  }

  adminEnvelope(bank = -1, prize = -1) {
    const doc = this.document;
    return { revision: doc.revision, bankVersion: doc.bankVersion, prizeVersion: doc.prizeVersion, serverNow: this.now(), ...(bank === doc.bankVersion ? {} : { bank: clone(bankOf(doc.state)) }), ...(prize === doc.prizeVersion ? {} : { prize: clone(doc.prize) }), state: scalarState(doc.state), screenPath: `/screen#key=${encodeURIComponent(doc.screenKey)}`, audio: clone(doc.audio), event: clone(doc.event) };
  }

  adminState({ revision = -1, bank = -1, prize = -1 } = {}) {
    return this.serial(async () => { await this.tickNow(); return revision === this.document.revision && bank === this.document.bankVersion && prize === this.document.prizeVersion ? null : this.adminEnvelope(bank, prize); });
  }

  screenState({ revision = -1 } = {}) {
    return this.serial(async () => { await this.tickNow(); const doc = this.document; return revision === doc.revision ? null : { revision: doc.revision, serverNow: this.now(), view: { ...makePublicView(doc.state, this.now()), event: clone(doc.event), prize: doc.state.phase === 'prizes' && !doc.state.blank ? clone(doc.prize) : null }, audio: clone(doc.audio) }; });
  }

  verifyScreenKey(value) {
    if (typeof value !== 'string') return false;
    const actual = Buffer.from(value), expected = Buffer.from(this.document.screenKey);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  action({ commandId, revision, action: raw } = {}) {
    return this.serial(async () => {
      await this.recoverAfterFailure();
      if (typeof commandId !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(commandId)) throw new ManualError('명령 식별자가 필요합니다.');
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ManualError('진행 명령 형식을 확인해 주세요.');
      const hash = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
      const previous = this.document.commands.find(command => command.id === commandId);
      if (previous) {
        if (previous.hash !== hash) throw new ManualError('동일한 명령 식별자를 다른 요청에 사용할 수 없습니다.', 409, 'duplicate_mismatch');
        await this.tickNow(); return this.adminEnvelope();
      }
      await this.tickNow();
      if (!Number.isSafeInteger(revision) || revision !== this.document.revision) throw new ManualError('진행 상태가 바뀌었습니다. 최신 화면을 확인한 뒤 다시 눌러 주세요.', 409, 'stale_revision');
      const doc = this.document;
      const action = normalizedAction(raw, { ...doc.state, audio: doc.audio });
      const state = CONFIG_ACTIONS.has(action.type) ? doc.state : transition(doc.state, action, this.now());
      const next = { ...doc, state, revision: doc.revision + 1, bankVersion: doc.bankVersion + (action.type === 'apply' ? 1 : 0), prizeVersion: doc.prizeVersion + (action.type === 'prize' ? 1 : 0), audio: action.type === 'audio' ? validateAudio(action) : doc.audio, event: action.type === 'event' ? action.event : doc.event, prize: action.type === 'prize' ? action.prize : doc.prize, commands: [...doc.commands, { id: commandId, hash }].slice(-MAX_COMMANDS) };
      await this.commit(next); return this.adminEnvelope(doc.bankVersion, action.type === 'prize' ? -1 : doc.prizeVersion);
    });
  }

  tick() { return this.serial(() => this.tickNow()); }

  recipients() { return this.serial(async () => { await this.recoverAfterFailure(); return { revision: this.document.recipientRevision, records: clone(this.document.recipients) }; }); }

  saveRecipients({ revision, records } = {}) {
    return this.serial(async () => {
      await this.recoverAfterFailure();
      if (revision !== this.document.recipientRevision) throw new ManualError('명단이 다른 기기에서 변경되었습니다. 최신 명단을 불러와 주세요.', 409, 'stale_recipients');
      const next = { ...this.document, recipients: validateRecipientRecords(records), recipientRevision: revision + 1 };
      await this.commit(next); return { revision: next.recipientRevision, records: clone(next.recipients) };
    });
  }

  health() { return { ok: !this.lastPersistenceError, mode: 'manual', persistence: this.store.kind ?? 'custom' }; }
  async close() { await this.queue; }
}
