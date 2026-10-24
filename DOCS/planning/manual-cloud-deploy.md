---
title: 수동 퀴즈 클라우드 배포
tags: [project/ox-quiz, cloud, deployment, runbook]
created: 2026-10-22
updated: 2026-10-22
status: deployed-iap-browser-validation
up: "[[index]]"
related: ["[[roadmap]]", "[[ADR-0004-cloud-deploy]]"]
---

# 수동 퀴즈 클라우드 배포

휴대폰의 진행실과 노트북의 프로젝션을 한 서버 상태로 연결하는 새 수동 클라우드 서비스다. 기존 참가자 게임의 `Dockerfile`·`deploy/cloud-run.sh`와 로컬 `OX퀴즈.html`은 보존한다. 수동 게임은 Cloud Run의 요청 처리 시각과 저장된 deadline으로 시간을 계산하므로 상시 CPU·상시 인스턴스를 요구하지 않는다.

## 책임·의존성과 단계

| 모듈 | 책임·공개 입력/출력 | 의존성 |
|---|---|---|
| `tools/build-cloud.mjs` | 현재 단독 HTML의 구성요소를 `dist/cloud`의 진행실·로그인·스크린·서버 seed로 빌드 | 루트 빌드 스크립트·esbuild·기존 문제/이미지 |
| `cloud/server.mjs`·저장 모듈 | 인증된 진행 명령, 정답을 가린 스크린 응답, 서버 권위 상태와 GCS 저장 | `manual-model.js`·presentation·Cloud Storage |
| `cloud/Dockerfile` | 현재 수동 소스만 새 이미지로 빌드하고 전용 서버 실행 | Node24·npm lock·`build:cloud` |
| `deploy/manual-cloud.ps1` | 명시된 프로젝트/버킷/서비스 계정에 배포 계획 생성·사전 조회·Cloud Build·Cloud Run 연결 | gcloud, 기존 Artifact Registry/비공개 버킷/Secret Manager |
| 이 문서 | 준비 조건·검증 범위·운영 복구 순서 | 대시보드/검증 기록과 연결 |

단계는 ① 패키징·배포 인터페이스 설계 ② Dockerfile/명시적 배포 스크립트 ③ 로컬 계획 생성·구문/소스 범위 검증 ④ 프로젝트 확정·재로그인 후 실제 빌드/배포 ⑤ HTTPS에서 휴대폰 제어/스크린 동기화·저장/재접속 검증이다. 코드 구현, 로컬 HTTP/UI 검증, 컨테이너 실행, 실제 GCS/Cloud Run, 실제 휴대폰/프로젝터를 구분해 기록한다.

## 현재 확인된 배포 경계

