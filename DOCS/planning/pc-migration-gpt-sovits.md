---
title: PC 이관 및 GPT-SoVITS 음성 제작 인계
tags: [project/ox-quiz, handoff, voice]
status: ready-for-migration
created: 2026-10-21
updated: 2026-10-21
---

# PC 이관 및 GPT-SoVITS 음성 제작 인계

이 문서는 다른 Windows PC에서 OX 퀴즈와 교수님 음성 제작 작업을 이어가기 위한 인계서다. 기준일은 **2026-10-21**이다.

**먼저 할 일:** 기존 PC에서 문제·대본·설정을 백업하고, 참고 음성을 따로 복사한다. 새 PC에서는 이 저장소를 받은 뒤 GPU를 확인하고 GPT-SoVITS 설치부터 이어간다. **아직 GPT-SoVITS로 생성한 퀴즈 음성은 없다.**

## 1. 목표와 현재 상태

준비한 대본을 교수님 음성으로 미리 제작하고, 행사에서는 음성 “큐”, 관리자 **다음 · 큐** 버튼 또는 발표 리모컨으로 해당 파일을 재생한다. 문제 낭독이 끝나야 타이머가 시작되고, 정답은 다음 큐에서 공개한다.

GPU가 있는 제작 PC에서 음성을 만든 뒤 WAV/MP3와 제작에 사용한 대본 JSON을 행사 노트북으로 옮기는 방식이다. 행사 재생에는 GPT-SoVITS나 고성능 GPU가 필요하지 않다.

| 항목 | 현재 상태 |
|---|---|
| 단독 실행 퀴즈 | `OX퀴즈.html` 구현. 정규 18문제, 관리자·프로젝션 화면 |
| 진행·대본 | 버튼/발표 리모컨/지원 브라우저의 음성 큐, 대본 편집·JSON/TXT 내보내기 구현 |
| 녹음 재생 | 파일과 제작용 JSON 불러오기, 대본 일치 확인, 재생 완료 후 타이머 시작 구현 |
| 참고 음성 | 원본 약 88.35초와 시험용 7.33초 WAV 준비 |
| 기본 대본 | 시작 1 + 문제 18 + 정답·해설 18 + 마무리 1 = **38개** |
| HeyGen | 목소리 시험 후 사용자 선호 확인. 무료 사용량 제약으로 GPT-SoVITS 선택 |
| GPT-SoVITS | **설치·실행·모델 다운로드 확인 미완료**. 패키지 페이지를 열었지만 다운로드 완료 여부 미확인 |
| 합성·현장 검증 | **퀴즈 합성 음성 없음. 실제 음성 파일과 행사 장비를 이용한 리허설 미완료** |
| 코드 검증 | Node.js 24.15.0에서 오프라인 회귀 검사 29개와 ESLint 통과. 합성 품질 검증과는 별개 |

기존 노트북은 Intel Core Ultra 5 115U, RAM 약 48GB, Intel 내장 그래픽이며 NVIDIA GPU가 확인되지 않았다. **새 PC의 GPU·VRAM은 아직 모른다.** 기존 `START-HERE.txt`의 CPU 안내는 이전 노트북 기준이다.

## 2. 저장소와 작업 위치

- GitHub: <https://github.com/Gridex-Korea/quiz-ox> — 이관 기준 브랜치 `main`.
- 현재 수정한 작업 폴더: `D:\다운로드\OX퀴즈`.
- 이전 원본 폴더: `D:\Codex_Personal\ox_quiz\quiz-ox`. 이번 오프라인 작업으로 이 폴더를 갱신하지 않았다.
- 행사 실행 대상은 **`OX퀴즈.html`**이다. `npm run offline`의 React 화면에는 아래 음성·대본 기능이 모두 들어 있지 않다.

| 경로 | 역할 |
|---|---|
| `OX퀴즈.html` | 설치 없이 여는 행사 실행 파일 |
| `web/offline-shell.html` | 단독 HTML의 화면 틀 |
| `web/src/offline/standalone.js` | 퀴즈 상태, 대본, 큐와 화면 동기화 |
| `tools/offline-media.js` | 음성·녹음·효과음·음성 큐 처리 |
| `tools/build-offline.mjs` | 위 소스를 단일 HTML로 생성 |
| `tools/offline-standalone.test.mjs` | 진행 및 녹음 재생 회귀 검사 |
| `questions/kiee-a-2026-offline.json` | 기본 18문제 데이터 |
| `questions/kiee-a-2026-quiz.md` | 복사해 둔 원문과 진행 메모 |
| `web/src/offline/OfflineApp.tsx`, `model.ts`, `offline.css` | 별도의 React 개발용 오프라인 화면 |

