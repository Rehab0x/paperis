# Paperis — TODO / 진척 기록

> 마지막 갱신: 2026-04-25 (MVP 8단계 + PWA 설치 지원 완료, 프로덕션 배포됨)
> MVP 로드맵 원본: [CLAUDE.md](CLAUDE.md) "개발 우선순위 (MVP)" 섹션

---

## 완료된 작업

### 1단계 — PubMed API 연동
- [x] 공통 타입 정의 ([types/index.ts](types/index.ts))
  - `Paper`, `NeedFilter`, `Language`, `ListenStyle`, `AccessLevel`, `PubmedSearchResponse`
- [x] PubMed E-utilities 클라이언트 ([lib/pubmed.ts](lib/pubmed.ts))
  - `esearch → efetch` 파이프라인, 경량 XML 파서(제목/Abstract/저자/저널/DOI/PMCID/PublicationType)
  - 니즈 필터 → PubMed 검색식 매핑 (treatment / diagnosis / trend / balanced)
  - `hasabstract[Filter]` + `english[Language]` 기본 적용
  - `PUBMED_API_KEY` 있으면 자동 부착(없어도 동작)
- [x] API 라우트 ([app/api/pubmed/route.ts](app/api/pubmed/route.ts))
  - `GET /api/pubmed?q=...&filter=...&retmax=...`

### 2단계 — Gemini 요약 연동
- [x] 스택 결정: **Gemini 단일 스택** (요약+TTS 모두, `@google/genai` SDK)
  - Claude/OpenAI 도입 금지 — memory에 기록됨
- [x] 요약 라이브러리 ([lib/gemini.ts](lib/gemini.ts))
  - `streamSummary({ paper, mode, language })` 제너레이터
  - 모드: `read` / `narration` / `dialogue` (phase 4 재사용)
  - 재활의학 용어 보존 규칙 (spasticity, FIM, Barthel, CIMT, mAs, NIHSS, Fugl-Meyer)
- [x] 스트리밍 라우트 ([app/api/summarize/route.ts](app/api/summarize/route.ts))
  - POST, `text/plain; charset=utf-8`, `ReadableStream<Uint8Array>` 로 토큰 단위 전송

### 3단계 — 기본 UI
- [x] 홈 페이지 ([app/page.tsx](app/page.tsx)) — 검색 흐름, 로딩 스켈레톤, 에러 박스, 추천 검색 칩 4개
- [x] [components/SearchBar.tsx](components/SearchBar.tsx) — 입력창 + 니즈 필터 칩(균형/치료/진단/동향)
- [x] [components/PaperList.tsx](components/PaperList.tsx) / [components/PaperCard.tsx](components/PaperCard.tsx)
  - 제목·저자·저널·연도·Open Access 배지·Publication Type·Abstract 더 보기/접기
  - PubMed / PMC / DOI 링크
  - AI 요약 한국어/English 버튼 + 스트리밍 커서 + 중단 버튼

### 4단계 — Gemini TTS 연동
- [x] TTS 라이브러리 ([lib/tts.ts](lib/tts.ts))
  - `gemini-2.5-flash-preview-tts` 기반
  - 내레이션: 단일 스피커 (`voiceConfig`) — 기본 음성 `Charon`
  - 대화체: 멀티 스피커 단일 호출 (`multiSpeakerVoiceConfig`) — A=`Kore`, B=`Puck`
  - `[A]:` / `[B]:` → `A:` / `B:` 정규화
  - 24kHz 16-bit mono PCM → 수동 WAV 헤더 래핑, `audio/wav` 반환
- [x] TTS 라우트 ([app/api/tts/route.ts](app/api/tts/route.ts))
  - POST `{ paper, style, language, scriptOnly? }`, Gemini로 스크립트 생성 후 합성
  - `maxDuration = 300` (대화체 장문 대응)
  - `X-Paperis-Script-Preview` 헤더에 스크립트 앞 2000자
- [x] 플레이어 ([components/AudioPlayer.tsx](components/AudioPlayer.tsx)) — `<audio controls>` 얇은 래퍼
- [x] PaperCard 통합 — 내레이션/대화체 버튼, 생성 중 취소, blob URL 생명주기 관리(`URL.revokeObjectURL`)

