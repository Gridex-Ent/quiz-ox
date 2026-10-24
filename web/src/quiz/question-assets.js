const imageFields = ['imageData', 'imageAlt', 'imageSource', 'imageCredit', 'imageLicense', 'imageLicenseUrl', 'imageReveal'];

// 알려진 이전 이미지 전체가 일치할 때만 교체한다. 문항 내용·순서·사용자 사진은 보존한다.
export function refreshQuestionImages(questions, updates) {
  return questions.map(question => {
    const update = updates.find(item => item.fromImageData && item.fromImageData === question.imageData);
    if (!update) return question;
    const result = { ...question };
    for (const key of imageFields) {
      if (Object.hasOwn(update.image, key)) result[key] = update.image[key];
      else delete result[key];
    }
    return result;
  });
}
