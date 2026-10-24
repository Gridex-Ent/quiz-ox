const STORAGE_KEY = 'ox-banquet-recipients-v1';
const MAX_JSON_LENGTH = 100000;
const MAX_NAME = 100, MAX_PHONE = 50;
const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

// 퀴즈 상태·프로젝션·네트워크와 연결하지 않는 관리자 전용 로컬 명단이다.
export function createRecipientBook({ root, tiers, storage, onStatus = () => {}, onSave, remote = false, pending = false } = {}) {
  if (!root || !Array.isArray(tiers) || !tiers.length) throw Error('상품 수령 기록 화면과 상품 목록이 필요합니다.');
  const seenRanks = new Set();
  const prizes = tiers.map(tier => {
    if (!Number.isInteger(tier.rank) || tier.rank < 1 || seenRanks.has(tier.rank) || !Number.isInteger(tier.people) || tier.people < 1 || tier.people > 100 || typeof tier.label !== 'string' || !tier.label.trim()) throw Error('상품 등수·상품명·인원을 확인해 주세요.');
    seenRanks.add(tier.rank);
    return { rank: tier.rank, label: tier.label, people: tier.people, detail: typeof tier.detail === 'string' ? tier.detail : '' };
  });
  const slots = prizes.flatMap(tier => Array.from({ length: tier.people }, (_, index) => ({ rank: tier.rank, slot: index + 1, name: '', phone: '' })));
  let rows = slots.map(row => ({ ...row })), store = storage, error = '', restoreError = false, saved = false;
  let message = remote ? '입력하면 인증된 클라우드 진행실에 저장됩니다.' : '입력하면 이 브라우저에 자동 저장됩니다.', revision = 0, saveAttempt = 0, importGeneration = 0, destroyed = false;
  const previous = { oninput: root.oninput, onclick: root.onclick, onchange: root.onchange };

  function snapshot() { return { version: 1, recipients: rows.map(row => ({ ...row })) }; }
  function notify(text, isError = false) {
    message = text; error = isError ? text : '';
    const status = root.querySelector?.('.recipient-status');
    if (status) { status.textContent = text; status.dataset.error = String(isError); }
    const progress = root.querySelector?.('.recipient-progress');
    if (progress) progress.textContent = progressText();
    try { onStatus(text); } catch { /* 외부 알림 실패가 입력을 막지 않는다. */ }
  }
  function progressText() {
    const started = rows.filter(row => row.name || row.phone).length;
    const complete = rows.filter(row => row.name.trim() && row.phone.trim()).length;
    return `총 ${rows.length}명 · 입력 ${started}명 · 이름·전화번호 모두 입력 ${complete}명`;
  }
  function validate(value) {
    if (!value || value.version !== 1 || !Array.isArray(value.recipients) || value.recipients.length !== slots.length) throw Error(`이 행사 상품 ${slots.length}칸의 JSON 백업을 선택해 주세요.`);
    const bySlot = new Map();
    for (const row of value.recipients) {
      if (!row || !Number.isInteger(row.rank) || !Number.isInteger(row.slot) || typeof row.name !== 'string' || typeof row.phone !== 'string' || row.name.length > MAX_NAME || row.phone.length > MAX_PHONE || /\0/.test(row.name + row.phone)) throw Error('이름과 전화번호는 문자열이어야 하며 이름 100자·전화번호 50자 이내여야 합니다.');
      const key = `${row.rank}:${row.slot}`;
      if (bySlot.has(key)) throw Error('같은 등수·순번이 중복된 명단입니다.');
      bySlot.set(key, { rank: row.rank, slot: row.slot, name: row.name, phone: row.phone });
    }
    return slots.map(slot => {
      const row = bySlot.get(`${slot.rank}:${slot.slot}`);
      if (!row) throw Error('명단의 등수·순번이 현재 상품 목록과 다릅니다.');
      return row;
    });
  }
  function parse(text) {
    if (typeof text !== 'string' || text.length > MAX_JSON_LENGTH) throw Error('100KB 이내의 명단 JSON 파일을 선택해 주세요.');
    let value;
    try { value = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw Error('JSON 형식을 읽지 못했습니다. 명단 JSON 백업을 선택해 주세요.'); }
    return validate(value);
  }
  function persist(successMessage) {
    const replacingUnreadable = restoreError, savingAttempt = ++saveAttempt;
    try {
      if (!store?.setItem) throw Error('storage unavailable');
      store.setItem(STORAGE_KEY, JSON.stringify(snapshot()));
      if (onSave) {
        const savingRevision = revision, value = snapshot();
        saved = false; restoreError = false; notify('클라우드에 저장 중입니다.');
        void Promise.resolve().then(() => onSave(value)).then(() => {
          if (!destroyed && revision === savingRevision && savingAttempt === saveAttempt) { saved = true; notify('클라우드에 저장했습니다.'); }
        }).catch(reason => {
          if (!destroyed && revision === savingRevision && savingAttempt === saveAttempt) { saved = false; notify(`${reason.message || '클라우드 저장에 실패했습니다.'} 입력은 이 기기에 보관했습니다. 명단 JSON 백업 또는 다시 저장을 사용해 주세요.`, true); }
        });
        return true;
      }
      saved = true; restoreError = false;
      notify(replacingUnreadable ? '새 입력을 저장했습니다. 이전의 읽지 못한 저장값은 새 명단으로 대체했습니다.' : successMessage || '이 브라우저에 자동 저장했습니다.');
      return true;
    } catch {
      saved = false;
      notify('자동 저장에 실패했습니다. 입력 내용은 이 화면에 남아 있습니다. 명단 JSON 백업으로 보관해 주세요.', true);
      return false;
    }
  }
  function render() {
    let offset = 0;
    const groups = prizes.map(tier => {
      const body = rows.slice(offset, offset + tier.people).map((row, localIndex) => {
        const index = offset + localIndex, label = `${tier.rank}등 ${row.slot}번째`;
        return `<tr><th scope="row">${row.slot}</th><td><input type="text" data-recipient-index="${index}" data-recipient-field="name" maxlength="${MAX_NAME}" value="${esc(row.name)}" placeholder="이름" aria-label="${label} 이름" autocomplete="off"></td><td><input type="tel" inputmode="tel" data-recipient-index="${index}" data-recipient-field="phone" maxlength="${MAX_PHONE}" value="${esc(row.phone)}" placeholder="전화번호" aria-label="${label} 전화번호" autocomplete="off"></td></tr>`;
      }).join('');
      offset += tier.people;
      return `<section class="recipient-group"><h3>${tier.rank}등 · ${esc(tier.label)} <small>${tier.people}명${tier.detail ? ` · ${esc(tier.detail)}` : ''}</small></h3><table class="recipient-table"><thead><tr><th scope="col">순번</th><th scope="col">이름</th><th scope="col">전화번호</th></tr></thead><tbody>${body}</tbody></table></section>`;
    }).join('');
    root.innerHTML = `<div class="recipient-book"><h2>상품 수령 기록</h2><p class="hint">${remote ? '이름·전화번호는 인증된 클라우드 진행실에 저장되며 공개 스크린에는 표시되지 않습니다.' : '이름·전화번호는 현재 브라우저에만 자동 저장되며 프로젝션에는 표시되지 않습니다. 다른 PC·브라우저와 공유되지 않습니다.'}</p><p class="recipient-progress">${progressText()}</p><div class="recipient-actions buttons"><button type="button" data-recipient-action="json">명단 JSON 백업</button><label class="file-label">명단 JSON 불러오기<input type="file" accept=".json,application/json" data-recipient-action="import" aria-label="명단 JSON 불러오기"></label><button type="button" data-recipient-action="csv">CSV 내보내기</button>${onSave ? '<button type="button" data-recipient-action="retry">클라우드에 다시 저장</button>' : ''}</div><p class="recipient-status" role="status" aria-live="polite" data-error="${Boolean(error)}">${esc(message)}</p><p class="hint">JSON은 입력 원문을 보존합니다. CSV는 전화번호 앞에 텍스트용 작은따옴표를, 수식으로 읽힐 수 있는 값 앞에 보호 탭을 붙입니다. Excel의 데이터 → 텍스트/CSV에서 전화번호 열을 텍스트로 지정해 불러오세요.</p>${groups}</div>`;
  }
  function importJson(text) {
    if (destroyed) return false;
    let imported;
    try { imported = parse(text); }
    catch (reason) { notify(`${reason.message} 현재 명단과 기존 저장값은 변경하지 않았습니다.`, true); return false; }
    rows = imported; revision++;
    persist('명단을 불러와 이 브라우저에 저장했습니다.'); render();
    return true;
  }
  function exportJson() { return JSON.stringify(snapshot(), null, 2); }
  function csvCell(value, phone = false) {
    let text = String(value);
    let start = 0;
    while (start < text.length && (text.charCodeAt(start) <= 32 || text.charCodeAt(start) === 127 || /[\s'"]/.test(text[start]))) start++;
    const risky = /^[=+\-@＝＋－＠]/u.test(text.slice(start)) || /^[\t\r\n]/.test(text);
    if (phone && text) text = `'${text}`;
    if (risky) text = `\t${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
  function exportCsv() {
    const labels = new Map(prizes.map(tier => [tier.rank, tier.label]));
    const output = [['등수', '상품', '순번', '이름', '전화번호'], ...rows.map(row => [`${row.rank}등`, labels.get(row.rank), row.slot, row.name, row.phone])];
    return '\uFEFF' + output.map((row, index) => row.map((value, column) => csvCell(value, index > 0 && column === 4)).join(',')).join('\r\n') + '\r\n';
  }
  function download(text, type, filename) {
    let url;
    try {
      const doc = root.ownerDocument || globalThis.document;
      url = URL.createObjectURL(new Blob([text], { type }));
      const link = doc.createElement('a'); link.href = url; link.download = filename;
      doc.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify(`${filename} 다운로드를 요청했습니다.`);
    } catch {
      if (url) URL.revokeObjectURL(url);
      notify('파일을 저장하지 못했습니다. 브라우저의 다운로드 설정을 확인해 주세요.', true);
    }
  }
  function input(event) {
    if (destroyed) return;
    const element = event.target, index = Number(element.dataset?.recipientIndex), field = element.dataset?.recipientField;
    if (!Number.isInteger(index) || index < 0 || index >= rows.length || !['name', 'phone'].includes(field)) return;
    const value = element.value;
    if (typeof value !== 'string' || value.length > (field === 'name' ? MAX_NAME : MAX_PHONE) || /\0/.test(value)) {
      element.value = rows[index][field]; notify('이름은 100자·전화번호는 50자 이내로 입력해 주세요.', true); return;
    }
    rows[index] = { ...rows[index], [field]: value }; revision++;
    persist();
  }
  function click(event) {
    if (destroyed) return;
    const target = event.target.closest?.('[data-recipient-action]') || event.target;
    if (target.disabled) return;
    if (target.dataset?.recipientAction === 'json') download(exportJson(), 'application/json;charset=utf-8', 'OX-상품수령기록.json');
    else if (target.dataset?.recipientAction === 'csv') download(exportCsv(), 'text/csv;charset=utf-8', 'OX-상품수령기록.csv');
    else if (target.dataset?.recipientAction === 'retry' && onSave) persist();
  }
  async function change(event) {
    if (destroyed || event.target.dataset?.recipientAction !== 'import') return;
    const input = event.target, file = input.files?.[0]; if (!file) return;
    const request = ++importGeneration, startRevision = revision;
    try {
      if (file.size > MAX_JSON_LENGTH) throw Error('100KB 이내의 명단 JSON 파일을 선택해 주세요.');
      const text = await file.text();
      if (destroyed || request !== importGeneration) return;
      if (revision !== startRevision) { notify('파일을 읽는 동안 명단이 변경되었습니다. 다시 불러와 주세요.', true); return; }
      importJson(text);
    } catch (reason) { if (!destroyed && request === importGeneration) notify(reason.message || '명단 파일을 읽지 못했습니다.', true); }
    finally { input.value = ''; }
  }
  try {
    if (store === undefined) store = globalThis.localStorage;
    if (!store?.getItem) throw Error('storage unavailable');
    const raw = store.getItem(STORAGE_KEY);
    if (raw !== null) { rows = parse(raw); saved = !pending; message = pending ? '전송하지 못한 입력을 복원했습니다. 명단을 확인한 뒤 클라우드에 다시 저장을 눌러 주세요.' : remote ? '클라우드의 명단을 불러왔습니다.' : '이 브라우저에 저장된 명단을 불러왔습니다.'; }
  } catch {
    restoreError = true;
    message = '저장된 명단을 읽지 못했습니다. 기존 저장값은 보존했습니다. 새로 입력하거나 JSON을 불러오면 그 내용으로 저장합니다.';
    error = message;
  }
  render();
  root.oninput = input; root.onclick = click; root.onchange = change;
  return {
    exportJson, importJson, exportCsv,
    get snapshot() { return snapshot(); },
    get state() { return { saved, restoreError, error, total: rows.length, filled: rows.filter(row => row.name || row.phone).length }; },
    destroy() {
      destroyed = true; importGeneration++;
      if (root.oninput === input) root.oninput = previous.oninput;
      if (root.onclick === click) root.onclick = previous.onclick;
      if (root.onchange === change) root.onchange = previous.onchange;
    },
  };
}