### 부가 작업 — 안정성/UX
- [x] Gemini 503 대응: `callWithRetry` 지수 백오프(500ms→1s→2s + jitter, 최대 3회)
- [x] 친절한 에러 메시지: 구글 2중 JSON 에러를 파싱해 "Gemini 서비스가 일시적으로 혼잡합니다…"로 치환
- [x] `[요약 중단]` 마커를 클라이언트에서 감지해 성공/에러 텍스트 분리, 빨간 박스 + "다시 시도" 버튼
- [x] 오디오 에러도 동일 패턴 + `pendingStyle` 유지로 올바른 스타일 재시도
- [x] 타이틀/lang/폰트: [app/layout.tsx](app/layout.tsx), [app/globals.css](app/globals.css) 한국어·Geist 적용

---

## 남은 작업 (MVP 로드맵)

### ~~5단계 — 니즈 필터 + AI 추천 3개~~ (완료)
- [x] 니즈 필터 칩 (치료/진단/동향/균형) — SearchBar
- [x] AI 추천 3개 ([lib/gemini.ts](lib/gemini.ts) `recommendPapers`, [app/api/recommend/route.ts](app/api/recommend/route.ts))
  - Gemini 구조화 출력(`responseSchema`)로 JSON 3개 강제
  - 필터별 가이드(treatment=RCT, diagnosis=validation, trend=review/meta, balanced=mixed)
  - 환각 PMID 필터링(검색 결과 집합 내에서만 선택 허용)
  - 재시도 로직(`callWithRetry`) 재사용
- [x] UI ([app/page.tsx](app/page.tsx), [components/PaperCard.tsx](components/PaperCard.tsx))
  - 검색 결과 상단에 "AI 추천 3편" 섹션, 아래에 "전체 결과" 섹션으로 분리
  - 추천 카드: 앰버색 보더·배지(`AI 추천 #1/2/3`) + 이유 박스
  - 추천은 검색 렌더 이후 백그라운드 비동기로 fetch → 검색 UX 지연 없음
  - 실패 시 조용히 "추천 다시 시도" 링크만 표시, 전체 결과는 그대로 보임

### ~~6단계 — 연관 주제 연결 학습~~ (완료)
- [x] "이 주제 더 찾아보기" 토글 + 자연어 힌트 입력창 (PaperCard 내부)
- [x] Gemini가 시드 논문 + 힌트로 PubMed 검색식 생성 ([lib/gemini.ts](lib/gemini.ts) `generateRelatedQuery`, 구조화 출력)
- [x] 결과는 재검색해 최대 5편 인라인 렌더링 ([app/api/related/route.ts](app/api/related/route.ts))
- [x] 무한 체인 방지: `MAX_RELATED_DEPTH=2` — 총 3레벨까지 탐색, 그 이하는 버튼 숨김
- [x] 중복 방지: 시드 PMID + 이미 펼친 PMID들을 `excludePmids`로 서버에 전달해 필터링
- [x] "더 찾기" 버튼으로 같은 힌트/새 힌트로 추가 5편 요청 가능

### ~~7단계 — PDF 업로드 처리~~ (완료)
- [x] 유료 논문(`access === "closed"`) 카드에 PDF 업로드 슬롯 자동 표시
- [x] Drag&drop + 파일 선택 + 15MB 상한 + PDF MIME/확장자 검증 ([components/PdfUpload.tsx](components/PdfUpload.tsx))
- [x] 서버에서 `unpdf`(pdfjs-dist serverless) + Node 22.17 호환 `Promise.try` 폴리필로 파싱 ([app/api/pdf/route.ts](app/api/pdf/route.ts))
  - `pdf-parse` v2는 Next/Turbopack에서 pdfjs worker 경로가 꼬여 실패 → 서버리스 친화적인 `unpdf`로 전환
  - `next.config.ts` `serverExternalPackages: ["unpdf", "pdfjs-dist"]`로 번들러 개입 차단
  - 추출 텍스트가 200자 미만이면 422(스캔 PDF 안내)
- [x] 서버 저장 없음 — 응답 후 버퍼 폐기, 파일 시스템에 남기지 않음
- [x] 클라이언트에서 `pdfAttachment` 상태로 보관, `effectivePaper.abstract = pdfText`로 downstream 호출(요약/TTS/연결 학습)에 전달 ([components/PaperCard.tsx](components/PaperCard.tsx))
- [x] "PDF 연결됨" 배지 + 파일명·페이지·글자수 표시 + "해제" 버튼으로 다시 Abstract 모드로

