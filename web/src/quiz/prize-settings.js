import { MAX_PRIZE_BYTES, validatePrizeInfo } from './prize-info.js';

const KEY = 'ox-cloud-prize-pending-v1';
const clone = value => structuredClone(value);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const MAX_LABEL = `${MAX_PRIZE_BYTES / 1024 / 1024} MiB`;
const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export async function readPrizeFile(file, read = value => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(Error('이미지를 읽지 못했습니다. 파일을 다시 선택해 주세요.'));
  reader.onabort = () => reject(Error('이미지 읽기를 취소했습니다.'));
  reader.readAsDataURL(value);
})) {
  if (!file || !TYPES.has(file.type)) throw Error('PNG·JPEG·WebP·GIF 이미지를 선택해 주세요.');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PRIZE_BYTES) throw Error(`이미지 파일은 ${MAX_LABEL} 이하여야 합니다.`);
  const imageData = await read(file);
  return validatePrizeInfo({ imageData, imageAlt: '', caption: '' }).imageData;
}

// Owns only prize input and draft state. The presenter supplies authenticated saving.
export function createPrizeSettings({ root, defaultPrize = {}, onSave, storage = globalThis.sessionStorage, readFile = readPrizeFile, confirm = message => globalThis.confirm(message) } = {}) {
  if (!root || typeof onSave !== 'function') throw TypeError('상품 설정 화면과 저장 함수를 지정해 주세요.');
  root.innerHTML = `<h2>상품 소개 이미지</h2><p class="hint">PNG·JPEG·WebP·GIF, 최대 ${MAX_LABEL}. 저장하면 연결된 모든 스크린의 상품 소개에 적용됩니다. 수령 기록의 등수와 명단은 유지됩니다.</p><form data-prize-form class="prize-form"><label>이미지 파일<input data-prize-file type="file" accept="image/png,image/jpeg,image/webp,image/gif"></label><label>이미지 설명 (선택)<input data-prize-alt maxlength="100" autocomplete="off"></label><label>캡션 (선택)<textarea data-prize-caption maxlength="200"></textarea></label><figure class="prize-upload-preview"><img data-prize-preview alt="상품 이미지 미리보기"><figcaption data-prize-preview-caption></figcaption></figure><div class="buttons"><button data-prize-save class="primary" type="submit">상품 이미지 저장</button><button data-prize-default type="button">기본 이미지로 복원하여 저장</button><button data-prize-reload type="button">서버의 최신 이미지 불러오기</button></div><p data-prize-status role="status" aria-live="polite"></p></form>`;
  const el = Object.fromEntries(['form', 'file', 'alt', 'caption', 'preview', 'preview-caption', 'save', 'default', 'reload', 'status'].map(key => [key, root.querySelector(`[data-prize-${key}]`)]));
  let server = null, base = null, draft = null, loaded = false, dirty = false, conflict = false, saving = false, reading = false, destroyed = false;
  let revision = 0, readGeneration = 0, own = null;
  let connection = { connected: false, busy: false, authenticated: true };
  function notice(text) { if (!destroyed) el.status.textContent = text; }
  function controls() {
    const locked = !loaded || saving || reading || conflict || !connection.connected || connection.busy || !connection.authenticated;
    el.save.disabled = locked; el.default.disabled = locked;
    el.reload.disabled = !loaded || saving || reading;
  }
  function preview(fill = false) {
    if (fill) { el.alt.value = draft?.imageAlt ?? ''; el.caption.value = draft?.caption ?? ''; }
    const image = draft?.imageData ? draft : defaultPrize;
    el.preview.src = image.imageData || '';
    el.preview.alt = draft?.imageAlt || image.imageAlt || '오늘의 상품';
    el['preview-caption'].textContent = draft?.caption ?? defaultPrize.caption ?? '';
    controls();
  }
  function persist() {
    try {
      if (dirty) storage.setItem(KEY, JSON.stringify({ version: 1, prize: draft, base }));
      else storage.removeItem(KEY);
      return true;
    } catch {
      notice('이미지 입력을 이 탭에 임시 보관하지 못했습니다. 새로고침하거나 창을 닫기 전에 서버 저장을 완료해 주세요.');
      return false;
    }
  }
  function changed(value) {
    draft = clone(value); revision++; dirty = !same(draft, server);
    preview();
    if (persist()) notice(conflict ? '다른 화면에서 상품 이미지가 바뀌었습니다. 입력은 유지했습니다. 최신 이미지를 확인해 주세요.' : dirty ? '미저장 상품 이미지 · 저장 후 스크린에 반영됩니다. 이 탭에 임시 보관했습니다.' : '저장된 상품 이미지와 같습니다.');
  }
  try {
    const pending = JSON.parse(storage.getItem(KEY));
    if (pending?.version === 1) {
      base = validatePrizeInfo(pending.base);
      if (pending.prize?.imageData === '' && ['imageAlt', 'caption'].every(key => typeof pending.prize[key] === 'string')) draft = clone(pending.prize);
      else draft = validatePrizeInfo(pending.prize);
      dirty = true;
      notice('미저장 상품 이미지 입력을 복원했습니다. 서버 설정을 확인하는 중입니다.');
    }
  } catch { notice('이전 상품 이미지 입력을 읽지 못했습니다. 서버의 최신 이미지를 확인해 주세요.'); }
  preview(true);

  function accept(value = null) {
    if (destroyed) return;
    server = validatePrizeInfo(value);
    if (!loaded) {
      loaded = true;
      if (!dirty) { draft = clone(server); base = clone(server); preview(true); notice('저장된 상품 이미지입니다. 변경 후 상품 이미지 저장을 눌러 주세요.'); }
      else {
        dirty = !same(draft, server); conflict = dirty && !same(base, server);
        if (!dirty) base = clone(server);
        if (persist()) notice(conflict ? '다른 화면에서 상품 이미지가 바뀌었습니다. 복원한 입력을 유지했으니 최신 이미지를 확인해 주세요.' : dirty ? '미저장 상품 이미지 입력을 복원했습니다. 검토 후 저장해 주세요.' : '서버 상품 이미지와 같습니다.');
      }
    } else if (own && same(server, own.prize)) {
      base = clone(server); conflict = false; dirty = !same(draft, server); persist();
    } else if (!dirty && !own && !reading) {
      if (!same(draft, server)) { draft = clone(server); base = clone(server); preview(true); notice('서버의 최신 상품 이미지를 불러왔습니다.'); }
    } else if (!same(base, server)) {
      conflict = true;
      notice('다른 화면에서 상품 이미지가 바뀌었습니다. 작성 중인 입력은 유지했습니다. 최신 이미지를 확인한 뒤 다시 편집해 주세요.');
    }
    controls();
  }
  async function save() {
    if (saving || reading || destroyed) return;
    if (!loaded || !connection.connected || connection.busy || !connection.authenticated) { notice('서버 연결을 확인한 뒤 다시 저장해 주세요. 입력은 유지됩니다.'); return; }
    if (conflict || !same(base, server)) { conflict = true; controls(); notice('다른 화면의 변경을 먼저 확인해 주세요. 상품 이미지 입력은 유지됩니다.'); return; }
    try {
      const prize = validatePrizeInfo(draft), savingRevision = revision;
      saving = true; own = { prize }; controls(); notice('상품 이미지를 서버에 저장하는 중입니다…');
      const acknowledged = validatePrizeInfo(await onSave(clone(prize)));
      if (destroyed) return;
      server = clone(acknowledged);
      if (!same(acknowledged, prize)) { conflict = true; persist(); notice('저장 후 다른 화면에서 상품 이미지가 다시 바뀌었습니다. 입력을 유지했으니 최신 이미지를 확인해 주세요.'); return; }
      base = clone(acknowledged); conflict = false;
      if (savingRevision === revision) { draft = clone(acknowledged); dirty = false; preview(true); }
      else dirty = !same(draft, base);
      if (persist()) notice(dirty || reading ? '앞선 상품 이미지는 저장했습니다. 저장 중 추가한 입력은 보관했으니 다시 저장해 주세요.' : prize === null ? '기본 상품 이미지로 복원하여 저장했습니다.' : '상품 이미지를 클라우드에 저장했습니다. 상품 소개 화면에 반영했습니다.');
    } catch (error) {
      if (destroyed) return;
      dirty = true;
      if (persist()) notice(`${error.message} 상품 이미지 입력은 유지했습니다. ${conflict ? '다른 화면의 변경을 확인해 주세요.' : '연결을 확인한 뒤 다시 저장해 주세요.'}`);
    } finally { saving = false; own = null; if (!destroyed) controls(); }
  }
  el.form.onsubmit = event => { event.preventDefault(); return save(); };
  el.form.oninput = event => {
    if (event.target !== el.alt && event.target !== el.caption) return;
    const value = { imageData: draft?.imageData ?? '', imageAlt: el.alt.value, caption: el.caption.value };
    changed(value.imageData || value.imageAlt || value.caption ? value : null);
  };
  el.file.onchange = async event => {
    const file = event.target.files?.[0]; if (!file) return;
    const generation = ++readGeneration; reading = true; revision++; controls(); notice('상품 이미지를 읽는 중입니다…');
    try {
      const imageData = await readFile(file);
      if (destroyed || generation !== readGeneration) return;
      changed(validatePrizeInfo({ imageData, imageAlt: el.alt.value, caption: el.caption.value }));
    } catch (error) { if (!destroyed && generation === readGeneration) notice(`${error.message} 기존 이미지 입력은 유지했습니다.`); }
    finally { if (!destroyed && generation === readGeneration) { reading = false; el.file.value = ''; controls(); } }
  };
  el.default.onclick = () => { if (el.default.disabled) return; changed(null); preview(true); return save(); };
  el.reload.onclick = () => {
    if (el.reload.disabled || (dirty && !confirm('작성 중인 상품 이미지 입력을 지우고 서버의 최신 이미지를 불러올까요?'))) return;
    readGeneration++; draft = clone(server); base = clone(server); dirty = false; conflict = false; revision++; preview(true);
    if (persist()) notice('서버의 최신 상품 이미지를 불러왔습니다.');
  };
  return {
    accept,
    setConnection(value) { connection = { ...connection, ...value }; controls(); },
    get hasPending() { return dirty || saving || reading; },
    get state() { return clone({ server, draft, base, dirty, conflict, saving, reading, loaded }); },
    destroy() { destroyed = true; readGeneration++; for (const [element, key] of [[el.form, 'onsubmit'], [el.form, 'oninput'], [el.file, 'onchange'], [el.default, 'onclick'], [el.reload, 'onclick']]) element[key] = null; root.innerHTML = ''; },
  };
}