## 3. 기존 PC를 떠나기 전에

### 3-1. 현재 브라우저에서 백업

사용하던 **관리자 창**에서 다음 파일을 저장한다. 저장소의 기본 문제와 브라우저에 편집해 둔 문제는 다를 수 있다.

1. 문제·대본·손 방향을 확인하고 편집을 적용한다.
2. **적용된 문제 백업**으로 `OX-questions.json`을 저장한다.
3. **음성 제작용 대본 JSON 저장**과 **전체 대본 TXT 저장**을 각각 실행한다.
4. 시작·마무리 대본, 사회자명·공동사회자명, 왼손/오른손 배치, 음성 선택, 낭독 여부, 속도, 음량, 숫자 음성 여부를 별도 메모하거나 화면을 캡처한다.
5. 백업 파일과 설정 메모를 USB 등으로 새 PC에 복사한다.

**문제 백업 JSON에는 문제별 대본은 들어가지만 위 전체 설정은 들어가지 않는다.** 제작용 대본 JSON도 설정 복원 파일이 아니다. 시작·마무리의 완성 문장은 제작용 JSON/TXT에서 확인할 수 있지만 새 PC의 설정에는 직접 입력해야 한다.

브라우저 저장 키는 `ox-banquet-standalone-v1`이다. Git clone, HTML 복사, PC 이동으로 localStorage가 옮겨지지 않는다. 파일 경로나 브라우저를 바꾸어도 이전 상태가 보이지 않을 수 있다.

### 3-2. 참고 음성을 별도로 복사

이 저장소는 **공개 저장소**다. 다음 음성·ZIP은 GitHub에 포함하지 않는다.

| 기존 PC의 프로젝트 기준 경로 | 내용 |
|---|---|
| `voice-input/professor-source.webm` | 원본 약 88.35초, Opus 48kHz 스테레오 |
| `voice-output/professor-reference.wav` | 원본 전체를 변환한 48kHz 모노, 16-bit PCM WAV |
| `voice-preparation/gpt-sovits-starter.zip` | 아래 시험용 참고 음성과 기본 대본을 모은 준비 묶음 |
| `voice-preparation/gpt-sovits/professor-reference-short.wav` | 약 7.33초 시험용 참고 음성 |
| `voice-preparation/gpt-sovits/default-cues.json`, `default-cues.txt` | 구버전 16문제용 34개 대본. 이번 배구단·노래 추가 및 사용자 편집은 미포함 |
| `voice-preparation/gpt-sovits/test-script.txt`, `START-HERE.txt` | 시험 문장과 기존 노트북용 시작 안내 |

최소한 **준비 ZIP + 새로 내보낸 문제/대본 백업 + 설정 메모**를 옮긴다. 더 좋은 참고 구간을 다시 고르려면 원본 WEBM 또는 전체 WAV도 함께 옮긴다. ZIP 안에도 목소리가 들어 있으므로 공개 저장소에 올리지 않는다. 루트의 `professor-reference.wav` 복사본 역시 공개 업로드 대상이 아니다.

## 4. 새 PC에서 저장소 받기

Git이 설치되어 있다면 PowerShell에서 실행한다. 아래 경로는 새 PC의 예시이므로 원하는 드라이브로 바꿔도 된다.

```powershell
git clone https://github.com/Gridex-Korea/quiz-ox.git D:\work\quiz-ox
Set-Location D:\work\quiz-ox
git branch --show-current
```

Git이 없다면 GitHub의 **Code → Download ZIP**으로 받은 뒤 압축을 푼다. 기존 체크아웃에 수정 사항이 있다면 무조건 덮어쓰거나 초기화하지 말고 새 폴더로 받는다.

### 퀴즈를 바로 실행할 때

1. `OX퀴즈.html`을 브라우저로 연다. Node.js·서버·인터넷은 필요 없다.
2. 문제 백업 JSON을 불러오고 **문제 적용**을 누른다.
3. 메모한 전체 설정과 시작·마무리 대본을 복원한다.
4. 최신 기본 18문제가 필요하면 현재 문제를 먼저 백업한 뒤 **행사 18문제 불러오기 → 문제 적용**을 선택한다. 기존 편집은 백업과 비교해 옮기고, 음성 제작용 JSON/TXT를 다시 내보낸다.
5. **프로젝션 창 열기**로 보조 화면을 열고 Windows 화면을 **확장**으로 설정한다. 관리자 창은 계속 열어 둔다.