### ~~8단계 — Vercel 배포~~ (완료)
- [x] Vercel CLI(`vercel`)로 로컬에서 배포, 프로젝트 `randy-kims-projects-6c97c3d7/paperis` 생성·링크
- [x] Production URL: https://paperis.vercel.app (alias) + 롱폼 URL
- [x] `GEMINI_API_KEY`를 Production, Development에 주입 (Preview는 git-branch 요구로 스킵)
- [x] `next build` 로컬 통과 확인 + Vercel 빌드 통과 (34s)
- [x] Live smoke test: `/`, `/api/pubmed`, `/api/summarize` 정상
- [ ] Hobby 플랜 maxDuration 실측 — `/api/tts` 대화체 장문에서 timeout 발생 여부 확인 필요
- [ ] (선택) favicon / OG 이미지 / meta 튜닝
- [ ] (선택) GitHub 레포 연결해 push-auto-deploy 전환 + Preview env 추가

### 추가 — PWA 설치 지원 (완료)
- [x] Web App Manifest ([app/manifest.ts](app/manifest.ts)) — standalone, 한국어, theme/background 컬러
- [x] 아이콘 PNG 3종 ([public/icons/](public/icons/)) — 192/512/512-maskable + apple-icon-180
- [x] Service Worker ([public/sw.js](public/sw.js)) — 정적 자산 cache-first, API/스트리밍은 우회(respondWith 호출 안 함)
- [x] Metadata API로 viewport theme-color(light/dark), apple-web-app, icons 선언 ([app/layout.tsx](app/layout.tsx))
- [x] 클라이언트 등록 ([components/RegisterSW.tsx](components/RegisterSW.tsx)) — production 빌드에서만 `/sw.js` 등록
- [x] 라이브 확인: manifest/sw/icons 모두 200, manifest 내용 올바름

---

## 기술부채 / 개선 후보 (우선순위 낮음)

- [ ] **키 회전**: 이 대화 로그에 `GEMINI_API_KEY` 노출됨 → Google AI Studio에서 revoke 후 재발급 권장
- [ ] **PWA 오프라인 지원**: 지금 SW는 설치 가능성만 보장. 홈 shell/정적 페이지 precache 추가 시 오프라인 첫 화면 가능
- [ ] **Open Access 논문 full text 요약**: 현재는 `access: "open"` 표시만 함. PMC fetch 붙여 full text 요약 모드 추가
- [ ] **스크립트 미리보기 UI**: 서버가 `X-Paperis-Script-Preview` 헤더로 주는데 클라이언트는 아직 활용 안 함. 오디오 위에 "스크립트 보기" 토글
- [ ] **검색 결과 페이지네이션 / 더 보기**: 현재 최대 50건 고정
- [ ] **PubMed rate limit**: 초당 3회 제한 대응 (API 키 없을 때). 현재는 사용자 1인 개발 기준이라 문제없음
- [ ] **에러 바운더리**: React error boundary 없음. 런타임 에러 시 화면이 깨짐
- [ ] **모바일 반응형 점검**: 카드 내부 버튼 그룹이 좁은 폭에서 좀 빡빡함
- [ ] **테스트**: 단위 테스트 0개. `lib/pubmed.ts` XML 파서, `lib/tts.ts` WAV 래퍼, `[A]:` 정규화 같은 순수 함수부터 추가 가치 높음
- [ ] **CSP / 보안 헤더**: 프로덕션 배포 전 기본 `Content-Security-Policy` / `X-Frame-Options` 설정
- [ ] **TTS 비용/길이 제어**: 현재 스크립트 길이를 제한하지 않음. 길이 상한 / 요약 압축 옵션
- [ ] **장기 캐시**: 같은 PMID + 같은 옵션으로 요약/오디오 재요청 시 Vercel KV 등으로 캐싱
- [ ] **Gemini TTS 안정판 전환**: `preview` 꼬리표 떨어지면 모델명 업데이트

---

## 의사결정 기록 (변경 금지 항목)

- **단일 AI 스택**: 요약+TTS 모두 Gemini. Claude / OpenAI SDK 도입 금지. 필요 시 사용자와 재합의 후에만.
- **대화체 태그 포맷**: `[A]:` / `[B]:` 고정. 프롬프트(`lib/gemini.ts`)와 TTS(`lib/tts.ts`) 양쪽이 이 포맷에 묶여 있음 — 바꾸려면 동시에 수정.
- **WAV 헤더 수동 래핑**: Gemini TTS가 PCM을 주고 브라우저는 WAV를 바로 재생. 이 경로 유지.
- **한국어 우선 UI**: 영어 토글은 있지만 기본 UI 문구·에러 메시지는 한국어.
- **PDF 파서는 `unpdf` 사용**: `pdf-parse`는 Turbopack에서 worker 경로 문제로 실패. `pdfjs-dist`는 번들러 개입 시 `Promise.try` 폴리필이 필요 (Node 22.17 미만). `next.config.ts`의 `serverExternalPackages`에서 제거하지 말 것.
