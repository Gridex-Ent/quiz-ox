---
title: 수동 퀴즈 클라우드 진행실
tags: [설계, project/ox-quiz, cloud]
created: 2026-10-22
updated: 2026-10-22
status: deployed
---

# 수동 퀴즈 클라우드 진행실

> [!important] 2026-10-24 클라우드 전용 범용화
> 최신 모듈/저장 계약은 [원격 통합·범용 행사 설계](../planning/github-sync-2026-10-24.md)를 우선한다. 일반/번외10초·노래 무타이머, O주먹/X보자기, 행사 정보와 상품 이미지의 독립 revision/CAS 저장 및 이미지 전송 캐시를 추가했다. 아래 최초 설계/배포는 당시 단계의 이력이다.

## 누적 추가 — 메인30·31번 파이썬·대한전기학회 로고

사용자 요청 ‘파이썬의 로고는 뱀 두마리이다. / O’를 띄어쓰기만 다듬어 메인30번에 추가한다. 기존29문항은 번호·순서·시간을 포함한 전체 객체를 그대로 보존하고,1번X·2번O·제주어·전기국가도 유지한다. PSF 공식 페이지의 두 뱀 설명과 원본 PNG로 확인하며, 로고는 정답 공개 시 함께 표시한다. 문제/출처/메모·이미지의 작성 데이터와 두 seed, 재생성 HTML만 소유 범위로 두고 기존 모델/API/UI 인터페이스는 바꾸지 않는다.

