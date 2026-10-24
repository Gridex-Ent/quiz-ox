# 한국전력 해피 이미지

## 현재 사용 — 3D 기본형 전신 (2026-10-22 교체)

- 파일: `kepco-happy-3d.jpg`, 1272×712, 46,322바이트. 원본 JPEG를 편집하지 않고 사용한다.
- SHA-256: `1e0980422fe22e979317bdd32d8d136119e4d537c6b49e1c8c8d2d8ad54c54f3`.
- 제공 페이지: [한국전력공사 사내 극장 안내영상 캐릭터 모델링·애니메이션·렌더링 제작 포트폴리오](https://kmong.com/portfolio/view/95381).
- [이미지 원본](https://d2v80xjmx68n4w.cloudfront.net/members/portfolios/78J081699841706.jpg).
- 파란 플러그 귀·흰 얼굴·파란 몸체와 KEPCO 로고가 있는 3D 해피의 전신이다. 기존 ‘최고!’ 2D 이모티콘과 구분해 교체했다. 이미지와 공개 화면 캡션에는 정답인 캐릭터 이름을 표시하지 않는다.
- 대조 근거: [한전 공식 챗봇 해피](https://chat-online.kepco.co.kr/kepcoHappyBot/)의 [3D 얼굴](https://chat-online.kepco.co.kr/kepcoHappyBot/img/bot_face.webp), [한전ON 공식 챗봇 아이콘](https://online.kepco.co.kr/cm/images/ico-chatbot.png), [공식 마스코트 소개 팝업](https://www.kepco.co.kr/assets/images/pages/service/popup_slide/CUGBHP004_01.jpg), [제작사의 3D 기본형](https://www.cogulcontents.com/img_up/shop_pds/cogul/2021/3d1631774866.png). 공식 팝업은 이름·설명 문자가 있어 퀴즈 이미지로 사용하지 않는다.
- 이미지를 제공한 곳은 제작 포트폴리오이며, 한국전력 공식 서버가 직접 배포한 전신 원본이라고 설명하지 않는다. 별도 CC 또는 공용 라이선스를 확인하지 않았고, 이미지·캐릭터의 권리는 각 권리자에게 있다. 코드 라이선스가 이미지의 이용권을 부여하지 않는다.
- 출처 기록: [kepco-happy-3d.source.json](kepco-happy-3d.source.json). 새 자산은 문항 `imageData`와 단독 HTML에 내장한다. 기본 문제집 4번과 사용자 저장 순서의 해당 문항을 대상으로 하며, 사용자 문구·보기·정답·순서는 보존한다.

## 이전 2D 이모티콘 — 이관 비교용 보관

아래는 2026-10-21 사용했던 이미지 기록이다. `kepco-happy.gif`는 기존 브라우저 저장값과 정확히 비교해 이미지 이관 대상을 식별하기 위해 보존한다. 새 문제 화면의 재생 자산으로 사용하지 않는다.

- 파일: `kepco-happy.gif` (360 × 360, 원본 GIF)
- 캐릭터: 한국전력 해피
- 이미지 제공 페이지: [코글플래닛 — 한국전력공사 캐릭터 리터치·이모티콘 제작](https://www.cogulcontents.com/myboard/portfolio/91223)
- 원본: https://www.cogulcontents.com/img_up/shop_pds/cogul/2021/emot_012_x31631775208.gif
- 확인일: 2026-10-21
- 이미지 안에는 이름 대신 “최고!” 문구가 있으며, 파란색 해피 단독 모습이다. 원본을 편집하지 않고 퀴즈의 문제·정답 화면에 표시한다.
- 캐릭터 이름 확인: [한국전력 공식 홈페이지](https://www.kepco.co.kr/home/service/privacy/boardView.do)

이미지와 캐릭터의 권리는 각 권리자에게 있다. 이 저장소 코드의 라이선스가 이 이미지에 별도의 권리를 부여하지 않는다.

당시 실행 데이터의 `imageData`에 GIF 원본을 data URI로 넣어 오프라인으로 표시했다. 현재 사용 자산은 위 3D JPEG다.

## 상품 소개 일러스트

- 파일: `quiz-prizes.png`, 1536 × 1024, 2,631,788바이트.
- 제작일: 2026-10-21. 내장 `image_gen` 도구로 새로 생성했다.
- 용도: 시작 인사 큐에서 표시할 제주 호텔·상품권·커피·감귤 인형·마그넷·한라봉 젤리의 설명용 일러스트. 실제 호텔이나 브랜드 상품의 외형을 증명하는 사진이 아니다.
- 확인: 이미지에 가격·글자·숫자·로고가 보이지 않음을 육안으로 확인했다. 특정 호텔 이름은 쓰지 않는다. 정확한 상품명·등급·인원과 총 200만 원은 HTML 텍스트로 표시한다.
- 빌드: PNG 원본을 `prize-data.imageData`에 내장하며, 원본 상품 가격표나 외부 이미지 요청은 사용하지 않는다.

### 최종 생성 프롬프트

```text
Use case: ads-marketing
Asset type: final landscape raster illustration for an offline Korean event quiz prize introduction, displayed alongside a separate HTML prize list.
Create a beautiful polished warm editorial illustration, landscape 3:2 composition. A serene Jeju Island luxury seaside resort and turquoise ocean with palm trees in the background, no recognizable real hotel. In the foreground arrange an elegant generous curated gift display: blank cream and gold gift-certificate envelopes with ribbon, a stylish unbranded takeaway coffee cup, blank pastel gift cards, a cute generic tangerine plush family with green leaf tops, small Jeju souvenir magnets shaped like a volcanic stone grandfather and island landmarks, and hallabong citrus jelly candies in clear unbranded packaging with oranges. Cohesive premium soft 3D/clay illustration, warm ivory, coral-orange, sea turquoise and restrained golden accents, soft sunlit shadows, refined and cheerful, suitable for a large projection screen. The items must remain distinct and easy to read without clutter. All objects comfortably inside the frame. No text of any kind, no letters, no numerals, no prices, no logos, no watermark, no signage, no real brand likenesses. This is an illustrative prize overview, not a photograph or proof of actual product appearance. Opaque background.
```


## 원이와 문항 사진 — 2026-10-22

- `rescene-woni.png`: 원이의 2026-08-12 인천공항 사진, 500×750, 314,086바이트. K-POPIT 케이팝잇 촬영, [Wikimedia Commons 원본](https://commons.wikimedia.org/wiki/File:Woni_of_RESCENE_at_Incheon_Airport,_12_August_2026.png), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). 원본 PNG 바이트를 그대로 내장하며 추가 편집하지 않았다. 문제/정답 화면 아래 저작자·출처·라이선스를 표시한다.
- 테슬라·에디슨·빅스톰·페이커·한만춘·로댕·손흥민·켈빈 자료는 [사진 manifest](photos/photos-manifest.json)와 [사진 안내](photos/README.md)에 출처·저작자·이용조건·바이트·해시를 기록했다. 에디슨 및 로댕 대안 사진은 보관 자산이며 현재 실행 문항에 모두 사용하는 것은 아니다.
- 배구단 이름 로고, 켈빈 명언의 인물 사진, 생각하는 사람의 손 위치는 정답 단서이므로 정답 공개 후만 표시한다. 손흥민 사진은 2023 아시아 최우수선수상 수상 사진이며 EPL 득점왕의 증거 사진으로 설명하지 않는다.
- 새 문항 사진 8개와 기존 해피를 합쳐 9문항에 표시한다. 이미지들은 data URI로 단독 HTML에 내장되며 문제 표시 때 외부 서버에서 다시 받지 않는다.
