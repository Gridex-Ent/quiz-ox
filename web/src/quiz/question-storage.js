// 적용 목록과 편집 내용을 한 번에 저장한다. 사진은 기존 문항을 참조해 중복하지 않는다.
export function encodeQuestionStore(questions, left, draft = questions) {
  const result = { questions, left };
  if (JSON.stringify(draft) !== JSON.stringify(questions)) {
    const base = questions.map(q => Object.fromEntries(Object.entries(q).map(([key, value]) => [key, JSON.stringify(value)])));
    result.editorDraft = draft.map(q => {
      const values = Object.fromEntries(Object.entries(q).map(([key, value]) => [key, JSON.stringify(value)]));
      let best = { value: q }, size = JSON.stringify(best).length;
      questions.forEach((source, from) => {
        const set = Object.fromEntries(Object.entries(q).filter(([key]) => values[key] !== base[from][key]));
        const remove = Object.keys(source).filter(key => !Object.hasOwn(q, key));
        const patch = { from, ...(Object.keys(set).length ? { set } : {}), ...(remove.length ? { remove } : {}) };
        const length = JSON.stringify(patch).length;
        if (length < size) { best = patch; size = length; }
      });
      return best;
    });
  }
  return JSON.stringify(result);
}

export function restoreQuestionDraft(saved, questions) {
  if (!saved?.editorDraft) return structuredClone(questions);
  if (!Array.isArray(saved.editorDraft) || !saved.editorDraft.length) throw Error('보관된 편집 내용을 읽지 못했습니다.');
  const check = q => {
    const strings = ['text', 'choiceO', 'choiceX', 'answer', 'explanation'];
    const metadata = ['topic', 'category', 'review', 'note', 'source', 'imageData', 'imageAlt', 'imageSource', 'imageCredit', 'imageLicense', 'imageLicenseUrl', 'imageReveal', 'musicTitle', 'musicYoutubeId', 'kind', 'openAnswer', 'timerMode'];
    if (strings.some(key => typeof q[key] !== 'string') || !Number.isInteger(q.seconds) || metadata.some(key => q[key] !== undefined && typeof q[key] !== 'string') || (q.sources !== undefined && (!Array.isArray(q.sources) || q.sources.some(value => typeof value !== 'string')))) throw Error('보관된 편집 내용을 읽지 못했습니다. 저장된 문제는 유지합니다.');
    return q;
  };
  return saved.editorDraft.map(entry => {
    if (!entry || typeof entry !== 'object') throw Error('보관된 편집 내용을 읽지 못했습니다.');
    if (entry.value && typeof entry.value === 'object' && !Array.isArray(entry.value)) return check(structuredClone(entry.value));
    if (!Number.isInteger(entry.from) || !questions[entry.from] || (entry.set && (typeof entry.set !== 'object' || Array.isArray(entry.set))) || (entry.remove && !Array.isArray(entry.remove))) throw Error('보관된 편집 내용을 읽지 못했습니다.');
    const q = { ...structuredClone(questions[entry.from]), ...structuredClone(entry.set || {}) };
    for (const key of entry.remove || []) delete q[key];
    return check(q);
  });
}
