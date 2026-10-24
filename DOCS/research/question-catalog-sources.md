---
title: 문제은행 70개 선별과 난이도·출처
tags: [project/ox-quiz, question-bank, research]
updated: 2026-10-24
status: complete
---

# 문제은행 70개 선별과 난이도

[후보 데이터](../../questions/catalog.json)는 기존 행사 문제집과 별도의 선택용 자료다. 기존 메인31개·번외33개는 변경하지 않는다. 진행자는 난이도·주제로 후보를 좁힌 뒤 원하는 문항만 선택해 편집 초안으로 가져온다.

## 이번 선별 결과

초기 후보70개 중18개는 **ID와 지문을 그대로 유지**하고 난이도를 부여했다. 단위 기호 맞히기·반복되는 태양계 순서·황당한 국가/분야 오답 등52개는 삭제하고, **새 ID를 가진52개**로 교체했다. 총70개이며 전기 전용 주제는 없다. 특정 행사·개인·현재 직책·변동 통계에 의존하지 않는 일반 행사 문제를 지향한다.

| 주제 | 개수 | 하 / 중 / 상 | O / X |
|---|---:|---:|---:|
| 과학 | 8 | 0 / 5 / 3 | 4 / 4 |
| 자연 | 8 | 4 / 3 / 1 | 5 / 3 |
| 우주 | 7 | 0 / 4 / 3 | 2 / 5 |
| 지리 | 7 | 0 / 4 / 3 | 3 / 4 |
| 역사 | 6 | 1 / 3 / 2 | 3 / 3 |
| 문학·언어 | 7 | 1 / 4 / 2 | 5 / 2 |
| 수학 | 7 | 2 / 2 / 3 | 2 / 5 |
| 스포츠 | 7 | 2 / 1 / 4 | 5 / 2 |
| 예술·문화 | 6 | 0 / 5 / 1 | 3 / 3 |
| 기술 | 7 | 0 / 4 / 3 | 3 / 4 |
| 합계 | 70 | 10 / 35 / 25 | 35 / 35 |

- **하10개**: 성인 행사에서 설명 없이 접근할 수 있는 워밍업. 생물의 통념·기본 수학·널리 알려진 문화/스포츠 지식 중심이다.
- **중35개**: 익숙한 대상의 관계·원리·오해를 묻는다. 단순히 용어 하나를 아는지보다 비교와 구분을 요구한다.
- **상25개**: 산 높이의 기준·로그·확률·평균 속력·경기 예외·기술 작동 원리 등 추가 지식이나 짧은 추론이 필요하다.
- 난이도는 일반 성인 대상 편집 판단이다. 전공자나 해당 분야 애호가는 다르게 느낄 수 있으므로 진행자가 행사 구성에 맞춰 선택한다.
- 모든 지문은75자 미만이다. 수학 문제는 독립·균등한 생일 분포, 같은 이동 거리 등 판정에 필요한 조건을 지문과 해설에 명시했다.
- 정답35/35의 균형을 맞췄으며, 주제나 난이도가 정답을 예측하는 신호가 되지 않도록 한다.
- 수학7개는 정의·반례·직접 계산이 근거다. 나머지63개는 공식 기관 URL을 제공한다.

## ID 변경 기록

### 유지18개

- `catalog-nature-001`
- `catalog-nature-002`
- `catalog-nature-003`
- `catalog-nature-005`
- `catalog-nature-007`
- `catalog-history-001`
- `catalog-history-002`
- `catalog-history-003`
- `catalog-language-002`
- `catalog-language-003`
- `catalog-math-001`
- `catalog-math-002`
- `catalog-math-007`
- `catalog-sports-004`
- `catalog-sports-005`
- `catalog-sports-007`
- `catalog-culture-002`
- `catalog-culture-004`

유지 문항의 지문·정답은 변경하지 않았다. 기존 `문화·생활` 표시 주제만 범위가 넓어진 `예술·문화`로 묶었다.

### 삭제52개