### 소스를 수정할 때만

검증한 Node.js 버전은 **24.15.0**이다. 별도 설치한 Node.js와 프로젝트 의존성이 필요하다. GPT-SoVITS에 포함된 Python과는 별개다.

```powershell
npm ci
npm run test:offline
npm run lint
npm run build:offline
```

`npm ci`는 처음에 네트워크가 필요하다. 소스를 수정한 뒤에는 생성된 `OX퀴즈.html`도 함께 갱신한다. 실행 파일만 사용할 때는 위 설치 과정이 필요 없다.

## 5. 새 제작 PC의 GPT-SoVITS 설치

### 5-1. GPU 확인 후 패키지 선택

작업 관리자 → 성능 → GPU에서 모델명과 **전용 GPU 메모리**를 확인한다. NVIDIA PC라면 다음 명령도 사용할 수 있다.

```powershell
nvidia-smi
```

명령이 없다는 이유만으로 GPU가 없다고 단정하지 말고 작업 관리자와 드라이버도 확인한다. 모델명·VRAM·Windows 버전을 다음 작업자에게 전달한다. 현재 자료만으로 새 PC의 속도나 필요한 VRAM을 확정하지 않는다.

공식 자료:

- 프로젝트 및 Windows 실행 안내: <https://github.com/RVC-Boss/GPT-SoVITS>
- 공식 Windows 패키지 목록: <https://huggingface.co/lj1995/GPT-SoVITS-windows-package/tree/main>
- 열어 두었던 일반 패키지: <https://huggingface.co/lj1995/GPT-SoVITS-windows-package/blob/main/GPT-SoVITS-v5-20261005.7z>

2026-10-21 확인 기준 일반 패키지는 `GPT-SoVITS-v5-20261005.7z`(약 10.9GB), NVIDIA 50 시리즈용 별도 패키지는 `GPT-SoVITS-v5-20261005nvidia50x0.7z`(약 10.6GB)다. **새 PC의 GPU와 공식 안내를 확인한 뒤 선택한다.** 패키지 이름의 V5와 실제 선택할 음성 모델 버전은 구분한다.

일반 패키지의 확인된 SHA-256:

```text
0a612a28208250b3b67ea341efa1557d10bc886219100eff6c02528f6b9bdde7
```

다른 버전·NVIDIA 50 시리즈용 패키지에 이 해시를 적용하지 않는다. 다운로드가 끝났다면 `Get-FileHash -Algorithm SHA256 <파일경로>`로 비교할 수 있다.

### 5-2. 실행과 첫 모델 확인

1. 선택한 공식 패키지를 내려받고 `D:\GPT-SoVITS` 같은 별도 폴더에 압축을 푼다. 퀴즈 저장소 안에 설치하지 않는다. 압축 파일 외에 풀린 파일을 위한 여유 공간도 확보한다.
2. 패키지의 공식 안내에 따라 `go-webui.bat`을 실행한다.
3. 실제 모델 목록과 선택 가능한 추론 장치를 확인한다. 포함된 모델이 있다고 가정하지 않는다.
4. 첫 비교 시험은 **v2Pro**로 계획했다. GPT 가중치는 `s1v3.ckpt`, SoVITS 가중치는 `v2Pro/s2Gv2Pro.pth`가 기준이다. 더 최신 모델을 사용하려면 해당 모델의 참고 대본 요구사항과 속도를 따로 확인한다.
5. NVIDIA GPU를 인식하는 환경에서는 CUDA 장치를 선택한다. CPU로 시험한다면 설정은 `device=cpu`, `is_half=false`가 기준이다. GPU 환경의 정밀도 설정은 실제 카드와 패키지 안내에 맞춘다.

v2Pro에서 확인할 모델 경로(기준 폴더 `GPT_SoVITS/pretrained_models/`):

```text
s1v3.ckpt
v2Pro/s2Gv2Pro.pth
sv/pretrained_eres2netv2w24s4ep4.ckpt
chinese-hubert-base/config.json
chinese-hubert-base/preprocessor_config.json
chinese-hubert-base/pytorch_model.bin
chinese-roberta-wwm-ext-large/config.json
chinese-roberta-wwm-ext-large/tokenizer.json
chinese-roberta-wwm-ext-large/pytorch_model.bin
```

