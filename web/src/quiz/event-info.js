export const DEFAULT_EVENT_INFO = Object.freeze({
  name: 'OX 퀴즈',
  date: '',
  venue: '',
  message: '함께 즐기는 손들기 퀴즈',
});

const FIELDS = ['name', 'date', 'venue', 'message'];

export function validateEventInfo(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== FIELDS.length
    || FIELDS.some(key => !Object.hasOwn(value, key) || typeof value[key] !== 'string')) {
    throw Error('행사명·날짜·장소·안내 문구를 문자열로 입력해 주세요.');
  }
  value = Object.fromEntries(FIELDS.map(key => [key, value[key].trim()]));
  if (!value.name || value.name.length > 80) throw Error('행사명은1~80자로 입력해 주세요.');
  if (value.venue.length > 120) throw Error('장소는120자 이내로 입력해 주세요.');
  if (value.message.length > 200) throw Error('안내 문구는200자 이내로 입력해 주세요.');
  if (value.date) {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value.date) && !value.date.startsWith('0000-')
      ? new Date(`${value.date}T00:00:00.000Z`) : null;
    if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value.date) {
      throw Error('날짜는 올바른 YYYY-MM-DD 형식으로 입력하거나 비워 주세요.');
    }
  }
  return Object.fromEntries(FIELDS.map(key => [key, value[key]]));
}