- 사용자가 지정한 **CompanyInfo**의 실제 프로젝트를 재인증 후 확인했다. `gridex-companyinfo`·프로젝트 번호 `953995790322`·ACTIVE이며, 수동 퀴즈는 서울 `asia-northeast3`에 별도로 준비한다.
- 최초 gcloud 기본 프로젝트는 `orca-runtime-gridex`·리전은 `asia-northeast1`이었다. 사용자 지정과 다르므로 사용하지 않으며, 명령마다 확정한 프로젝트/리전을 명시해 전역 설정을 보존한다.
- 초기 `Reauthentication failed`는 사용자 재인증 후 해소됐다. Cloud Run·Cloud Build·Artifact Registry·Storage·Secret Manager·IAM·Logging API가 모두 활성이고, 배포 사용자의 기존 프로젝트 권한도 확인했다. 추가 배포자 권한은 부여하지 않았다.
- 로컬 Docker Desktop Linux daemon은 실행되지 않아 로컬 Docker 검증은 하지 않았다. 이후 실제 Cloud Build의 이미지 빌드와 Cloud Run 컨테이너 시작/Ready는 별도 확인했다.
- 별도 준비 단계에서 아래 전용 리소스를 만들고 최소 IAM 읽기 검증을 마쳤다. 실제 Cloud Build·Cloud Run Ready·GCS 초기 저장과 IAP+PIN 브라우저 접속을 확인했다. [운영 URL](https://ox-manual-quiz-li6lylqmwa-du.a.run.app). 두 화면의 실제 동기화·저장 재접속·원복·예약 등록은 [최종 운영 검증](../validation/2026-10-22/manual-cloud-live.md)으로 확인했다. 실제 자정 실행 결과는 미래의 별도 확인 사항이다.

## CompanyInfo 프로젝트의 전용 리소스

CompanyInfo의 기존 웹 서비스·Cloud SQL·버킷·비밀·서비스 계정과 해당 IAM을 보존한다. 수동 퀴즈는 Cloud SQL 연결·기존 데이터베이스 스키마 변경·CompanyInfo 런타임 계정 재사용 없이 독립된 새 Cloud Run 서비스로 구성한다. 아래 준비된 리소스는 모두 퀴즈 전용이다. 기존 서비스의 배포 전 비교 자료는 `data/cloud-deployment/existing-services-before.json`에 이름·리전·Ready 리비전·트래픽·URL만 보관했다. 전체 리전10개(도쿄4·서울6)이며 이 시점에 `ox-manual-quiz` 서비스는 없다. 환경변수/spec·비밀값은 보관하지 않았다.

| 리소스 | 실제 이름·위치 | 상태·분리 이유 |
|---|---|---|
| 프로젝트 | `gridex-companyinfo`, 번호 `953995790322` | ACTIVE·실제 인증/권한 확인 |
| Cloud Run | `ox-manual-quiz`, `asia-northeast3` | 실제 배포·Ready·IAP 접속 확인. 오늘은 min1/CPU 상시, 자정 min0/요청 CPU 복원 계획 |
| Artifact Registry | `ox-manual-quiz`, `asia-northeast3`, Docker | 생성·형식·퀴즈 소유 레이블 확인. 다른 제품 이미지와 분리 |
| 런타임 서비스 계정 | `ox-manual-runtime@gridex-companyinfo.iam.gserviceaccount.com` | 생성·활성 확인. 퀴즈 상태와 두 비밀만 접근. 계정 키 파일 생성 없음 |
| 빌드 서비스 계정 | `ox-manual-build@gridex-companyinfo.iam.gserviceaccount.com` | 생성·활성 확인. 수령 명단 상태 버킷/비밀 접근 없음 |
| 상태 버킷 | `gridex-companyinfo-ox-manual-state-953995790322`, 서울 리전 | 생성·소유 프로젝트/UBLA/PAP/IAM 확인. 기본 객체 `manual/state-v1.json` 예정 |
| 소스 버킷 | `gridex-companyinfo-ox-manual-source-953995790322`, 서울 리전 | 생성·소유 프로젝트/UBLA/PAP/IAM 확인. `-SourceStagingBucket`으로 분리 |
| Secret Manager | `ox-manual-host-pin:1`, `ox-manual-screen-key:1` | 새 서울 user-managed 비밀·버전 ENABLED·소유 레이블 확인. 값 접근 없이 메타데이터/IAM만 검증 |

버킷 이름은 전역 고유이므로 프로젝트 번호를 포함해도 생성 전 존재·소유 확인이 필요하다. 두 새 버킷은 uniform bucket-level access와 public access prevention을 켜고, 버킷별 직접 IAM만 부여한다. 소스 버킷을 상태 버킷과 분리하면 빌드 계정이 이름·전화번호가 든 상태를 읽을 필요가 없다. [버킷 생성 옵션](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/create), [공개 접근 방지](https://docs.cloud.google.com/storage/docs/using-public-access-prevention).

읽기 검증에서 두 버킷은 해당 프로젝트 번호·`ASIA-NORTHEAST3`·UBLA true·PAP enforced·퀴즈 소유 레이블·공개 IAM0건이었다. runtime의 프로젝트 단위 grant는 없고 상태 버킷 objectUser/비밀별 secretAccessor만, build는 소스 버킷 objectViewer/새 AR writer와 프로젝트 logging.logWriter만 직접 부여됐다. runtime↔build의 상태/소스 교차 권한과 build의 비밀 접근은 없다. 기존 계정과 기존 서비스의 권한은 변경하지 않았다.

### 준비 순서와 권한 경계

1. 재인증 후 명시한 프로젝트의 ID·번호·ACTIVE 상태와 사용 가능한 API, 기존 서비스/리소스 이름을 읽기 조회한다. 이 조회로 CompanyInfo 기존 서비스의 이미지·트래픽·도메인·IAM을 변경하지 않는다. 새 리소스가 이미 있으면 이름만 보고 재사용하지 않고 위치·소유·설정까지 확인한다.
2. 필요한 API가 비활성인 경우에만 해당 프로젝트에서 활성화한다. 수동 배포에는 Cloud Run·Cloud Build·Artifact Registry·Storage·Secret Manager가 필요하며, 서비스 계정 생성에는 IAM API도 확인한다. API를 일괄 비활성화하거나 조직 정책을 완화하지 않는다.
3. 전용 AR, 런타임/빌드 계정, 두 버킷과 두 비밀을 준비한다. PIN/키 값은 명령 인자·문서·채팅·빌드 소스에 넣지 않고 비공개 로컬 입력 또는 Secret Manager 입력으로 전달한다. 기존 비밀의 새 버전을 만들지 않는다.
4. 아래 리소스 범위로만 실행 계정 권한을 부여한다. 이미 있는 광범위한 권한을 근거 없이 확장하거나 CompanyInfo 계정에 추가 권한을 부여하지 않는다.
5. 생성/확인한 실제 이름과 비밀 숫자 버전을 `-PrepareOnly` 계획에 넣고 허용 목록을 검토한 뒤 사전 조회와 배포를 진행한다. 준비 단계와 실제 배포 성공·HTTPS 검증을 각각 기록한다.

| 주체 | 범위 | 필요한 권한·용도 |
|---|---|---|
| 퀴즈 런타임 계정 | 새 상태 버킷만 | 직접 무조건부 `roles/storage.objectUser`: 읽기·생성·조건부 덮어쓰기. 현재 스크립트의 사전 검사와 일치 |
| 퀴즈 런타임 계정 | 새 PIN/스크린 키 비밀 각각 | `roles/secretmanager.secretAccessor`. 프로젝트 전체 비밀 접근을 부여하지 않음 |
| 퀴즈 빌드 계정 | 새 AR 저장소만 | `roles/artifactregistry.writer` |
| 퀴즈 빌드 계정 | 새 소스 버킷만 | `roles/storage.objectViewer`. 상태 버킷과 비밀에 대한 접근 없음 |
| 퀴즈 빌드 계정 | 해당 프로젝트의 로그 | `CLOUD_LOGGING_ONLY`에 필요한 `roles/logging.logWriter`. 기존 충족 권한을 먼저 확인 |
| 배포 사용자 | 새 런타임/빌드 계정 각각 | 필요할 때만 `roles/iam.serviceAccountUser`. 기존 사용자 권한으로 충족되면 새 바인딩 불필요 |
| 배포 사용자·Cloud Run 서비스 에이전트 | 새 AR·소스·새 Run 서비스 | 기존 배포 권한과 이미지 pull/소스 업로드 권한 확인. 실패를 이유로 Owner/Editor/프로젝트 전체 Storage Admin을 자동 부여하지 않음 |

상태/소스 버킷과 각 비밀·AR에는 리소스 단위로 권한을 줄 수 있다. 사용자 지정 빌드 계정과 Cloud Logging 기록은 별도 구성이 필요하고, Cloud Run 서비스의 비밀 접근은 런타임 계정에 부여한다. [Storage 역할](https://docs.cloud.google.com/storage/docs/access-control/iam-roles), [빌드 계정·로그 구성](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts), [Cloud Run 비밀 접근](https://docs.cloud.google.com/run/docs/configuring/services/secrets).

### 구현된 배포 인터페이스와 검증 경계

- 실제 회사 조직 정책에서 공개 Invoker 바인딩이 거부돼 기본 접근 모드를 `iap`로 구현했다. `-AccessMode iap|public`(기본 iap), IAP일 때 명시 필수인 `-IapMember user:EMAIL|group:EMAIL`, `-MinInstances 0|1`(기본0), `-AlwaysOnCpu`를 계획과 실행 플래그에 함께 반영한다. 개인 계정은 기본값으로 넣지 않는다. IAP는 새 Run 서비스에만 서비스 에이전트 invoker·지정 사용자 접근 권한을 추가하고, 결과에 Ready와 별도로 `health=null`, `browserVerificationRequired=true`를 남긴다. public 모드도 기존 IAP를 명시적으로 해제하지 않으며 실제 IAP가 남아 있으면 익명 health를 시도하지 않는다. 새 옵션은 AST·IAP warm/public idle PrepareOnly·누락 IAP 사용자 거부·diff 검사를 통과했으며 이 옵션 수정 검증에서 클라우드를 다시 변경하지 않았다.

- `-ServiceAccount`는 **런타임 계정**이다. 전용 빌드 계정의 선택 매개변수 `-BuildServiceAccount`와 버킷 소유/위치/비공개 사전 검사를 설계 후 구현했다. PowerShell AST·`-PrepareOnly`·실 리소스 읽기 검증과 실제 Cloud Build/최초 배포를 확인했다. 이후 추가한 접근 모드/상시 가동 옵션은 AST·로컬 계획 검증 범위이며, 옵션 추가 후 재배포 실행과 기존 서비스의 실제 IAP/가동 설정 확인을 구분한다. [명시적 빌드 계정 구성](https://docs.cloud.google.com/build/docs/securing-builds/configure-user-specified-service-accounts).

| 확장 인터페이스 | 입력·보장 | 준비/실행의 구분 |
|---|---|---|
| `-BuildServiceAccount` | 선택 문자열, 명시한 프로젝트 소속 기존 빌드 계정 이메일. 같은 프로젝트·런타임 계정과 분리하는 입력 guard 구현 | `-PrepareOnly`는 계획에 기록만 함. 새 계정 존재/활성은 실제 읽기 조회로 확인. Build 실행은 미검증 |
| 빌드 설정/제출 | 입력 계정을 `projects/PROJECT_ID/serviceAccounts/EMAIL` 형태로 `cloudbuild.json.serviceAccount`에 명시 | 생성 JSON/계획 문자열 일치와 실제 Cloud Build 성공 확인. 생략 시 기존 기본 선택을 보존하며 그 계정 확인 결과를 별도 기록 |
| 버킷 소유 검사 | 프로젝트 조회의 project number와 상태/소스 각 버킷의 project number 일치 | `--project` 옵션만으로 소유를 추정하지 않음. 불일치 시 빌드 전에 거부 |
| 버킷 위치 검사 | 상태/소스 각 버킷의 실제 location과 선택한 리전 일치 | 다른 위치의 기존 CompanyInfo 버킷을 이동·변경하지 않고 새 전용 이름 선택 |
| 비공개 설정 검사 | uniform bucket-level access 사용, public access prevention 명시적 enforced, 공개 IAM 없음 | 검사 실패 시 기존 버킷 설정을 자동 수정하지 않음. 신규 준비 단계와 배포 사전 검사를 분리 |
| 기존 검사 유지 | 런타임 상태 버킷의 직접 무조건부 object 역할, 숫자 비밀 버전, 기존 Run 소유 레이블 | 다른 제품의 IAM·서비스를 퀴즈용으로 자동 전환하지 않음 |

- 현재 기본 빌드 계정을 사용하는 대안은 `gcloud builds get-default-service-account --project PROJECT_ID --region asia-northeast3`로 실제 주체·기존 권한을 확인한 경우에만 검토한다. 기존 CompanyInfo 빌드 설정/기본 계정 선택을 바꾸지 않는다. 전용 계정 구현 여부와 관계없이 소스는 `-SourceStagingBucket`으로 분리한다. [기본 빌드 계정 조회](https://docs.cloud.google.com/sdk/gcloud/reference/builds/get-default-service-account).
- 직접 공개 IAM/런타임 역할 검사와 위 소유/위치/UBLA/PAP 거부 조건이 구현돼 있다. `buckets describe --raw`의 API 형식 필드를 사용하며, 준비된 실 버킷의 소유·위치·비공개 설정은 읽기 조회로 확인했다. 이는 저장 객체에 대한 실제 앱 쓰기/복구 확인과 별개다. [버킷 raw 응답](https://docs.cloud.google.com/sdk/gcloud/reference/storage/buckets/describe).
- 기존 서비스의 `managed-by=ox-manual-quiz` 레이블이 없으면 스크립트가 배포를 거부한다. 새로운 전용 이름을 사용하며, 기존 CompanyInfo 서비스에 이 레이블을 붙여 덮어쓰기 제한을 우회하지 않는다.
- `-WhatIf`는 리소스를 만들지 않고 읽기 사전 조회까지만 한다. 기본값 보존·누락 리소스 생성 금지·소유 불명 서비스 거부는 유지한다. 가짜 gcloud CLI 통합 검사는 과거 자동 검토 차단을 재시도하지 않는다.

## 기존 리소스 준비

배포에 사용할 **정확한 프로젝트 ID**, 서울 리전 `asia-northeast3`(변경 가능), 새 서비스 이름(기본 `ox-manual-quiz`)을 정한다. 기존 `ox-quiz` 서비스는 다른 참가자 게임이므로 이 스크립트에서 보호한다.

다음 리소스가 이미 있어야 한다. 스크립트는 누락된 리소스를 자동 생성하거나 권한을 확장하지 않는다.

1. 결제와 `run.googleapis.com`, `cloudbuild.googleapis.com`, `artifactregistry.googleapis.com`, `storage.googleapis.com`, `secretmanager.googleapis.com` API를 사용할 수 있는 프로젝트.
2. 같은 리전의 Docker 형식 Artifact Registry 저장소. 배포자는 Cloud Build 제출·이미지 push·Cloud Run 배포 권한과 런타임 서비스 계정의 `actAs` 권한이 필요하다.
3. 전용 비공개 GCS 버킷. 기본 저장 객체는 `manual/state-v1.json`이며 기존 `ox.sqlite`와 공유하지 않는다. 런타임 서비스 계정에는 이 버킷의 객체 읽기·생성·덮어쓰기 권한이 필요하다. 배포 스크립트는 직접 부여된 무조건부 객체 역할을 사전 확인하며, 상속/사용자 정의/조건부 정책만 있는 경우 이를 임의로 권한 충족으로 추정하지 않는다.
4. 프로젝트의 기존 런타임 서비스 계정. 기본 Compute 서비스 계정을 자동 선택하지 않는다.
5. Secret Manager의 진행자 PIN과 스크린 키. 서로 다른 충분히 긴 값으로 준비하고 숫자 버전을 지정한다. 런타임 계정이 두 비밀을 읽을 수 있어야 한다. 스크립트는 비밀값을 읽거나 터미널에 출력하지 않는다.
6. Cloud Build의 빌드 계정에는 Artifact Registry push, 소스 업로드 버킷 읽기, 로그 기록 권한이 필요하다. `SourceStagingBucket`을 별도로 지정하지 않으면 위 비공개 버킷의 `manual-cloud-build/source` 경로로 소스를 올린다.

Cloud Run 파일시스템은 인스턴스 종료 후 유지되지 않는다. 운영에서는 `MANUAL_GCS_BUCKET` 없이 시작하지 않으며 저장 실패를 성공 안내로 처리하지 않는다. 인스턴스 간 상태 충돌은 객체 generation 조건으로 감지한다. [Cloud Run 파일시스템](https://docs.cloud.google.com/run/docs/container-contract), [Cloud Storage 쓰기 조건](https://docs.cloud.google.com/storage/docs/request-preconditions?hl=en).

## 로컬에서 배포 계획 만들기

프로젝트 루트의 PowerShell에서 다음 형식으로 실행한다. 아래 값은 예시이며 실제 리소스 이름을 넣는다.

```powershell
.\deploy\manual-cloud.ps1 `
  -Project 'YOUR_PROJECT_ID' `
  -Region 'asia-northeast3' `
  -Service 'ox-manual-quiz' `
  -Bucket 'YOUR_EXISTING_PRIVATE_BUCKET' `
  -ArtifactRepository 'YOUR_EXISTING_DOCKER_REPOSITORY' `
  -ServiceAccount 'quiz-runtime@YOUR_PROJECT_ID.iam.gserviceaccount.com' `
  -BuildServiceAccount 'quiz-build@YOUR_PROJECT_ID.iam.gserviceaccount.com' `
  -SourceStagingBucket 'YOUR_EXISTING_PRIVATE_SOURCE_BUCKET' `
  -AccessMode 'iap' -IapMember 'user:YOUR_EMAIL@example.com' `
  -HostPinSecret 'ox-manual-host-pin:1' `
  -ScreenKeySecret 'ox-manual-screen-key:1' `
  -PrepareOnly
```

`-PrepareOnly`는 로컬 계획 폴더에 허용한 소스와 `cloudbuild.json`, 비밀값 없는 `run-env.yaml`, `deploy-plan.json`을 만든다. gcloud를 실행하거나 클라우드에 쓰지 않는다. 루트 `data`·`.git`·실제 `.env`·음성·사용자 수령자 명단·브라우저 저장값은 복사하지 않는다. 현재 맞춤20문항은 실제 GUI의 문제 백업에서 확보한 `questions/kiee-a-2026-cloud-seed.json`으로 보존한다. 이 파일에는 문제 은행만 있으며 개인 명단·세션/토큰은 없다. 새 클라우드 저장소의 초기 seed로 사용하고 기존 GCS 상태가 있으면 덮어쓰지 않는다.

소스 패키지는 root lock/package와 workspace package manifest, `cloud` 코드, 클라우드/오프라인 공통 모듈·화면 틀, 맞춤 cloud-seed와 기본/번외 퀴즈 JSON·이미지, 전용 빌드 도구로 제한한다. 사용자 맞춤 seed가 누락된 패키지는 배포 스크립트에서 거부한다. Docker는 `cloud/Dockerfile`을 명시적으로 사용한다. 기존 루트 Dockerfile을 실행하지 않는다.

## 실제 배포

프로젝트가 정해진 뒤 gcloud 로그인을 갱신하고 `-PrepareOnly`를 뺀 동일 명령을 사용한다. `-WhatIf`는 사전 조회까지만 수행하고 Cloud Build/배포는 실행하지 않는다. 모든 gcloud 호출에 `--project`·리전 등을 명시해 사용자 기본 설정을 보존한다.

배포 스크립트는 인증·프로젝트·Artifact Registry·버킷 존재/공개 정책·런타임 서비스 계정·비밀 버전·기존 서비스 소유 표시를 확인한 뒤 진행한다. 기존 서비스가 이 수동 퀴즈의 소유 표시가 없으면 덮어쓰지 않는다. 이후 Cloud Build로 이미지를 만들고 실제 이미지 digest를 읽어 Cloud Run에 배포한다.

PIN/스크린 키는 Secret Manager 참조로만 전달한다. 버킷/객체 이름 등 비밀이 아닌 환경변수는 파일로 전달한다. 기본은 서비스/리비전 min0/max1·CPU1·메모리512Mi·concurrency80·timeout60초·요청 CPU이며, 오늘의 가동 설정은 `-MinInstances 1 -AlwaysOnCpu`로 명시한다. 기본 IAP 모드는 Google 로그인 후 앱 PIN/스크린 키를 사용한다. `public`은 조직 정책이 허용하는 경우에만 명시적으로 선택하며 invoker 검사와 기존 IAP 설정을 해제하지 않는다. `--env-vars-file`은 대상 전용 서비스의 기존 일반 환경변수를 교체한다. [배포 플래그·환경변수·비밀 참조](https://docs.cloud.google.com/sdk/gcloud/reference/run/deploy), [Cloud Build 구성](https://docs.cloud.google.com/build/docs/configuring-builds/create-basic-configuration).

## 배포 후 수동 확인

1. Cloud Run Ready와 앱 health를 구분한다. IAP 모드의 익명 health 응답은 Google 로그인으로 보호되므로 스크립트는 앱 검증 대기로 기록한다. Google 로그인 후 브라우저에서 앱 상태를 별도 확인한다.
2. 휴대폰 진행실은 허용된 Google 계정과 진행자 PIN으로 연다. 노트북은 진행실이 제공하는 새 `ox-manual-screen`의 키 포함 링크로 프로젝션을 열며 Google 로그인이나 PIN이 필요 없다. 이전 `ox-manual-quiz/screen` 주소는 계속 IAP로 보호되므로 새 스크린 링크를 사용한다.
3. 대문 → 상품 → 첫 워밍업 → 문제/타이머 → 정답 → 다음 문제를 조작해 두 화면의 같은 상태를 확인한다. 스크린 응답/페이지에 미공개 정답·다음 문항·명단이 포함되지 않는지도 확인한다.
4. 새 저장소의 처음 목록이 맞춤20문항(AI1번·노래2번·원이7번)인지 확인한다. 이후 인증된 진행실에서 추가 편집/JSON 가져오기와 문구·순서 저장을 수행하고, 휴대폰과 노트북을 각각 새로고침해 같은 목록/진행 위치로 복원되는지 확인한다. 기존 GCS 상태가 있을 때 seed가 이를 교체하지 않는지도 별도 확인한다.
5. 번외 출제 → 본게임 위치/남은 시간 복귀, 노래 무타이머, 사진 표시 시점, 배경음의 노트북 재생을 확인한다. 휴대폰의 화면 잠금/네트워크 재접속 뒤에도 서버의 최신 상태를 받는지 본다.
6. GCS 저장 실패/충돌은 명확한 오류로 남아야 한다. 실제 운영 객체를 삭제해 복구 시험하지 않는다. 별도 검증 객체/서비스에서만 인스턴스 재시작 복원까지 확인한 뒤 운영 검증으로 기록한다.

문제와 명단은 별개다. 기존 PC의 이름/전화번호를 자동으로 업로드하지 않는다. 기존 서비스/버킷/비밀을 삭제하거나 프로젝트 전체 권한을 부여하는 절차도 포함하지 않는다. 실제 클라우드 비용·현장 휴대폰·프로젝터 검증은 배포 준비 완료와 구분한다.

## 이번 배포 패키지 검증

- PowerShell AST 구문 검사와 `git diff --check`를 통과했다. `-PrepareOnly`는 가상 프로젝트 이름으로 로컬 소스 패키지/계획을 만들었으며 gcloud를 호출하지 않았다. 예약된 기존 `ox-quiz` 서비스 이름은 사전 거부했다.
- 격리된 최초 패키지에서 `npm ci` → `build:cloud` → `npm prune --omit=dev` → `cloud/server.mjs`와 `@google-cloud/storage` import를 확인했다. 루트 `node_modules`는 변경하지 않았다. 이는 Windows Node에서 수행한 패키지/프로덕션 의존성 확인이며 Docker 컨테이너 실행 결과가 아니다.
- 맞춤 cloud-seed를 포함한 새 허용 목록으로 다시 패키징해 빌드 결과의20개 전체 객체가 원본 seed와 일치함을 확인했다(AI1번·노래2번·원이7번). 이는 정적 초기 데이터 보존 검증이며 실제 GCS에 저장된 운영 문제집을 교체한 결과가 아니다.
- CompanyInfo 선택 이후 추가한 빌드 계정 분리·버킷 소유/위치/UBLA/PAP 검사는 AST와 읽기 검토를 통과했다. 재인증 전 `data/manual-cloud-deploy/20261022-004331-f719be09/`에 만든 실제 `-PrepareOnly` 계획은 당시 후보 `gridex-companyinfo`·서울 리전·`ox-manual-quiz`, 별도 runtime/build 계정을 기록했다. `cloudbuild.json.serviceAccount`의 전체 리소스 문자열이 기대값과 같고, 소스48파일·명단 미포함·전역 설정 변경 없음과 diff 공백 검사를 확인했다. 이 로컬 계획 생성은 gcloud를 호출하지 않아 클라우드 변경0건이며, 이후 재인증·실조회·전용 인프라 준비와 구분한다.
- 가짜 gcloud CLI를 사용한 사전 정책/배포 통합 실행 검사는 자동 승인 검토에서 `blocked by policy`로 차단됐다. 구체적 사유는 제공되지 않았으며 같은 검사 재시도나 우회는 하지 않았다. 해당 호출 경로는 실행 검증 완료로 주장하지 않는다.
- 실제 Cloud Build 성공·새 Cloud Run Ready·GCS 초기 저장과 IAP+PIN 브라우저 접속을 확인했다. 기존 조직 정책 때문에 공개 바인딩은 거부됐으며 이를 완화하거나 invoker 검사를 끄지 않고 새 서비스의 IAP로 연결했다. 실제 휴대폰 장비·행사 스피커/프로젝터와 자정 예약 실행 결과는 별도 범위다. 기존 gcloud 기본 설정/기존 서비스/4179 로컬 서버는 보존했다.

## 오늘 상시 가동·자정 자동 복원

사용자가 지정한 종료 시각은 **2026-10-23 00:00 KST**, 즉 **2026-10-22T15:00:00Z**이며 단발 예약 등록을 확인했다. 현재 서비스/리비전 최소 인스턴스1·CPU throttling=false·IAP=true를 재조회했다. 자정에는 두 최소값을0·`cpuIdle=true`로 복원할 계획이다. 실제 자정 실행 완료는 아직 미래의 확인 사항이다. 이 복원은 상시 가동/유휴 비용 종료이며 URL 차단이나 서비스·GCS 데이터 삭제가 아니다. 이후 요청이 있으면 다시 시작할 수 있다. [최소 인스턴스](https://docs.cloud.google.com/run/docs/configuring/min-instances).

예약은 서울의 전용 Cloud Tasks 큐 `ox-manual-ops`가 Workflows `ox-manual-night-stop`을 한 번 호출한다. workflow는 최신 `ox-manual-quiz` 설정을 조회한 뒤 필요한 scaling/template 필드만 수정하고, 조회로 결과를 확인한다. OAuth 토큰은 Google Cloud 서비스 계정으로 실행 시 발급되므로 PC 전원이나 사용자의 gcloud 로그인 유지에 의존하지 않는다. IAP·조직 정책·다른 CompanyInfo 서비스는 변경 대상이 아니다.

| 주체 | 허용 범위·역할 |
|---|---|
| `ox-manual-stop@gridex-companyinfo.iam.gserviceaccount.com` | 새 Run 서비스에 get/update 사용자 정의 역할, 새 runtime 계정에 Service Account User, 퀴즈 AR 저장소에 Artifact Registry Reader만 부여. 임시 operations.get 권한은 회수했고 프로젝트 전체 Run 권한 없음 |
| `ox-manual-task@gridex-companyinfo.iam.gserviceaccount.com` | `workflows.executions.create`만 포함하는 프로젝트 사용자 정의 역할과 `request.time < timestamp('2026-10-22T15:30:00Z')` 조건. 시간 내 프로젝트의 다른 workflow 실행 생성도 가능한 잔여 범위가 있으며, workflow별 IAM 제한이라고 주장하지 않음. Run 수정·태스크 생성·키 파일 없음 |
| Cloud Tasks 서비스 에이전트 | API 활성화 시의 정상 serviceAgent 역할 확인, task 계정의 인증 토큰 생성/actAs 권한만 확인 |

최초 읽기 조회에서는 `workflows.googleapis.com`·`workflowexecutions.googleapis.com`·`cloudtasks.googleapis.com`이 모두 비활성이었고 이후 전용 예약 준비를 위해 활성화했다. 서울 큐 `ox-manual-ops`, ACTIVE workflow `ox-manual-night-stop` 리비전 `000003-6d8`, 고정 대상/시각/dryRun=false Task `a0c16796318f5067-20261023-night-stop`을 실제 등록했다.

Workflows의 공식 최소 IAM 부여 단위는 프로젝트이며 `gcloud workflows add-iam-policy-binding` 명령도 없다. IAM resource attributes 지원 목록에 Workflows가 없어 `resource.name` 조건으로 단일 workflow에 제한된다고 가정하지 않는다. 오늘1회 작업은 생성 권한 하나·새 계정·고정 Task URL·00:30 KST 만료 조건을 선택하고, 프로젝트 범위라는 한계를 남긴다. 태그를 workflow에 직접 붙여 추가 제한하는 방법은 별도 태그 리소스와 설정 범위를 늘리므로 이번에는 적용하지 않는다. 예약 생성과 별개로 실제 인증 체인의 dry run을 확인한다. [Workflows 역할 범위](https://docs.cloud.google.com/iam/docs/roles-permissions/workflows), [조건의 지원 리소스](https://docs.cloud.google.com/iam/docs/conditions-resource-attributes), [workflow 태그](https://docs.cloud.google.com/workflows/docs/create-manage-tags).

등록한 예약과 workflow의 현재 메타데이터 조회:

```powershell
gcloud tasks describe a0c16796318f5067-20261023-night-stop --queue ox-manual-ops --location asia-northeast3 --project gridex-companyinfo
gcloud workflows describe ox-manual-night-stop --location asia-northeast3 --project gridex-companyinfo
```

실제 인증 체인의 시험 execution `60f86a61-4bb8-47f7-b348-60f0e5ea5d57`은 SUCCEEDED지만 결과는 **DRY_RUN_ACCEPTED**다. `validateOnly` PATCH 접수는 확인했으나 validation operation 조회404로 **validationCompleted=false·patchValidated=false**이며, 전체 변경 검증 성공을 의미하지 않는다. task 등록 영수증은 `data/cloud-deployment/night-stop-task-receipt.json`, 시험 결과는 `night-stop-dry-run.json`, 현재 서비스 상태는 `service-live-receipt.json`에 있다. 실제 자정 execution 결과와 min0/CPU 복원 여부는 그 이후 별도로 확인한다.

helper는 로컬 JSON만 만들며 `task-create.json`은 REST 요청 전체, `execution-body.json`은 실제 실행 본문, `execution-dry-run.json`은 검증용 본문이다. Google APIs 대상은 OAuth access token을 사용한다. Cloud Tasks는 적어도 한 번 전송하며 workflow 실행 생성 성공을 받으면 태스크를 완료 처리하므로, task 성공과 workflow 내부 변경 완료는 구분한다. [Cloud Tasks→Workflows](https://docs.cloud.google.com/workflows/docs/create-http-task?hl=en), [HTTP 태스크 옵션](https://docs.cloud.google.com/sdk/gcloud/reference/tasks/create-http-task).

## 후속 운영 — 프로젝션만 Google 로그인 제거

[공개 스크린](https://ox-manual-screen-953995790322.asia-northeast3.run.app/screen)은 별도 `screen` Docker target으로 배포했다. 실제 접속에는 진행실의 키 포함 링크를 사용한다. 진행실의 IAP/PIN은 유지했고 `-PublicScreenUrl https://ox-manual-screen-953995790322.asia-northeast3.run.app`을 환경변수에 명시했다. 이후 환경변수 교체형 재배포에서도 이 옵션을 유지한다.

신규 화면은 `ox-manual-screen` 계정으로 자기 signJwt·기존 퀴즈 IAP 접근·스크린 키 비밀 조회만 허용한다. GCS/PIN/전체 문제 은행은 전달하지 않는다. 실제 조직 정책 조회상 invoker IAM 검사 강제가 없어 새 화면 서비스만 공식 `--no-invoker-iam-check` 방식으로 공개했고 회사 DRS는 보존했다. Read-only screen의512Mi·min1/revmin1·CPU 상시는 실제 제공자 조건으로 적용했다.

최종 build `30528751-2e60-402f-b641-653baf691e84` SUCCESS, main `ox-manual-quiz-00003-dd5`·screen `ox-manual-screen-00001-dtz` Ready. 키/쿠키 없는 화면200·키를 넣은 DTO200·관리자404·main Google IAP 유지 및 실제 CUA 동기화를 확인했다. 클라우드49개 검사·린트·빌드 통과와 별도 운영 근거다. [상세 검증](../validation/2026-10-22/public-screen.md).

자정 Task ID와15:00Z 예약 시각은 유지하고 workflow를 `000004-58d`로 확장했다. 고정된 quiz와screen 각각을 최신GET/최소PATCH/완료GET으로 처리하며 한쪽 실패 후에도 나머지를 시도한다. stop 계정은 새 화면 서비스 get/update와 그 runtime actAs만 추가했다. 실제 양쪽 사전 시험 `30bf3bb7-9ecc-4030-9dcb-46e9dea7e579`은 SUCCEEDED/DRY_RUN_ACCEPTED이며 validationCompleted/patchValidated=false다. 두 서비스의 실제 자정 실행 완료는 미래 미확인이다. 00:02 보조 Codex 확인도 같은 두 대상으로 갱신했다.