모델 공식 배포 위치: <https://huggingface.co/lj1995/GPT-SoVITS/tree/main>. 이 이름들은 한국어 작업에서도 사용하는 내부 모델 이름이다. 설치 패키지가 이미 갖고 있는 파일을 먼저 확인하고 부족한 것만 준비한다. 현재 프로젝트에서 이 설치 구성을 실제 실행해 검증한 상태는 아니다.

## 6. 먼저 짧은 음성 하나 만들기

1. `professor-reference-short.wav`를 직접 듣고 참고 음성으로 적합한지 확인한다.
2. 들리는 발화를 정확히 적어 참고 대본으로 준비한다. 현재 준비된 구간은 원본 **2.31~9.64초**를 쉼 기준으로 잘라 길이·형식만 확인했으며, 청취·정확한 전사는 아직 하지 않았다.
3. v2Pro는 참고 대본 없이 시험할 수 있지만 참고 음성은 필요하다. 가능하면 정확한 대본을 넣어 비교한다. V3/V4/V5에는 참고 대본이 필요하다.
4. 한국어를 선택하고 `test-script.txt`의 문장으로 한 번 합성한다.
5. 결과는 **`preview-test.wav`**로 저장하고 속도, 발음, 억양, 목소리 유사도를 들어본다.

시험 문장:

> 첫 번째 문제입니다. 전류 전쟁에서 테슬라는 교류를, 에디슨은 직류를 지지했다. 맞으면 왼손, 틀리면 오른손을 들어 주세요.

**이 시험 문장은 실제 기본 1번 문제의 완성 대본과 다르다.** 결과를 `question-01.wav`로 이름 붙여 행사 음성에 연결하지 않는다.

참고 음성은 3~10초가 필요한 경로를 기준으로 준비했다. 88초 전체 WAV를 그대로 넣는 대신 짧은 구간을 사용한다. 첫 결과가 좋지 않으면 다른 깨끗한 구간과 정확한 참고 대본부터 비교한다. 아직 별도 학습·파인튜닝은 진행하지 않았다.

## 7. 확정 대본으로 전체 음성 제작

현재 브라우저에서 **최신 18문제와 최종 설정을 적용한 뒤 새로 내보낸 제작용 JSON**의 각 `text`를 그대로 사용한다. 문제 추가로 번호가 바뀌었으므로 이전 34대본 JSON과 음성 파일명을 그대로 재사용하지 않는다. 현재 기본 대본은 38개다. 준비 ZIP의 `default-cues.*`는 기본 이름(사회자 김희진, 공동사회자 아스트라), 왼손 O 기준이며 사용자 편집은 반영하지 않았다.

| 대본 | 파일명 | 기본 개수 |
|---|---|---:|
| 시작 인사 | `intro.wav` | 1 |
| 문제 낭독 | `question-01.wav` ~ `question-18.wav` | 18 |
| 정답·해설 | `answer-01.wav` ~ `answer-18.wav` | 18 |
| 마무리 | `closing.wav` | 1 |

MP3도 지원하며 확장자만 `.mp3`로 바꿀 수 있다. 파일 이름은 내보낸 JSON의 `filename`을 기준으로 한다. 문제 수가 바뀌면 필요한 파일 수도 바뀐다.

제작용 JSON 형식은 `ox-cue-audio-v1`이며 `cues`에 `key`, `filename`, `text`가 들어 있다. 생성 파일과 제작에 사용한 JSON을 같은 폴더에 보관한다. 예를 들어 프로젝트의 `voice-output/quiz-final/`을 사용할 수 있다.

**GPT-SoVITS와 이 JSON을 연결하는 일괄 생성 도구는 아직 구현되지 않았다.** 먼저 한 문장의 결과를 승인한 뒤 수동 제작 또는 로컬 API를 이용한 일괄 생성 기능을 다음 작업으로 진행한다.

## 8. 행사 PC에 연결하고 리허설

1. 생성한 WAV/MP3와 제작용 JSON을 행사 PC에 복사한다.
2. `OX퀴즈.html`을 열고 문제와 전체 설정을 복원한다.
3. **음성 파일 + 대본 JSON 함께 불러오기**에서 파일과 JSON을 함께 선택한다.
4. 파일별 연결 상태를 보고 **현재 대본 다시 읽기**로 모두 들어본다. JSON 비교는 텍스트 일치만 확인하며 녹음의 실제 발화를 검사하지 않는다.
5. 관리자 창을 새로고침하거나 다시 열면 **음성 파일과 제작용 JSON을 다시 등록**한다. 음성은 현재 창의 메모리에만 저장된다.

리허설 항목:

