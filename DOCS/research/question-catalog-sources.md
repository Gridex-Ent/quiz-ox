---
title: 문제은행 후보 70개 출처와 편집 기준
tags: [project/ox-quiz, question-bank, research]
updated: 2026-10-24
status: complete
---

# 문제은행 후보 70개

[후보 데이터](../../questions/catalog.json)는 기존 행사 문제집과 별도의 선택용 자료다. 기존 메인31개·번외33개를 늘리거나 교체하지 않고, 진행자가 선택해 가져올 때만 편집 초안에 추가하는 것을 전제로 작성했다.

## 구성과 문항 계약

- 10분야 각각7개, 총70개다. 정답은 O35개·X35개다.
- 안정된 `catalog-분야-번호` ID, 문제·주제·O/X 보기·정답·10초·해설·출처를 제공한다.
- 수학7개는 정의와 직접 계산을 근거로 하고, 나머지63개는 해당 사실을 설명하는 공식 기관의 URL을 `sources`에 넣었다. `source`는 출처 제목을 짧게 나타낸다.
- 연도에 따라 바뀌는 인물 직책·통계, 개인 나이·등록자 수, 노래 재생이나 사진이 필요한 문항은 제외했다. 과거 노벨상 수상 연도처럼 확정된 역사적 사실은 포함했다.
- 보기·정답·해설을 자체 문장으로 작성했다. 자료 원문의 문단이나 이미지·가사는 복제하지 않았다.
- 기존 메인/번외 문항과 공백·기본 문장부호를 제거해 비교한 결과, 같은 문장인 항목은0개다. 전기 단위 등 주제가 유사한 후보는 있을 수 있다.

| ID 분야 | 표시 주제 | 개수 | O / X | 기준 |
|---|---|---:|---:|---|
| electricity | 전기 | 7 | 4 / 3 | SI 단위·접두어·에너지와 전력의 구분 |
| science | 과학 | 7 | 3 / 4 | SI·빛의 진공 전파·물과 금의 기호 |
| nature | 자연 | 7 | 4 / 3 | 생물 분류·번식·호흡 |
| space | 우주 | 7 | 3 / 4 | 행성의 순서·크기·분류 |
| geography | 지리 | 7 | 4 / 3 | 대양 면적·바다 비율·호수와 협곡 위치 |
| history | 역사 | 7 | 3 / 4 | 세계유산의 시대·문명·건립 목적 |
| language | 문학·언어 | 7 | 4 / 3 | 훈민정음·확정된 노벨문학상 수상 기록 |
| math | 수학 | 7 | 3 / 4 | 정수·도형·분수·백분율의 정의와 계산 |
| sports | 스포츠 | 7 | 4 / 3 | 정식 경기의 인원·거리·점수·상징 |
| culture | 문화·생활 | 7 | 3 / 4 | 무형문화유산과 식문화 |

## 공식 근거

2026-10-24에 공식 웹 문서·공식 자료의 검색 색인 내용을 확인했다. 각 문항의 `sources`가 개별 근거의 원본 URL이며, 아래 표는 검토 범위를 묶어 설명한다.