후속 요청 ‘대한전기학회 로고는 전압, 전류, 저항으로 만들어졌다. / X’를31번에 누적 추가한다. 공개 해설은 전압과 저항의 조합이며, 공식 CI 설명에 따라 전압 단위 볼트(V)와 저항 단위 옴(Ω)을 포갠 모양이라고 구체화한다. 공식 PNG 원본을 정답 공개 후 표시한다. [대한전기학회 CI 소개](https://www.kiee.or.kr/pages_introduce/ci.vm). 기존30개 전체 객체·순서를 유지하고 같은 데이터/seed 책임과 기존 공개 인터페이스를 재사용한다.

단계는 현재29개/대문/초안 백업 → 공식 로고 원본 확보·출처 기록 → 두 seed와 실제 두 은행 뒤30·31번 append·전체prefix 보존 검사 → 두 빌드/회귀 → main만 배포 → 두 문항 주제2초·5초 자동/미공개 로고 숨김·30번O→31번X와 로고 공개·최종 종료·대문 복원 검증이다. 중간30개 저장/배포는 별도 이력이며 최종 완료 기준은31개다. 번외33·기존 명단/음향/키·가동/인증·자정 예약은 유지한다.

구현·검증·운영 반영 완료: 기존29개 전체 객체·시간과 순서/중간Python30개를 정확히 보존한 두 실제31개 은행 저장·재접속을 확인했다.140개 회귀·두 빌드31개·데이터 전이 검사를 통과하고 main00011-rqp를 배포했다. 실제30번O와 공식Python로고→31번전기주제/문제→X와V·Ω 해설/공식CI→종료→대문을 검증했다.1366×768·1920×1080의31번 정답 화면에 잘림이 없었다. [최종 검증](../validation/2026-10-22/main-python-logo.md).

## 사용자 지정 시작1·2번 문항 — 2026-10-22

사용자가 제공한 ‘심재웅 교수는 사회자보다 나이가 많다.’를 정답X로 메인1번에 넣고, 후속 요청 ‘올해 전력기술부문회는 사전등록인원이 520명 이상이다.’를 정답O로2번에 넣는다. 기존27개는 같은 순서로3~29번이 된다. 첫 주제는 워밍업 고정이며 두 시작 문항 모두 기존 주제2초·문제10초 자동 타이머를 사용한다. 순서에 따른 시간 정규화로 원래4·5번이 새6·7번이 되면10초에서5초로 바뀐다. 그 외 기존 문구·정답·사진·노래·메모·출처는 보존한다. 두 문항은 사용자 제공 정답을 저장하며 실제 나이·생년월일·행사 등록 수를 별도로 추정하지 않는다.

변경 책임은 두 문항 작성 원본과 독립 offline/cloud seed에 국한한다. 기존 편집기 JSON 가져오기/저장과 모델/presentation 공개 인터페이스를 그대로 사용한다. 단계는 현재 은행/대문/초안 확인·백업 → 첫 두 문항 삽입·위치별 시간 검증 → HTML/cloud 재생성·검사 → 실제 두 은행에 저장·새로고침 → main만 배포 →1번 워밍업/X·다음2번 사전등록/O·3번 기존 문항 전환·대문 복원과 기록이다.1번만 넣었던 중간28개 상태도 별도 백업하고 최종은29개로 검증한다. 기존33개 번외·수령 기록·음향·키·인증·상시 실행/예약은 유지한다.

완료: 최종29개·회귀140개·두 빌드와 위치별 타이머 검증 통과. 실제 두 은행29개 저장/재접속과 원래27개 전체 객체(위치에 따른 시간 두 건 제외)·순서 보존을 UI 백업으로 확인했다. main00009-5mp 반영 후1번 워밍업10초/X→2번10초/O→3번 기존 AI 문제와 대문 복원을 확인했다. [최종 검증](../validation/2026-10-22/main-first-warmup.md).

## 메인 제주어6개·전기국가1개 — 2026-10-22

사용자 정정에 따라 제주 방언6개는 번외에 넣지 않고 본게임 기존20개 뒤21~26번으로 추가한다. 이어 사용자 제공 ‘전기국가’ 문항을27번으로 넣는다. 두 선택지는 A전력/B전기이며 기존 엔진의 choiceO/choiceX에 대응시키고 정답은 내부X·표시‘전기’다. 공식 제주어 자료와 기후에너지환경부2026년 자료로 뜻·정책 용어를 확인한다.

책임은 추가 문항 데이터(문제/정답/공개해설/출처/관리자note), 기존 offline/cloud seed(서로 다른20개 순서·전체 객체를 각각 보존해7개 append), 기존 standalone 편집기/저장(실제 적용 은행과 미저장 초안을 먼저 퀴즈 전용 백업 후 JSON 가져오기/저장), 공통 모델/presentation(기존 메인 주제2초·후반5초·직접정답·관리자메모 비공개)로 분리한다. 공개 함수·서버/API·상태 형식은 변경하지 않는다. 별도 작성 원본 `main-additions-2026-10-22.json`은 빌드가 직접 참조하지 않으며 최종 seed에 반영한다.

단계는 공식 근거/현재 은행·초안 확인 → 계획/대시보드 → 추가 데이터와 seed prefix 보존 검사·20개 고정 문구 일반화 → 검사/HTML·cloud 생성 → 실제 local/cloud UI에서 기존20+추가7 저장·새로고침 → main 이미지 반영 → 메인21~27 선택·O/X/전기 정답·5초/비공개메모 검증과 대문 복원이다. 기존 apply는 index0/ready로 바뀌므로 현재 대문/index0임을 확인하고 작업한다. 미저장 초안이 있으면 적용 은행과 별도로 보존한다. 보너스33·명단·인증·상시 실행·자정 예약은 변경하지 않는다.

구현·검증·운영 반영 완료:140개·린트·두 빌드 통과, 실제 두 은행27개 저장/재접속 후 기존20 prefix 전체 객체와 새7개 일치를 UI 백업으로 확인했다. main00007-f8d를 배포하고 공개 screen00002-crf를 유지했다. 실제21번O→22번X 순차 출제/수동정답과27번 ‘전기’ 정답·최종 종료/대문 복귀를 확인했다. 초기 선택 요청 한 번의 abort 후 재연결 관찰을 포함한 범위와 한계는 [검증](../validation/2026-10-22/main-jeju-policy.md)에 기록했다.

## 사용자 제공 전기 OX 드립7개 — 2026-10-22 후속 추가

사용자가 보낸7문항의 문구·OX 정답·진행 멘트를 그대로 `user-electric-ox` 그룹에 추가한다. 본게임20개와 기존 번외26개는 보존한다. 데이터 모듈이 `kind: ox`, 정답 O/O/X/X/X/O/X, 비공개 `hostNote`, `source.kind: user-provided`를 소유한다. `runbook.js`는 사용자 제공 출처를 파일 복원 출처와 구분하고 기존 `createSavedRunbookQuestion(id)`로5초 번외를 만든다. 기존 공개 인터페이스·모델·서버·스크린을 재사용하며 멘트는 공개 해설에 복사하지 않는다.

단계: 문서/기존26개 보존 해시 → 데이터/출처 분기와 기존 비공개 경계 검사 확장 → 단독 HTML·클라우드 재생성/검사 → 진행실 이미지만 배포 → 실제 O/X 문제 출제·정답·멘트 비공개·본게임 복귀 → 대시보드 갱신. 기존 인증·영속 은행·상시 실행/자정 예약은 변경하지 않는다.

구현·검증·운영 반영 완료: 수동91개·클라우드49개 총140개와 린트·두 빌드 통과. main `ox-manual-quiz-00006-889` Ready·트래픽100%, 공개 스크린 `00002-crf` 유지. 실제 HTTPS에서 전기1번 O/전기3번 X의 출제·만료 후 정답 대기·직접 공개·멘트 비공개·본게임 대문 복귀를 확인했다. [최종 검증](../validation/2026-10-22/electric-ox-drip.md).

## 진행자 드립 번외 확장 — 2026-10-22

본게임20문항·기존 번외18개를 유지하고 런북에 별도 **진행자 드립 번외8개** 그룹을 추가한다. `questions/bonus-quiz-2026.json`은 문제·정답·공개 해설과 관리자용 `hostNote`, 새 작성 출처를 소유한다. `runbook.js`는 그룹별 주제/출처를 읽고 hostNote를 기존 관리자 전용 `note`로 변환하며, 출제 전 정답 미리보기에도 멘트를 표시한다. 기존 원문18개는 이전 파일/행 출처를 유지한다.

공개 인터페이스 `createSavedRunbookQuestion(id)`와 onQuiz/onBack은 유지한다. 공개 DTO는 현재 문제/공개된 정답·해설만 제공하고 사회자 멘트·출처·전체 번외 목록은 전달하지 않는다. 새 주관식도 기존 번외5초·수동 정답 공개·본게임 위치 복귀를 사용한다. 유사 표현을 받을 수 있는 말장난에는 관리자 메모를 함께 둔다.

단계: 기존/신규 내용·출처 분리 → 번외 데이터/메모 매핑 → 기존18개 보존·관리자 메모 비공개 경계 검사 → 단독 HTML/클라우드 생성 → 진행실에서 새 목록 선택/출제·정답·본게임 복귀 검증 → 진행실 이미지 반영·대시보드 갱신. 프로젝션 코드는 바뀌지 않으므로 별도 공개 스크린 이미지는 재배포하지 않는다. 인증·GCS 은행·자정 예약은 변경하지 않는다.

구현·검증·운영 반영 완료: 수동91개·클라우드49개 총140개, 린트와 두 빌드가 통과했다. 진행실 `ox-manual-quiz-00005-r6x`를 배포하고 공개 스크린 `00002-crf`는 유지했다. 실제 HTTPS에서 새 그룹 선택·관리자 멘트 확인·번외 출제·수동 정답 공개·본게임1/20 대문 복귀를 확인했으며, 진행자 멘트는 공개 전후 모두 스크린에 나타나지 않았다. [드립 번외 최종 검증](../validation/2026-10-22/host-drip.md).

## 대문 게임 방법 안내 — 2026-10-22 단순 확장

공통 `offline/presentation.js`의 대문에 문제/보기 확인 → 시간이 끝나면 정답 쪽 손들기 → 든 손을 유지하며 정답 공개 기다리기의3단계 안내를 추가한다. 사용자가 손드는 시점을 **타이머가 끝날 때**로 확정했으므로 카운트다운 중에는 정답을 생각하도록 표시한다. 손 방향은 참가자 본인을 기준으로 매 문제 화면을 따르며 O/X 방향을 고정하지 않는다. 순서별10초/5초 및 노래 문제 시간제한 없음 안내를 함께 표시한다. 탈락·경품 지급 규칙은 새로 정하지 않는다.

`web/offline-shell.html`이 관리자 미리보기와 projection의 반응형 크기를 소유하고, 기존 두 빌드가 같은 표시 모듈/스타일을 사용한다. 상태 모델·문항·진행실/스크린 인증·저장·자정 예약은 변경하지 않는다. 기존 문서에 계획을 갱신한 뒤 공통 표시/스타일 수정 → 단독 HTML·클라우드 재생성 → 노트북1366×768/프로젝션1920×1080·시작 전환 검증 → 두 클라우드 이미지 반영과 대시보드 갱신 순서로 진행한다.

구현·검증·운영 반영 완료: 139개 회귀·린트·두 빌드 통과, 실제 HTTPS1366×768/1920×1080의3단계/시간 규칙/잘림0 및 대문→상품→첫 문제10초 자동 전환을 확인했다. main00004-x6f·screen00002-crf Ready로 반영했고 기존 창도 새 대문으로 갱신했다. [최종 검증](../validation/2026-10-22/cover-guide.md).

## 프로젝션 Google 로그인 제거 — 2026-10-22 후속 설계

사용자 요청에 따라 프로젝션은 Google 로그인 없이 연결 링크로 접속하고, 진행실의 Google/IAP 및 PIN은 유지한다. 기존 서비스 전체의 IAP를 해제하지 않는다.

| 모듈 | 책임 / 공개 인터페이스 | 의존성 |
|---|---|---|
| `cloud/screen-server.mjs` (추가) | GET/HEAD `/`, `/screen`, `/screen.js`, GET `/api/screen/state`만 허용하는 읽기 전용 화면 게이트웨이. 관리자·명단·문제 은행·쓰기 요청은 제공하지 않음 | 기존 screen 빌드, 서버 간 인증, 원래 공개 DTO API |
| 서버 간 인증 (추가) | 전용 스크린 실행 계정의 짧은 수명 JWT를 IAM Credentials로 서명. audience는 기존 `/api/screen/state` URL에 한정. 개인 계정/서비스 계정 키 파일을 저장하지 않음 | 자기 계정 signJwt 및 기존 퀴즈 IAP 접근만 부여 |
| `cloud/server.mjs` 연결 주소 | 선택적 공개 스크린 origin을 관리자 envelope의 screenPath에만 적용. 화면 키·진행실 인증·상태 엔진은 유지 | 기존 manual service, 명시적 PUBLIC_SCREEN_URL |
| 자정 예약 | 고정 허용 목록에 새 스크린 서비스도 추가하여 같은 시각 min0/요청 CPU로 전환. 기존 서비스 권한은 유지 | 기존 일회성 Task→Workflow, 퀴즈 두 서비스만 |

GCP 조직 정책이 허용하면 **새 스크린 서비스만** 공식 공개 Cloud Run 방식으로 열고, 회사 정책 자체는 변경하지 않는다. 스크린 링크의 긴 연결 키는 그대로 유지한다. 게이트웨이는 관리자 PIN/세션/GCS 원본을 받지 않고 공개 DTO만 전달하며, 브라우저 쿠키·임의 헤더·요청 경로를 upstream에 중계하지 않는다. 원래 서비스가 서버 권위 주제/타이머와 정답 공개를 계속 계산한다.

단계: 정책·공식 서버 간 인증 확인 → 화면 전용 게이트웨이/주소 모듈 및 자정 확장 구현 → 무권한·쓰기·미공개 정답 차단과 실패 경계 검사 → 격리 패키지 빌드/실제 배포 → 쿠키 없는 HTTP와 실제 두 화면 전환 검증 → 자료 보존·예약·대시보드 갱신. 실제 허용 여부나 배포/검증은 별도 근거로 기록한다.

정책 실조회: `run.managed.requireInvokerIam` effective=false, 기존 DRS는 회사 고객1개 제한을 유지하며 새 managed DRS는 enforce=false다. preview `run.requireInvokerIam`은 NOT_FOUND로 기록했다. 회사 정책을 변경하지 않고 새 서비스의 invoker IAM 검사만 공식 공개 방식으로 설정한다. 전용 계정은 자기 signJwt 단일권한, 기존 퀴즈 IAP 접근, 스크린 키 비밀1개 접근만 가지며 GCS/관리자 PIN/Run 제어 권한은 없다. [공식 공개 방식과 DRS](https://docs.cloud.google.com/run/docs/authenticating/public), [IAP 서비스 계정 JWT](https://docs.cloud.google.com/iap/docs/authentication-howto#authenticate_with_a_service_account_jwt).

구현·배포·실제 무로그인 검증 완료: 화면 `ox-manual-screen-00001-dtz`와 진행실 `ox-manual-quiz-00003-dd5` Ready, 쿠키/Google 인증 없는 화면200·키 API200·관리자404·진행실 IAP 유지, CUA 실제 상품/워밍업/문제/정답 동기화 확인. 최신 클라우드49개·린트·빌드 통과, 기존 수동90개 결과 유지. 자정 workflow000004-58d는 두 서비스 고정 목록으로 확장하고 실제 양쪽 dry-run 접수까지 확인했다. fresh GCS20문항/빈 명단28칸 및 기존 서비스10개 불변을 확인했다. [최종 공개 검증](../validation/2026-10-22/public-screen.md).

목표는 핸드폰 진행실에서 현재 손들기 퀴즈를 제어하고 노트북/프로젝터가 같은 문제·주제·타이머·정답을 표시하는 것이다. 기존 참가자 휴대폰 게임으로 전환하지 않는다. 기존 단독 HTML과 사용자 맞춤 문제를 보존한다.

## 모듈·책임·공개 인터페이스

| 모듈 | 소유 책임 / 공개 인터페이스 | 의존성 |
|---|---|---|
| offline/manual-model.js | 기존 createState/transition/validateQuestions/secondsLeft 그대로 재사용 | 순수 함수 |
| offline/presentation.js | makePublicView(state, now), renderQuizStage(view, {prizeImage, tiers}) | 모델의 분류/선택지. DOM/네트워크 없음 |
| cloud/manual-service.mjs | 서버가 단일 상태·주제/타이머·revision·명령중복·은행version 관리 | 수동 모델, presentation, store |
| cloud/store.mjs | 로컬 원자적 파일 또는 GCS별도JSON객체의 load/save(expectedGeneration) | 기존 ox.sqlite 객체와 분리, 저장 완료 후 성공 응답 |
| cloud/server.mjs | 로그인·세션·권한·HTTP 제어/상태·인증된 진행실 HTML·공개 스크린 | NodeHTTP, 수동 서비스/저장 |
| web/src/cloud/transport.js | createCloudTransport({onState,onStatus,onConnection}), connect/send/saveBank/loadRecipients/saveRecipients | 동일 출처 fetch, revision 기반 재연결·중복 방지 |
| web/src/cloud/screen.js | 스크린 키로 공개 상태 구독·공통stage렌더·노트북 음향 활성화 | 공개 DTO만. 전체 문제/정답/번외 목록 번들 금지 |
| offline/standalone.js | 기존 진행/편집/런북을 클라우드 transport에 연결, 모바일 버튼/연결상태 | 로컬 동작은 계속 지원 |
| tools/build-cloud.mjs·cloud Dockerfile·deploy | 관리자/스크린 분리 빌드·명시적GCP대상 배포 | 기존 Dockerfile/실시간 앱 유지 |

서버 권위 상태와 클라이언트 표시를 분리한다. 서버는 기존 전이를 실행해 마감 시각을 정하고 화면은 서버 시각 오프셋으로 카운트다운한다. 상태 폴링은 revision이 같으면304이며 전체 은행은 bankVersion이 달라질 때만 전송한다. 주제2초/10·5초/노래무타이머/워밍업/번외 복귀를 유지한다.

관리자는 PIN 로그인 후 HttpOnly 세션으로 매 요청 인증한다. 스크린 키는 읽기 전용이며 URL fragment로 전달한 뒤 요청 헤더로 사용한다. 스크린에 전체 questions/mainState·진행 메모·미공개 정답/해설·정답 후 사진을 전달하지 않는다. 관리자HTML 및 전체문제 번들은 관리자 세션 없이 제공하지 않는다. 음향은 노트북 스크린의 명시적 소리 켜기 이후 재생해 휴대폰에서 중복 울리지 않게 한다.

## 단계별 완료 기준

1. **설계:** 모듈/프로토콜·저장/권한 경계 기록. 실제배포 프로젝트 확인·인증갱신은 별도 진행.
2. **구현:** 서버권위 제어, 휴대폰반응형 진행실·프로젝션, 편집저장/가져오기, 런북, 상태복원. 기존개인명단은 자동 업로드하지 않는다.
3. **자동 검증:** 정답비노출·무권한제어거부·중복명령·stale revision·저장실패·재시작 복원·주제/타이머/번외 회귀.
4. **실제UI:** 별도폰크기 진행실→별도스크린 동기화, 새로고침/연결복원, 저장/순서, 모바일 터치배치. 사용자 맞춤20문항은 백업으로 보존한 뒤 이관한다.
5. **배포:** 정확한GCP프로젝트와 유효인증 확보 후 명시적서비스/영속객체로HTTPS배포·실제URL두화면검증. 배포가 불가하면 구현/로컬검증과 실제외부URL 미반영을 구분한다.

기존gcloud기본프로젝트는퀴즈대상근거가없어선택하지않는다. 로컬디스크를CloudRun영속저장으로취급하지않으며 프로덕션은GCS설정과 성공한저장이필수다. 기존 서비스·전역gcloud설정·Git작업내용은보존한다.

## 구현 결과와 남은 범위

### CompanyInfo 대상 배포 준비 — 후속 선택

사용자가 배포 프로젝트로 **companyinfo**를 선택했다. 기존 기록의 후보 ID는 `gridex-companyinfo`이며 live projects.describe로 이름/번호/ACTIVE를 확인한 뒤 리소스 쓰기를 시작한다. 현재 gcloud 재인증을 사용자가 완료할 수 있도록 Google 로그인 화면을 열었다. 프로젝트 미선택 단계는 종료됐고, 정확한 클라우드 메타데이터 확인과 인증 갱신이 남았다.

배포 모듈의 추가 공개 입력은 선택적 `BuildServiceAccount`다. 지정 시 같은 프로젝트의 빌드 계정을 Cloud Build `serviceAccount`에 명시하고 런타임 계정과 분리한다. GCS 버킷은 raw 메타데이터의 projectNumber·리전·UBLA·명시적 PAP를 검사해 다른 회사 저장소나 ACL 공개 버킷을 재사용하지 않는다. 퀴즈 전용 Cloud Run/AR/상태·소스 버킷/빌드·런타임 계정/두 Secret만 필요한 범위로 준비하고 기존 CompanyInfo 서비스·DB·권한·전역 gcloud 설정은 보존한다. 단계는 사전계획/패키지 검사 → 본인 재인증/실제 조회 → 전용 리소스 준비 → 배포/HTTPS 검증이다.

실제 Artifact Registry describe는 JSON stdout과 Encryption/Repository Size 안내 stderr를 함께 출력한다. 배포 어댑터는 성공 시 stdout만 파서로 전달하고 실패 시 stderr를 포함한 오류를 유지한다. 이 구분은 PowerShell의 실제 NativeCommand ErrorRecord 타입으로 처리하고 실제 read-only 사전 조회로 확인한다.

서버·인증·읽기 전용 스크린·휴대폰 진행실·공통 표시·별도 빌드/배포 패키지를 구현했다. 맞춤20개 전체 문제 객체를 실제 GUI 백업에서 초기 seed로 이관했고, 기존 GCS 저장값이 있으면 seed로 덮어쓰지 않는다. 문제 편집 초안은 오프라인 키와 분리하며 서버 ACK 후 확정 목록을 갱신한다. 저장 중 추가 입력도 보존한다.

명단은 별도 revision의 인증 API로 저장한다. 전송 중/실패한 입력은 탭별 sessionStorage에 보관하여 다른 진행자 탭의 초안과 충돌하지 않는다. 새로고침 복원·수동 재시도·충돌 시 JSON 백업/명시적 복원을 제공하고 서버 ACK 전 창 닫기 경고를 표시한다. 이 임시 보관은 탭을 닫은 뒤의 영구 백업을 뜻하지 않는다. 네트워크 오류 후 재시도는 최신 명단 revision이 같은 경우에만 전송하며, 달라졌으면 기존 입력을 비교하도록 안내한다. 늦은 명단 로드/런북 전환은 현재 페이지 요청과 일치할 때만 반영한다.

실제 IAB의 390×844 진행실과 별도 1366×768·1920×1080 스크린에서 전환·저장/재접속·번외/음향을 확인했다. 자동/로컬 UI 결과와 외부 클라우드·실제 휴대폰/프로젝터 검증은 분리한다. 사용자는 후속으로 CompanyInfo를 선택했으며, 현재 Google 본인인증이 필요해 실제 대상 조회와 HTTPS 배포는 미반영이다. [검증 기록](../validation/2026-10-22/manual-cloud.md), [배포 런북](../planning/manual-cloud-deploy.md).

- 배포 전 저장 지연 보완: GCS 클라이언트의 HTTP 요청 제한은 5초, 재시도 예산은 10초·최대 1회로 제한한다. 설치된 Storage 8.1.0의 `timeout`은 밀리초, `retryOptions.totalTimeout`은 초이며 저장·조회 모두에 적용한다. 백그라운드 tick은 한 건만 진행해 느린 저장 중 100ms 작업을 계속 쌓지 않는다. 폴링 요청의 서버 tick·CAS·저장 후 ACK·명령 중복 방지는 유지한다. [공식 재시도 설정](https://docs.cloud.google.com/storage/docs/retry-strategy), [요청 기반 CPU 할당](https://docs.cloud.google.com/run/docs/configuring/billing-settings).
- 모바일 응답 크기: 일반 진행 명령의 성공 ACK에는 변경되지 않은 사진 포함 문제 은행을 생략한다. `apply`는 새 은행을 전달하며, 중복 명령의 복구 응답은 최신 은행을 포함해 캐시를 안전하게 맞춘다.

## 자정 상시 실행 해제 — 2026-10-22 후속 설계

PC 전원과 무관하게 **2026-10-23 00:00 KST (`2026-10-22T15:00:00Z`)** 이후 `gridex-companyinfo`(953995790322)·`asia-northeast3`·`ox-manual-quiz`의 최소 인스턴스만 서비스/리비전 모두 0으로, CPU는 요청 시 할당(`cpuIdle: true`)으로 전환한다. 이는 서비스 삭제나 접근 차단을 뜻하지 않으며 요청은 계속 받을 수 있다.

| 모듈 | 책임 / 공개 인터페이스 | 의존성 |
|---|---|---|
| `deploy/prepare-manual-night-stop.mjs` | 명시적 `--project gridex-companyinfo`만 허용. 고정 자정의 일회성 Cloud Tasks REST 요청과 dry-run 실행 본문을 로컬 생성 | Node 표준 라이브러리만. 인증·클라우드 쓰기 없음 |
| `deploy/manual-night-stop.yaml` | `main(args)`에서 대상·정지 시각 하드 가드 → 최신 Run v2 GET → 제한된 PATCH → 결과 GET 검증. `dryRun: true` 및 자정 전 호출은 `validateOnly: true` PATCH로 리소스 변경 없이 검증 요청 | Workflows `ox-manual-night-stop`, 실행 SA `ox-manual-stop` |
| Cloud Tasks `ox-manual-ops` | 고정 시각에 Workflows executions.create를 OAuth로 호출. 토큰은 실행 시 발급하며 비밀·사용자 로그인 토큰을 저장하지 않음 | 호출 SA `ox-manual-task`, 같은 프로젝트. 실행 IAM의 지원 범위·최소 권한은 별도 감사 |

PATCH는 최신 `etag`와 최신 컨테이너 배열 전체를 사용하고 첫 컨테이너의 `resources.cpuIdle`만 바꾼다. 필드 마스크는 `scaling.minInstanceCount,template.scaling.minInstanceCount,template.containers`로 제한한다. 이미지·환경변수·Secret 참조·리소스 한도·다른 컨테이너와 최대 인스턴스, IAP/공개 여부·서비스 IAM은 유지한다. 중복 실행은 같은 목표값을 다시 적용하며 동시 배포 충돌은 etag로 실패시켜 덮어쓰지 않는다. PATCH 커넥터는 `skip_polling: true`로 리전 전체 operations 조회를 생략하고 해당 서비스 GET만 최대 10분간 5초 간격으로 조회하여 목표값·reconciling=false·성공 조건·generation 일치를 확인한다. Workflows 생성 접수 성공과 실제 Run 변경 완료는 구분하여 실행 결과를 확인한다. [공식 skip_polling 설정](https://docs.cloud.google.com/workflows/docs/invoke-connector-to-gcp-service).

단계는 **설계 → 로컬 스키마/시간/본문/설정 보존 검증 → root의 전용 IAM/API/워크플로 준비와 실제 dry-run → root의 예약 생성·조회 → 자정 이후 실행 및 Run 설정 확인**이다. 이 모듈 작성 단계에서는 클라우드를 조회하거나 변경하지 않는다. API/IAM/예약의 운영 반영은 root가 단독 수행한다. [Tasks 생성·OAuth](https://docs.cloud.google.com/tasks/docs/create-tasks), [Execution 생성](https://docs.cloud.google.com/workflows/docs/reference/executions/rest/v1/projects.locations.workflows.executions/create), [Run PATCH 커넥터·LRO](https://docs.cloud.google.com/workflows/docs/reference/googleapis/run/v2/projects.locations.services/patch), [Run etag](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services).

로컬 검증 완료: YAML 파싱·표현식 길이·분기 대상, JS 문법·ESLint·diff 검사, 고정 대상/UTC·KST 시각/OAuth/base64 이중 JSON/중복 task ID/시각 경과 거부, 자정 전·명시적 dry-run 가드와 최신 컨테이너의 환경·Secret 참조·이미지·한도·sidecar 및 서비스 IAP·최대 인스턴스·traffic 보존을 실제 소스 표현식으로 검사했다. 결과 파일은 `data/manual-night-stop/`에 로컬 생성했다. 이 결과는 GCP의 YAML 컴파일·실제 IAM·예약 접수·자정 실행 성공을 확인한 결과와 구분한다.

dry-run의 완료 한계: 공식 Run v2 PATCH의 `validateOnly`는 리소스를 갱신하지 않는다. 실제 워크플로 시험에서 요청은 HTTP 200으로 접수됐으나 `done:false`였고, 커넥터의 후속 operation GET은 404를 반환했다. 이 결과만으로 검증 작업의 수명이나 404 원인을 확정하거나 최종 검증 성공으로 해석하지 않는다. dry-run은 `skip_polling:true`로 초기 응답을 받고, 오류가 있으면 실패한다. 오류 없이 `done:true`인 경우에만 `DRY_RUN`·`validationCompleted:true`·`patchValidated:true`, 미완료인 경우에는 `DRY_RUN_ACCEPTED`·`validationAccepted:true`·`validationCompleted:false`·`patchValidated:false`와 `operationName`을 반환한다. 이 접수 결과만으로 이미지 다운로드·런타임 권한을 포함한 모든 비동기 검증 완료를 주장하지 않는다. 실제 자정 변경은 기존 서비스 GET 완료 판정을 유지하며, 접수 성공·예약 등록·자정 변경 완료는 각각 별도로 확인한다. [공식 validateOnly 정의](https://docs.cloud.google.com/run/docs/reference/rest/v2/projects.locations.services/patch).
