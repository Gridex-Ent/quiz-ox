---
title: OX Quiz Cloud 대시보드
tags: [MOC, project/ox-quiz, cloud]
status: in-progress
created: 2026-09-16
updated: 2026-10-25
---

# OX Quiz Cloud

휴대폰 진행실과 노트북 스크린을 서버 상태로 연결하는 클라우드 전용 퀴즈다. 행사명·날짜·장소·안내 문구를 설정하고, 참가자는 시간이 끝나면 **O 주먹·X 보자기**로 답한다. 메인31문항·번외33개·상품·명단·음향·수동 정답 공개를 유지한다.

## 현재 작업

| 상태 | 항목 | 근거 / 다음 작업 |
|---|---|---|
| 구현·검증 완료 | 문제 보기·공개 정답 상단 배치 | O/X·1번/2번 보기와 공개 정답을 상단 표시.202개·lint/build 및1366/1920에서 사진·주관식·긴 보기 확인. [검증](validation/2026-10-25/answer-top.md) |
| 구현·검증 완료 | 문제은행 난이도·후보 재선별 | 쉬운52개 교체·10분야70개(하10/중35/상25), 난이도 조합 필터·편집/저장/복원.194개·lint/build·노트북/휴대폰 화면 확인. [검증](validation/2026-10-24/question-bank-difficulty.md) |
| 구현·검증 완료 | 최초 체크박스 문제은행 | 초기70개·체크 선택·중복 방지·초안 끝에 추가. 당시185개·lint/build 및1366/390 브라우저 확인. 후보 구성은 위 난이도 재선별 결과를 따른다. [초기 검증](validation/2026-10-24/question-bank.md) |
| 완료 | GitHub 첫 화면·프로젝트 소개·사용 매뉴얼 | 문서 커밋 `00463f1` main push 완료. About·README·상세 가이드·이미지2개·Mermaid 실제 GitHub 표시, 상대 링크39개 확인. 배포하지 않음 |
| 완료 | 클라우드 전용 소스·패키지 정리 | `ox-quiz-cloud`, 단일 패키지와 cloud 서버 중심으로 변경. 기존 실행 경로를 현재 tree에서 제외하고 원본 snapshot/이력 보존 |
| 구현·검증 완료 | 행사 정보 설정 | 행사명·날짜·장소·안내 문구를 서버에 저장하고 대문/종료에 반영. 날짜는 선택 입력 |
| 구현·검증 완료 | 주먹/보자기 참여 안내 | O/첫 번째 보기=주먹, X/두 번째 보기=보자기. 시간이 끝나면 손들고 정답까지 유지 |
| 검증 완료 | 행사/상품 저장 경계 | revision/CAS/ACK·초안/충돌/복원, 이미지4MiB·prizeVersion 캐시와 공개 단계 제한 |
| 보존 검증 완료 | 메인31·번외33·사진11 | 기존 문구·정답·순서·사진/영상·진행자 메모 보존. 기본31문항은 default.json에 통합, seconds만 일반/번외10초로 변경 |
| 보존 검증 완료 | 상품·28칸 명단·음향·수동 정답 | 서버 ACK·충돌 처리와 비공개 명단/메모·이미지 공개 시점 유지 |
| 완료 | Git 원격 변경·작업 통합 | 원격4커밋 위 코드 b7f9e9c 정상 push·GitHub main SHA 일치 확인. snapshot211+bundle 보존. [영수증](validation/2026-10-24/github-publication.json) |
| 검증 완료 | 문제은행 추가 전 범용 행사 검증 | 164/164·lint·build,390 휴대폰/1366·1920 대문,31번/번외10초·상품업로드/복원·진행자 팁 비공개. [당시 검증](validation/2026-10-24/cloud-events.md) |
| 이번 범위 제외 | Cloud Run 배포 | 사용자 지시로 배포하지 않음. 과거 운영 상태 미확인 기록은 역사 자료로 유지 |
| 미검증 | 실기 휴대폰·현장 장비 | 실제 휴대폰·프로젝터·스피커·리모컨 리허설 |

2026-10-22의140개 검사·31문항/이미지·HTTPS 검증은 이전 코드의 이력이다. 이번 범용 행사/참여 모양/소스 정리의 검증 결과와 구분한다.

## 활성 문서

- [GitHub 첫 화면·소개·빠른 사용법](../README.md)
- [상세 사용자 매뉴얼](USER_GUIDE.md)
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
| `questions/catalog.json` / `web/src/quiz/question-bank.js` | 별도 후보70개·선택 상태·검색/필터·기존 초안을 보존하는 추가 가져오기 |
| `web/src/quiz/event-info.js` / `presentation.js` | 행사 정보 검증·대문/종료·주먹/보자기 표시 |
| `web/src/cloud/transport.js` / `screen.js` | 상태 동기화·재접속·스크린 음향 |
| `web/host-shell.html` / `questions/default.json` | 화면 틀·보존한 기본31문항 |

행사 정보는 진행 위치·문제집·명단과 구분해 저장한다. 스크린에는 현재 공개 가능한 문제·정답·행사 정보만 보내고 명단·진행자 메모·전체 은행은 진행실 권한으로 관리한다. 개발 접근 정보와 원시 상태는 ignored `data/`에 보관한다.

## 다음 작업

보기·공개 정답 상단 배치와 자동/브라우저 검증·사용 매뉴얼을 완료했다. 사용자 지시로 운영 배포는 진행하지 않는다. 향후 행사 전에는 실제 휴대폰·프로젝터·스피커로 리허설한다.

## 역사 자료

과거 음성·단독 HTML·React/참가자 게임 문서는 당시 실행 기록이다. 현재 실행 경로는 README를 따른다.

- [31문항·공식 두 로고 최종 운영 기록](validation/2026-10-22/main-python-logo.md)
- [공개 스크린 분리 기록](validation/2026-10-22/public-screen.md)
- [단독 진행·영상·편집 저장 기록](validation/2026-10-22/manual-control.md)
- [이전 PC/음성 이관 기록](planning/pc-migration-gpt-sovits.md)