| 기존 ID | 개수 | 삭제 이유 |
|---|---:|---|
| `catalog-electricity-001`–`007` | 7 | 단위·접두어의 기본 암기와 전기 분야 편중 |
| `catalog-science-001`–`007` | 7 | SI 기본단위·물 CO₂·금 Ag 등 지나치게 쉬운 판별 |
| `catalog-nature-004`, `006` | 2 | 바다거북 포유류·돌고래 아가미 등 쉬운 분류 오답 |
| `catalog-space-001`–`007` | 7 | 반복 행성 순서·크기와 태양을 행성으로 제시한 오답 |
| `catalog-geography-001`–`007` | 7 | 대양 크기 반복·뻔한 국가/대륙 오답 |
| `catalog-history-004`–`007` | 4 | 로마 앙코르·그리스 스톤헨지·멕시코 기자 등 쉽게 배제되는 오답 |
| `catalog-language-001`, `004`–`007` | 5 | 세종·명칭 뜻과 문학상 수상자를 엉뚱한 분야로 바꾼 오답 |
| `catalog-math-003`–`006` | 4 | 초급 도형·20%·음수 제곱·분수 덧셈 |
| `catalog-sports-001`–`003`, `006` | 4 | 종목 이름에 인원이 들어간 문항과 오륜 고리6개 |
| `catalog-culture-001`, `003`, `005`–`007` | 5 | 김장 정의·국가 바꾸기·택견을 피아노 기법으로 제시한 오답 |

삭제된 ID는 새 사실에 재사용하지 않는다. 신규 범위는 과학101–108, 자연101–103, 우주101–107, 지리101–107, 역사101–103, 문학·언어101–105, 수학101–104, 스포츠101–104, 예술101–104, 기술101–107이다. 실제 식별자는 아래 표와 데이터 파일을 따른다.

## 문항별 공식 출처

2026-10-24에 공식 웹 문서·공식 검색 색인·공식 연구 및 소장품 자료를 확인했다. 원문 문단·사진을 복제하지 않고 사실에 근거해 지문과 해설을 작성했다.

