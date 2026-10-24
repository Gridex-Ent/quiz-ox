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

최종164/164 검사·lint·build와 모바일/노트북/프로젝션 UI를 통과했다. 상품 업로드4MiB·prizeVersion·10초/노래 무타이머·똑딱·진행자 전용 팁을 포함한다. [최종 검증](DOCS/validation/2026-10-24/cloud-events.md). 운영 Cloud 반영은 재인증 필요 상태다.

검증은 행사 정보 편집/저장/새로고침·대문/종료 동기화, O 주먹/X 보자기·선택형 표시, 주제2초/일반·번외 자동10초/노래 무타이머·직접 정답 공개, 런북 복귀, 명단 ACK/공개 경계와31/33 데이터 보존을 포함한다. 실제 휴대폰/프로젝터/스피커는 브라우저 크기 검사와 구분한다.

## 운영 상태와 다음 작업

2026-10-24 현재 기존 Cloud Run의 실제 가동·최신 리비전·자정 예약 실행 결과는10월23일 인증 실패 이후 미확인이다. 현재 가동·정지 여부는 재확인이 필요하다. 이번 코드의 운영 배포도 별도 확인이 필요하다.

1. 소스 이동·불필요 실행기 삭제와 단일 패키지/Docker 정리를 마친다.
2. 전체 test/lint/build와 localhost:4190·두 화면 UI/저장 검증을 완료한다.
3. 발행 안전 검사 후 통합 커밋과 push 결과를 기록한다.
4. 인증 복구 후 실제 Cloud Run 상태와 새 코드 반영 여부를 조회해 별도 운영 결과로 남긴다.

[현재 대시보드](DOCS/index.md) · [설계](DOCS/design/manual-cloud.md) · [로드맵](DOCS/planning/roadmap.md) · [배포 절차](DOCS/planning/manual-cloud-deploy.md)

최신 source commit: b7f9e9c38247ce6294d662dd8b8eff684d33da45. 실제 GitHub main SHA를 확인했다. 유지보수는 통합 작업폴더를 기준으로 계속하며 원래 작업폴더는 원본 백업으로 남겼다. [발행 영수증](DOCS/validation/2026-10-24/github-publication.json).
