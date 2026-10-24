---
title: OX Quiz Cloud 대시보드
tags: [MOC, project/ox-quiz, cloud]
status: in-progress
created: 2026-09-16
updated: 2026-10-24
---

# OX Quiz Cloud

휴대폰 진행실과 노트북 스크린을 서버 상태로 연결하는 클라우드 전용 퀴즈다. 행사명·날짜·장소·안내 문구를 설정하고, 참가자는 시간이 끝나면 **O 주먹·X 보자기**로 답한다. 메인31문항·번외33개·상품·명단·음향·수동 정답 공개를 유지한다.

## 현재 작업

| 상태 | 항목 | 근거 / 다음 작업 |
|---|---|---|
| 완료 | 클라우드 전용 소스·패키지 정리 | `ox-quiz-cloud`, 단일 패키지와 cloud 서버 중심으로 변경. 기존 실행 경로를 현재 tree에서 제외하고 원본 snapshot/이력 보존 |
| 구현·검증 완료 | 행사 정보 설정 | 행사명·날짜·장소·안내 문구를 서버에 저장하고 대문/종료에 반영. 날짜는 선택 입력 |
| 구현·검증 완료 | 주먹/보자기 참여 안내 | O/첫 번째 보기=주먹, X/두 번째 보기=보자기. 시간이 끝나면 손들고 정답까지 유지 |
| 검증 완료 | 행사/상품 저장 경계 | revision/CAS/ACK·초안/충돌/복원, 이미지4MiB·prizeVersion 캐시와 공개 단계 제한 |
| 보존 검증 완료 | 메인31·번외33·사진11 | 기존 문구·정답·순서·사진/영상·진행자 메모 보존. 기본31문항은 default.json에 통합, seconds만 일반/번외10초로 변경 |
| 보존 검증 완료 | 상품·28칸 명단·음향·수동 정답 | 서버 ACK·충돌 처리와 비공개 명단/메모·이미지 공개 시점 유지 |
| 진행 | Git 원격 변경·작업 통합 | 원격4커밋 위에 로컬 최신 작업을 보존하는 격리 브랜치. 원본 백업/Git bundle 완료, 최종 commit/push 대기 |
| 검증 완료 | 전체 자동·화면 검증 | 164/164·lint·build,390 휴대폰/1366·1920 대문,31번/번외10초·상품업로드/복원·진행자 팁 비공개. [최종 검증](validation/2026-10-24/cloud-events.md) |
| 미확인 | 현재 Cloud Run 가동·새 코드 운영 반영 | 10월23일 인증 실패 이후 조회 미완료. 기존 서비스의 상시 가동/정지 상태를 단정하지 않음 |
| 미검증 | 실기 휴대폰·현장 장비 | 실제 휴대폰·프로젝터·스피커·리모컨 리허설 |

2026-10-22의140개 검사·31문항/이미지·HTTPS 검증은 이전 코드의 이력이다. 이번 범용 행사/참여 모양/소스 정리의 검증 결과와 구분한다.

## 활성 문서

- [실행·운영 안내](../README.md)
- [클라우드 모듈 설계](design/manual-cloud.md)
- [단계별 로드맵](planning/roadmap.md)
- [배포 절차](planning/manual-cloud-deploy.md)
- [진행 런북](planning/runbook.md)
- [작업 인계](../CODEX_HANDOFF.md)

## 모듈과 공개 경계

아래 경로로 클라우드 전용 구조 정리를 완료했다.

| 영역 | 책임 / 공개 인터페이스 |
|---|---|
| `cloud/manual-service.mjs` | 진행 상태·행사 정보·은행/명단 revision과 저장 완료 응답 |
| `cloud/store.mjs` | 개발 파일 저장·운영 GCS generation 조건부 저장 |
| `cloud/server.mjs` | PIN 세션·관리자 API·현재 화면 DTO |
| `cloud/screen-server.mjs` | 별도 읽기 전용 스크린과 private 서비스 relay |
| `web/src/quiz/manual-model.js` | 주제·타이머·문제/정답·번외/본게임 전이 |
| `web/src/quiz/presenter.js` | 진행실 제어·편집·설정·서버 ACK 안내 |
| `web/src/quiz/event-info.js` / `presentation.js` | 행사 정보 검증·대문/종료·주먹/보자기 표시 |
| `web/src/cloud/transport.js` / `screen.js` | 상태 동기화·재접속·스크린 음향 |
| `web/host-shell.html` / `questions/default.json` | 화면 틀·보존한 기본31문항 |

행사 정보는 진행 위치·문제집·명단과 구분해 저장한다. 스크린에는 현재 공개 가능한 문제·정답·행사 정보만 보내고 명단·진행자 메모·전체 은행은 진행실 권한으로 관리한다. 개발 접근 정보와 원시 상태는 ignored `data/`에 보관한다.

## 다음 작업

1. 소스 이동·실행기 삭제·패키지/Docker 구성 정리를 완료한다.
2. 행사 정보 저장/복원·O 주먹/X 보자기·31/33 자료 보존을 자동 검사와 두 화면으로 검증한다.
3. 발행 안전 검사 후 통합 브랜치를 commit/push하고 결과를 기록한다.
4. 인증 복구 후 실제 Cloud Run 가동과 새 코드 반영 여부를 별도로 확인한다.

## 역사 자료

과거 음성·단독 HTML·React/참가자 게임 문서는 당시 실행 기록이다. 현재 실행 경로는 README를 따른다.

- [31문항·공식 두 로고 최종 운영 기록](validation/2026-10-22/main-python-logo.md)
- [공개 스크린 분리 기록](validation/2026-10-22/public-screen.md)
- [단독 진행·영상·편집 저장 기록](validation/2026-10-22/manual-control.md)
- [이전 PC/음성 이관 기록](planning/pc-migration-gpt-sovits.md)