| 문항 ID | 난도 | 답 | 근거 |
|---|---|---|---|
| `catalog-science-101` | 중 | X | [NASA, Apollo 15 망치와 깃털 낙하 실험](https://science.nasa.gov/resource/the-apollo-15-hammer-feather-drop-2/) |
| `catalog-science-102` | 중 | O | [USGS, Water Density](https://www.usgs.gov/water-science-school/science/water-density) |
| `catalog-science-103` | 중 | O | [Royal Society of Chemistry, Carbon](https://periodic-table.rsc.org/element/6/carbon) |
| `catalog-science-104` | 중 | O | [NIST, Temperature scales; 변환식 직접 계산](https://www.nist.gov/pml/owm/si-units-temperature) |
| `catalog-science-105` | 상 | X | [Corning Museum of Glass, Does glass continue to flow?](https://info.cmog.org/node/631) |
| `catalog-science-106` | 상 | O | [USGS, pH and Water](https://www.usgs.gov/water-science-school/science/ph-and-water) |
| `catalog-science-107` | 중 | X | [U.S. Nuclear Regulatory Commission, Atom](https://www.nrc.gov/education-regulatory-research/glossary/atom) |
| `catalog-science-108` | 상 | X | [NOAA, Can the ocean freeze?](https://oceanservice.noaa.gov/facts/oceanfreeze.html) |
| `catalog-nature-001` | 하 | X | [NOAA, 산호의 분류](https://oceanservice.noaa.gov/facts/coral.html) |
| `catalog-nature-002` | 하 | O | [NOAA, 가장 큰 어류](https://oceanservice.noaa.gov/facts/bigfish.html) |
| `catalog-nature-003` | 하 | O | [NOAA, 해마의 번식](https://oceanservice.noaa.gov/facts/seahorse.html) |
| `catalog-nature-005` | 중 | O | [NOAA Fisheries, 상어의 특징](https://www.fisheries.noaa.gov/feature-story/12-shark-facts-may-surprise-you) |
| `catalog-nature-007` | 하 | O | [NOAA Fisheries, Blue Whale](https://www.fisheries.noaa.gov/species/blue-whale) |
| `catalog-nature-101` | 상 | O | [Smithsonian Ocean, Cephalopods circulatory system](https://ocean.si.edu/ocean-life/invertebrates/octopuses-squids-and-relatives) |
| `catalog-nature-102` | 중 | X | [FDA, Helpful Honey Bees](https://www.fda.gov/animal-veterinary/animal-health-literacy/helping-agricultures-helpful-honey-bees) |
| `catalog-nature-103` | 중 | X | [USGS, Are bats blind?](https://www.usgs.gov/faqs/are-bats-blind?items_per_page=6&page=1&qt-news_science_products=0) |
| `catalog-space-101` | 상 | O | [NASA, Venus Facts](https://science.nasa.gov/venus/venus-facts/) |
| `catalog-space-102` | 중 | X | [NASA, Venus Facts](https://science.nasa.gov/venus/venus-facts/) |
| `catalog-space-103` | 중 | X | [NASA, Moon Facts](https://science.nasa.gov/moon/facts/) |
| `catalog-space-104` | 중 | X | [NASA, The Solar System — Jovian rings](https://science.nasa.gov/learn/basics-of-space-flight/chapter1-2/) |
| `catalog-space-105` | 중 | X | [NASA, Asteroid Facts](https://science.nasa.gov/solar-system/asteroids/facts/) |
| `catalog-space-106` | 상 | X | [NASA, What is the North Star?](https://science.nasa.gov/solar-system/what-is-the-north-star-and-how-do-you-find-it/) |
| `catalog-space-107` | 상 | O | [NASA, Sun Facts](https://science.nasa.gov/sun/facts/) |
| `catalog-geography-101` | 중 | X | [NOAA, Water Cycle — fresh water storage](https://www.noaa.gov/education/resource-collections/freshwater/water-cycle) |
| `catalog-geography-102` | 중 | O | [Geoscience Australia, Deserts](https://www.ga.gov.au/scientific-topics/national-location-information/landforms/deserts) |
| `catalog-geography-103` | 상 | X | [NOAA, What is the highest point on Earth?](https://oceanservice.noaa.gov/facts/highestpoint.html) |
| `catalog-geography-104` | 상 | O | [NOAA, Highest point — base-to-peak height](https://oceanservice.noaa.gov/facts/highestpoint.html) |
| `catalog-geography-105` | 중 | O | [NASA, Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html) |
| `catalog-geography-106` | 중 | X | [NOAA NESDIS, Changing of the Seasons](https://www.nesdis.noaa.gov/our-environment/solar-phenomena/changing-of-the-seasons) |
| `catalog-geography-107` | 상 | X | [NOAA Ocean Exploration, How big is the Pacific Ocean?](https://origin.oceanexplorer.noaa.gov/ocean-fact/pacific-size/) |
| `catalog-history-001` | 중 | O | [UNESCO, Taj Mahal](https://whc.unesco.org/en/list/252/) |
| `catalog-history-002` | 하 | O | [UNESCO, Historic Sanctuary of Machu Picchu](https://whc.unesco.org/en/list/274/) |
| `catalog-history-003` | 중 | X | [UNESCO, The Great Wall](https://whc.unesco.org/en/list/438/) |
| `catalog-history-101` | 중 | X | [University of Utah, From Jikji to Gutenberg 연구 기록](https://jikji.utah.edu/) · [추가 근거](https://attheu.utah.edu/facultystaff/rejuvenate-refocus-and-reconnect-with-research/) |
| `catalog-history-102` | 상 | O | [University of Oxford, Our history — 1096 evidence of teaching](https://www.ox.ac.uk/about/the-university/history) |
| `catalog-history-103` | 상 | X | [British Museum, Rosetta Stone — two languages and three scripts](https://www.britishmuseum.org/blog/eight-lgbtq-objects-celebrate-pride) |
| `catalog-language-002` | 하 | O | [국립한글박물관, 상설 전시](https://www.hangeul.go.kr/exhi/dailyExhibition.do?curr_menu_cd=0102010000) |
| `catalog-language-003` | 중 | O | [국립한글박물관, 상설 전시](https://www.hangeul.go.kr/exhi/dailyExhibition.do?curr_menu_cd=0102010000) |
| `catalog-language-101` | 중 | X | [국사편찬위원회 우리역사넷, 훈민정음 해례본](https://contents.history.go.kr/mobile/ts/view.do?levelId=ts_b32) |
| `catalog-language-102` | 중 | X | [Bibliothèque nationale de France, Le petit prince 작품 서지](https://catalogue.bnf.fr/ark:/12148/cb11962706k) |
| `catalog-language-103` | 중 | O | [Library of Congress, Rabindranath Tagore](https://blogs.loc.gov/catbird/2017/02/rabindranath-tagore-a-great-indian-poet-and-writer/) |
| `catalog-language-104` | 상 | O | [Nobel Prize, Facts on the Nobel Prize in Literature](https://www.nobelprize.org/prizes/facts/facts-on-the-nobel-prize-in-literature/) |
| `catalog-language-105` | 상 | O | [국사편찬위원회 우리역사넷, 훈민정음](https://contents.history.go.kr/mobile/kc/view.do?code=kc_age_30&levelId=kc_r300900) |
| `catalog-math-001` | 하 | O | 정의·반례·직접 계산(문항 해설에 과정 기재) |
| `catalog-math-002` | 하 | X | 정의·반례·직접 계산(문항 해설에 과정 기재) |
| `catalog-math-007` | 중 | X | 정의·반례·직접 계산(문항 해설에 과정 기재) |
| `catalog-math-101` | 상 | O | 정의·반례·직접 계산(문항 해설에 과정 기재) |
| `catalog-math-102` | 중 | X | 정의·반례·직접 계산(문항 해설에 과정 기재) |
| `catalog-math-103` | 상 | X | 정의·반례·직접 계산(문항 해설에 과정 기재) |
| `catalog-math-104` | 상 | X | 정의·반례·직접 계산(문항 해설에 과정 기재) |
| `catalog-sports-004` | 하 | O | [World Athletics, Marathon](https://worldathletics.org/disciplines/race-walks/marathon) |
| `catalog-sports-005` | 중 | X | [USA Table Tennis, Scoring and Games](https://www.usatt.org/rules-of-table-tennis) |
| `catalog-sports-007` | 하 | O | [ITF, Tennis Glossary](https://www.itftennis.com/en/about-us/organisation/tennis-glossary/) |
| `catalog-sports-101` | 상 | O | [IFAB, Law 11.3 — No offence](https://www.theifab.com/laws/latest/offside/) |
| `catalog-sports-102` | 상 | O | [FIVB, Basic Rules](https://www.fivb.com/volleyball/the-game/basic-rules/) |
| `catalog-sports-103` | 상 | O | [World Athletics, Certified Road Events — elevation drop](https://worldathletics.org/records/certified-roadevents) |
| `catalog-sports-104` | 상 | X | [World Athletics, 100 Metres — wind legal limit](https://worldathletics.org/disciplines/jumps/100-metres) |
| `catalog-art-101` | 중 | X | [Musée du Louvre, Mona Lisa](https://www.louvre.fr/en/explore/the-palace/from-the-mona-lisa-to-the-wedding-feast-at-cana) |
| `catalog-art-102` | 상 | X | [Musée Rodin, The Thinker](https://www.musee-rodin.fr/en/musee/collections/oeuvres/penseur-meudon) |
| `catalog-art-103` | 중 | X | [The Metropolitan Museum of Art, Under the Wave off Kanagawa](https://www.metmuseum.org/art/collection/search/45434) |
| `catalog-art-104` | 중 | O | [Vatican Museums, Sistine Chapel vault and Last Judgement](https://www.museivaticani.va/content/museivaticani/en/collezioni/musei/cappella-sistina/volta.html) · [추가 근거](https://www.museivaticani.va/content/museivaticani/en/collezioni/musei/cappella-sistina/giudizio-universale.html) |
| `catalog-culture-002` | 중 | O | [UNESCO, Tango](https://ich.unesco.org/en/rl/tango-00258) |
| `catalog-culture-004` | 중 | O | [UNESCO, Reggae music of Jamaica](https://ich.unesco.org/en/RL/reggae-music-of-jamaica-01398?call=film&id=45069&include=film_inc.php&width=700) |
| `catalog-technology-101` | 중 | X | [CERN, First International Conference on the World-Wide Web](https://home.cern/first-international-conference-on-the-world-wide-web/) |
| `catalog-technology-102` | 중 | O | [DENSO WAVE, Error Correction Feature](https://www.qrcode.com/en/about/error_correction.html) |
| `catalog-technology-103` | 중 | O | [Bluetooth SIG, Origin of the Bluetooth Name](https://www.bluetooth.com/bluetooth-origin/) |
| `catalog-technology-104` | 상 | X | [GPS.gov, Address, Route, and Map Problems](https://archive.gps.gov/support/user/mapfix/) |
| `catalog-technology-105` | 상 | O | [ESA, How satellite navigation works](https://www.esa.int/Applications/Satellite_navigation/Galileo/First_Galileo_Launch/How_satellite_navigation_works) |
| `catalog-technology-106` | 중 | X | [Chromium, An Update on the Lock Icon](https://blog.chromium.org/2023/05/an-update-on-lock-icon.html?m=1) |
| `catalog-technology-107` | 상 | X | [Python, Data Structures — Tuples and Sequences](https://docs.python.org/3/tutorial/datastructures.html?highlight=list+append) |

## 사실 판정과 검토 경계

- **산 높이**: 해발고도, 지구 중심에서의 거리, 해저 밑동부터 높이를 구분한다. 서로 다른 기준을 섞지 않는다.
- **금성의 하루**: 지문은 태양일이 아닌 한 바퀴 자전하는 주기를 묻는다.
- **pH**: 수소 이온의 활동도를 기준으로 한 로그 관계다. 단순한 용액 부피나 총 산의 양을 뜻하지 않는다.
- **창유리**: 오래된 창의 두께 차이를 중력에 의한 상온 흐름으로 설명하는 통념을 묻는다. 고온 점성이나 특수 재료의 모든 변형을 부정하는 문항이 아니다.
- **스포츠**: 골킥은 ‘직접 받는 경우’, 배구는 ‘실내6인제’, 육상은 ‘세계기록 공인’ 조건이다. 친선전 변형 규칙과 구분한다. 경기 규칙은 확인일 기준이다.
- **GPS**: 도로 지도와 위성의 위치 계산용 신호를 구분한다. 시계 오차를 포함한 일반적인3차원 위치 계산 조건을 명시한다.
- **파이썬 튜플**: 원소 위치에 새 값을 대입하는 것과 튜플 내부의 가변 객체가 바뀌는 것을 구분한다.
- **생일 확률·평균 속력**: 생일은 윤일을 제외한365일에 독립·균등하게 분포, 왕복은 같은 거리·정차 없음이라는 수학적 가정이다.
- 일부 UNESCO 상세 페이지는 자동 접근에 인증 화면을 반환했다. 기존 유지 항목인 탱고·레게는 공식 검색 색인에서 등록 내용을 확인했고 접근 제어를 우회하지 않았다. 박물관 등의 본문 접근이 제한되는 경우에도 공식 기관의 검색 색인이나 소장품 자료를 근거로 사용했다.
- 출처 확인은 문항 사실의 근거다. 실제 행사 참가자의 체감 난도나 현장10초 리허설을 수행했다는 뜻은 아니다. 선택·저장·공개 화면 분리의 검증은 별도 UI/통합 검증 기록으로 관리한다.

## 이력

초기2026-10-24 후보70개는10분야×7, O35/X35의 기본 상식 구성이었다. 사용자가 너무 쉬운 문항을 삭제하고 상·중·하로 구분하도록 요청해 이번에18유지·52교체로 선별했다. 초기 후보의 검증 기록·이전 커밋은 당시 증거로 보존하고 현재 난도와 사실 구성의 검증으로 대신 사용하지 않는다.
