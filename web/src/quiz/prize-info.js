export const MAX_PRIZE_BYTES = 4 * 1024 * 1024;

const MAX_DATA_URI_LENGTH = 6 * 1024 * 1024;
const FIELDS = ['imageData', 'imageAlt', 'caption'];
const startsWith = (bytes, prefix, offset = 0) => prefix.every((value, index) => bytes.charCodeAt(offset + index) === value);

export function validatePrizeInfo(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== FIELDS.length
    || FIELDS.some(key => !Object.hasOwn(value, key) || typeof value[key] !== 'string')) {
    throw Error('상품 이미지·대체 설명·안내 문구를 확인해 주세요.');
  }
  const imageAlt = value.imageAlt.trim(), caption = value.caption.trim();
  if (imageAlt.length > 100 || caption.length > 200) throw Error('이미지 설명은100자, 안내 문구는200자 이내로 입력해 주세요.');
  if (value.imageData.length > MAX_DATA_URI_LENGTH) throw Error('상품 이미지는4MiB 이하의 내장 이미지여야 합니다.');
  const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value.imageData);
  if (!match || match[2].length % 4 !== 0) throw Error('PNG·JPEG·WebP·GIF 내장 이미지 형식을 확인해 주세요.');
  const [type, base64] = match.slice(1);
  const size = base64.length / 4 * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  if (size < 1 || size > MAX_PRIZE_BYTES) throw Error('상품 이미지는4MiB 이하여야 합니다.');
  let bytes;
  try { bytes = atob(base64); }
  catch { throw Error('상품 이미지의 base64 형식을 확인해 주세요.'); }
  if (bytes.length !== size || btoa(bytes) !== base64) throw Error('상품 이미지의 base64 형식을 확인해 주세요.');
  const valid = type === 'png' ? startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])
    : type === 'jpeg' ? startsWith(bytes, [255, 216, 255])
      : type === 'gif' ? bytes.startsWith('GIF87a') || bytes.startsWith('GIF89a')
        : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (!valid) throw Error('상품 이미지의 실제 파일 형식과 확장자가 다릅니다.');
  return { imageData: value.imageData, imageAlt, caption };
}