| 범위 | 주요 자료 | 확인한 내용 |
|---|---|---|
| 전기001–007·과학001–004 | [NIST SI 단위와 접두어](https://www.nist.gov/pml/special-publication-811/nist-guide-si-chapter-4-two-classes-si-units-and-si-prefixes), [NIST 단위 변환표](https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9) | A·V·Ω·W·Hz·kg·K·N·s·m, kilo=1,000, kWh는 에너지 |
| 과학005–007 | [NASA 빛과 진공](https://science.nasa.gov/big-idea-2-3-intermediate-level-guiding-question/), [NIH PubChem Water](https://pubchem.ncbi.nlm.nih.gov/compound/water), [왕립화학회 Gold](https://periodic-table.rsc.org/element/79/Gold) | 빛의 매질 불필요, H₂O, Au |
| 자연001–005 | [NOAA 산호](https://oceanservice.noaa.gov/facts/coral.html), [고래상어](https://oceanservice.noaa.gov/facts/bigfish.html), [해마](https://oceanservice.noaa.gov/facts/seahorse.html), [바다거북](https://www.fisheries.noaa.gov/sea-turtles), [상어](https://www.fisheries.noaa.gov/feature-story/12-shark-facts-may-surprise-you) | 동물/어류/파충류 구분, 수컷 해마의 출산, 상어의 연골 골격 |
| 자연006–007 | [NOAA 해양생물 자료](https://repository.library.noaa.gov/view/noaa/37757/noaa_37757_DS1.pdf), [NOAA Blue Whale](https://www.fisheries.noaa.gov/species/blue-whale) | 돌고래의 폐 호흡, 흰긴수염고래 크기 |
| 우주001–007 | [NASA Planets](https://science.nasa.gov/solar-system/planets/), [Solar System Facts](https://science.nasa.gov/solar-system/solar-system-facts/) | 행성 순서·목성 크기·내행성의 암석형 분류·항성인 태양 |
| 지리001–007 | [NOAA 대양 면적](https://www.noaa.gov/jetstream/ocean), [대양 구분](https://oceanservice.noaa.gov/facts/howmanyoceans.html), [UNESCO 바이칼호](https://whc.unesco.org/en/list/754/), [그랜드캐니언](https://whc.unesco.org/en/list/75/) | 태평양 최대/북극해 최소, 바다 약71%, 남극해의 위치, 두 지형의 소재지 |
| 역사001–003 | [UNESCO 타지마할](https://whc.unesco.org/en/list/252/), [마추픽추](https://whc.unesco.org/en/list/274/), [만리장성](https://whc.unesco.org/en/list/438/) | 묘당의 목적, 잉카 유적, 여러 시대에 걸친 만리장성 건설 |
| 역사004–007 | [UNESCO 앙코르](https://whc.unesco.org/en/list/668/), [스톤헨지](https://whc.unesco.org/en/list/373/), [베르사유](https://whc.unesco.org/en/list/83/), [멤피스와 피라미드](https://whc.unesco.org/en/list/86/) | 크메르·선사 거석·프랑스 왕실·이집트의 구분 |
| 문학·언어001–004 | [국립한글박물관 상설 전시](https://www.hangeul.go.kr/exhi/dailyExhibition.do?curr_menu_cd=0102010000), [국사편찬위원회 훈민정음](https://contents.history.go.kr/mobile/kc/view.do?code=kc_age_30&levelId=kc_r300900) | 세종·28자·자음17자·명칭 뜻 |
| 문학·언어005–007 | Nobel Prize [2024](https://www.nobelprize.org/prizes/literature/2024/summary/), [2016](https://www.nobelprize.org/prizes/literature/2016/summary/), [1913](https://www.nobelprize.org/prizes/literature/1913/summary/) | 한강·밥 딜런·타고르의 문학상 수상 |
| 수학001–007 | 외부 인용 없음 | 정의·반례·곱셈·분수의 통분으로 해설에 계산 과정 기재 |
| 스포츠001–004 | [IFAB 축구 인원](https://www.theifab.com/laws/latest/the-players/), [FIBA 농구 기본 규칙](https://assets.fiba.basketball/image/upload/documents-corporate-wabc-coaches-manual-eng.pdf), [FIVB 배구 규칙](https://www.fivb.com/volleyball/the-game/basic-rules/), [World Athletics 마라톤](https://worldathletics.org/disciplines/race-walks/marathon) | 일반 11인제·5인제·6인제의 인원,42.195km |
| 스포츠005–007 | [USA Table Tennis](https://www.usatt.org/rules-of-table-tennis), [IOC Olympic rings](https://www.olympics.com/ioc/olympic-rings), [ITF Tennis Glossary](https://www.itftennis.com/en/about-us/organisation/tennis-glossary/) | 10대10 이후2점 차 승리·다섯 고리·love=0 |
| 문화·생활001–007 | 각 문항의 UNESCO 등록 자료·공식 제출자료, [일본 농림수산성 Washoku](https://www.maff.go.jp/e/policies/market/washoku-world-challenge/en/learning_01.html) | 김장·탱고 공동 등재·스페인 플라멩코·자메이카 레게·택견 무예·일본 와쇼쿠·이탈리아 나폴리 피자 장인 |

## 검토 경계

일부 UNESCO 무형문화유산 상세 페이지는 자동 접근 시 인증 화면을 반환했다. 해당 항목은 접근 제어를 우회하지 않고 공식 검색 색인·등재 결정 PDF·공식 제출자료·일본 농림수산성 자료로 확인했다. 문화·생활003과005가 사용하는 UNESCO PDF는 같은 자료집의 서로 다른 항목을 근거로 한다.

경기 인원 문항에는 11인제·5인제·실내6인제 조건을 지문에 넣었고, 탁구 문항은10대10 이후 조건을 명시했다. 경기 규칙은 자료 확인일 기준이며 변형 경기나 친선전의 별도 규칙을 묻는 문항이 아니다. 백분율 문항은 변경된 가격을 기준으로 두 번째 비율을 계산한다.

이 문서는 후보 작성 근거다. 실제 선택·중복 처리·초안 보존·서버 저장·공개 화면 분리의 검증 결과는 별도 UI/통합 검증 기록에서 관리한다.