- [ ] 시작 인사 → 문제 낭독 → 낭독 종료 후 타이머 → 다음 큐에서 정답·해설 → 다음 문제 → 마무리.
- [ ] 낭독·타이머 도중 중복 입력으로 문제가 넘어가지 않고, 시간이 끝나도 정답은 큐 전까지 숨겨지는지.
- [ ] **진행 멈춤 / Escape / 화면 가리기**로 낭독·음악·마이크가 멈추고 타이머가 일시정지하는지.
- [ ] 프로젝션 창의 문제·정답 표시와 관리자 창의 소리가 맞는지. 같은 PC·브라우저에서 사용한다.
- [ ] 발표 리모컨이 PageDown / 오른쪽 화살표 / Space를 보내며 관리자 또는 프로젝션 창에 포커스가 있는지. 편집 칸에서는 단축키를 실행하지 않는다.
- [ ] 음성 “큐”를 쓸 브라우저가 **기기 내 한국어 음성 인식과 설치된 언어 모델**을 지원하는지. 미지원이면 관리자 버튼 또는 리모컨으로 진행한다.
- [ ] 마지막 5초 숫자는 기존 PC TTS이므로 한국어 음성이 있는지, 필요하면 숫자 음성을 끌지.
- [ ] 녹음은 원래 속도로 재생되므로 제작 단계에서 말하기 속도를 확정했는지. 앱 속도 설정은 PC TTS에만 적용된다.
- [ ] 등록하지 않은 대본은 PC 음성으로 읽으므로 38개 연결 상태를 모두 확인했는지.

발표 리모컨 지원은 **브라우저가 받는 키 입력**을 이용한다. PowerPoint 앱의 다음 슬라이드 동작을 직접 감지하는 연동은 아니다. 음성 “큐” 인식도 GPT-SoVITS가 담당하지 않는다.

대본을 바꾸면 연결된 녹음이 사용 중지될 수 있다. 해당 음성을 다시 제작하거나 명시적으로 **PC 음성으로 읽기**를 선택한다. 직접 읽는 경우 **낭독 완료**로 이어간다.

## 9. 남은 문제·운영 결정

- 원문 16문제에 배구단·노래 2개를 추가해 현재 18문제다. 원문 문항은 사실관계 재검증을 하지 않았으며, 새 배구단 문제의 공식 명칭은 한국전력 홈페이지에서 확인했다. [추가 문제·배치표](../../questions/kiee-a-2026-additions.md)를 참고한다.
- 1~6번 제한시간 10초, 7~18번 5초. 1번은 맛보기다.
- 원문 5번인 현재 6번(페이커) 뒤 패자부활전 문항은 미정이며 자동 진행에 넣지 않았다.
- 8번 달리기 지문은 원문의 후보 상태다. 최종 확정 뒤 음성을 제작한다.
- 3번은 한국전력 배구단 이름 문제(정답 X — 빅스톰). 9번은 노래 빈칸 문제(빛 / 전기, 정답 빛)로 임시 배치했다. 사회자가 노래를 먼저 부른 뒤 9번 문제 큐를 실행한다. 노래 제목·가사는 아직 제공되지 않았다.
- 16번 보기: 딥러닝 / 침수(정답 침수). 18번 보기: 박종배 / 장길수(정답 박종배).
- 대본, 손 방향, 이름, 문제 수를 확정한 뒤 전체 음성을 만들어야 재작업이 줄어든다.

## 10. 다음 작업자에게 전달할 요청

다음 내용을 새 PC의 Codex에 전달하면 이어서 작업할 수 있다.

> Gridex-Korea/quiz-ox의 main을 받아 DOCS/planning/pc-migration-gpt-sovits.md와 README.md를 먼저 읽어 주세요. 행사 실행 대상은 OX퀴즈.html입니다. 음성 재생 연결은 구현됐지만 GPT-SoVITS 설치·모델 확인·실제 합성은 아직 하지 않았습니다. 별도로 옮긴 gpt-sovits-starter.zip과 최신 문제/대본 백업, 설정 메모가 있습니다. 먼저 이 PC의 GPU/VRAM과 옮겨 온 파일을 확인하고, 공식 GPT-SoVITS 패키지를 설치해 참고 음성으로 preview-test.wav 하나를 만들어 주세요. 사용자가 목소리를 확인한 뒤 확정 대본 JSON을 기준으로 전체 음성을 만들고, 퀴즈에 연결해 리허설까지 진행하려고 합니다. 참고 음성과 생성 음성·모델은 공개 GitHub에 올리지 마세요.
