# Codex 작업 인계 — OX Quiz Cloud

최신 갱신: 2026-10-24 / 상태: 클라우드 전용 구현·로컬 검증 완료 / GitHub main 발행·검증 완료

## 현재 목표와 보존 범위

활성 앱은 클라우드 전용으로 정리한다. 진행실에서 행사명·날짜·장소·안내 문구를 저장하고 대문·종료에 반영한다. 참가자는 시간이 흐르는 동안 생각하고 **시간이 끝나면 O는 주먹·X는 보자기**로 손을 든 뒤 정답까지 모양을 유지한다. 선택형 첫 번째 보기는 주먹, 두 번째 보기는 보자기다.

기존 메인31문항·번외33개·사진11문제·상품과28칸 수령 기록·음향/공식 YouTube·수동 답·기존 저장/API 인터페이스를 보존한다. 첫 워밍업2초·일반/번외 모두10초·노래 무타이머를 유지한다. 기본31문항은 기존 사용자의 행사 문제집이며 행사 정보와 별도로 편집한다.

## Git 보존과 작업 경계

- 원격: [Gridex-Ent/quiz-ox](https://github.com/Gridex-Ent/quiz-ox)
- 통합 브랜치: `codex/cloud-events-20261024`
- 통합 기준: 원격4커밋을 포함한 `f20163a34c28d6b83cd279885ea8a24a514674a3`
- 원본 기준: `main`의 `ee085c992ace385a6e3b0c8a00803ce2a69027ee`와 최신 미커밋31문항/클라우드 작업
- 원본 백업: ignored `data/git-sync/20261024-011222` 및 해당 보존 작업의 Git bundle
- 현재는 격리 통합 작업이다. 원본 작업 폴더·백업·기존 원격 커밋을 보존하고 코드 b7f9e9c을 정상 push해 원격 main에서 확인했다.

원시 상태·수령 명단·실PIN/스크린 키·토큰·개발 접근 파일·Git bundle은 발행 대상에서 제외한다. 활성 문서의 계정은 운영자 계정 자리표시자로 쓰고 개인 계정/절대 사용자 경로를 넣지 않는다.

## 현재 구조

### 선택형 문제은행 추가 — 2026-10-24

현재 후보는 초기70개 중 쉬운52개를 새 ID52개로 교체하고 유지18개에 난이도를 부여한 구성이다. 전기 전용이 아닌10개 일반 분야, 하10/중35/상25, O35/X35다. 카드 난이도와 검색·주제·정답·난이도 조합 필터 및 필터 밖 선택 수를 제공한다. `manual-model.js`의 선택적 난이도 검증과 진행실 수정/미분류·JSON/CSV·초안/서버 저장 복원을 지원하며 기존31/33은 변경하지 않았다. 현재 전체194개·lint/build와 실제1366/390 필터/가져오기/난이도 편집·저장·새로고침을 검증했다. [최신 검증](DOCS/validation/2026-10-24/question-bank-difficulty.md). 아래185개/10주제×7 기록은 최초 문제은행 구현 당시의 이력이다.

`questions/catalog.json`에 범용 후보70개(10주제×7, O35/X35)를 분리했다. `question-bank.js`의 `createQuestionBank({root,catalog,getDraft,onImport,onEdit})`는 체크·검색/주제/정답 필터·중복 방지와 최대300개 검사를 담당한다. 진행실·행사 설정·편집 영역에서 같은 탭으로 연다. 후보 선택만으로 진행 상태가 바뀌지 않으며 선택한 문제는 기존 미완성 초안 끝에 추가한 후 기존 `문제·순서 저장`으로 확정한다. 후보 전체는 공개 스크린에 번들하지 않는다. 타이머는 이 탭을 열어도 계속된다.

기존31/33 데이터 파일은 변경하지 않았다. 전체185개 검사·lint/build, 격리 로컬 서버의31→초안33→ACK33→새로고침 복원과 중복 차단,1366/390 화면 검증을 완료했다. 기존4190 상태와 Cloud 운영 문제집은 바꾸지 않았다. [검증](DOCS/validation/2026-10-24/question-bank.md), [후보 출처](DOCS/research/question-catalog-sources.md). 사용자 지시에 따라 배포하지 않는다.

| 영역 | 목표 경로와 책임 |
|---|---|
| 단일 패키지 | `ox-quiz-cloud`; workspace 기반 앱/서버 구성 제거 |
| 공통 퀴즈 | `web/src/quiz/`; 모델·행사 정보·표시·런북·명단·음향 |
| 진행실 | `web/src/quiz/presenter.js`와 `web/host-shell.html` |
| 스크린/통신 | `web/src/cloud/screen.js`, `transport.js` |
| 서버/영속 | `cloud/server.mjs`, `manual-service.mjs`, `store.mjs` |
| 별도 공개 스크린 | `cloud/screen-server.mjs`; PIN/GCS/관리자 쓰기 권한을 주지 않는 relay |
| 초기 문제집 | `questions/default.json`; 기존 cloud31개를 그대로 이관, 기존 GCS 은행 우선 |
| 빌드/컨테이너 | 클라우드 빌드와 `Dockerfile`/`cloud/Dockerfile` 중심 |

이전 실행 소스는 현재 tree에서 제외하고 ignored 보존 폴더/원본 snapshot 및 이전 커밋에 남겼다. 과거 설계/검증 문서는 historical 자료로 유지하며 활성 실행 안내는 README를 따른다. 기존의 별도 기본 문제집은 백업에 보존한다.

행사 정보는 `name/date/venue/message` 문자열을 검증한다. 이름은 필수, 날짜는 선택 `YYYY-MM-DD` 형식이다. 행사 정보 저장은 기존 진행 위치·문제 은행·명단을 보존한다. 예전 저장값에 행사 정보가 없으면 범용 기본값을 사용한다. 화면 문자열은 escape하고, 공개 DTO에 명단·진행자 메모·전체 문제집을 보내지 않는다.

## 개발·검증 계약

`npm ci` 후 `npm run dev`로 localhost:4190 개발 프로필을 실행한다. 개발 실행기는 무작위 PIN/스크린 키를 ignored `data/development/access.json`에 최초 생성하고 다음 실행에 기존 프로필 상태를 복원한다. 해당 접근 파일을 열어 PIN을 확인하며 고정 개발 PIN을 문서/소스에 넣지 않는다.

최종 scripts는 `dev/build/test/lint/start`와 `build:cloud/test:cloud/start:cloud` 호환 별칭이다. Node.js22.13 이상, 운영 GCS 의존성8.1.0을 기준으로 정리한다. 운영은 Secret Manager의 PIN/키·GCS·진행실 IAP·별도 읽기 전용 스크린 경계를 유지한다.

문제은행 추가 전 범용 행사 전환은164/164 검사·lint·build와 모바일/노트북/프로젝션 UI를 통과했다. 상품 업로드4MiB·prizeVersion·10초/노래 무타이머·똑딱·진행자 전용 팁을 포함한다. [당시 검증](DOCS/validation/2026-10-24/cloud-events.md). 난이도별 문제은행까지 포함한 현재 전체 검사는194개다. 사용자 지시로 운영 배포는 이번 범위에서 제외했다.

검증은 행사 정보 편집/저장/새로고침·대문/종료 동기화, O 주먹/X 보자기·선택형 표시, 주제2초/일반·번외 자동10초/노래 무타이머·직접 정답 공개, 런북 복귀, 명단 ACK/공개 경계와31/33 데이터 보존을 포함한다. 실제 휴대폰/프로젝터/스피커는 브라우저 크기 검사와 구분한다.

## 운영 상태와 다음 작업

사용자가 배포는 필요 없다고 명시했다. Cloud Run 배포나 인증 갱신은 진행하지 않는다. 기존 코드 커밋 b7f9e9c와 발행 확인 67617eb, README/상세 매뉴얼 00463f1은 main에 push·검증 완료했다. About 설명과 실제 GitHub의 README·이미지2개·Mermaid·상세 매뉴얼 표시도 확인했다. 운영 가동 상태의 미확인 기록은 이전 검증의 한계로 남긴다.

공개 사용 설명은 README와 DOCS/USER_GUIDE.md를 우선하고, 다음 변경도 현재 코드와 화면의 실제 동작을 대조한다.

[현재 대시보드](DOCS/index.md) · [설계](DOCS/design/manual-cloud.md) · [로드맵](DOCS/planning/roadmap.md) · [배포 절차](DOCS/planning/manual-cloud-deploy.md)

클라우드 전용 통합 기준 source commit: b7f9e9c38247ce6294d662dd8b8eff684d33da45. 당시 실제 GitHub main SHA를 확인했다. 이후 문서·문제은행 변경은 후속 커밋으로 관리한다. 유지보수는 통합 작업폴더를 기준으로 계속하며 원래 작업폴더는 원본 백업으로 남겼다. [초기 발행 영수증](DOCS/validation/2026-10-24/github-publication.json).
