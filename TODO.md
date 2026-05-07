# Paperis — TODO / 진척 기록

> 마지막 갱신: 2026-05-04 (v2.0.4 라이브, v3 시작 직전 스냅샷)
> 외부 노출 문서는 [README.md](README.md), 컨텍스트는 [CLAUDE.md](CLAUDE.md). 이 파일은 작업 일지·기술부채 보관용.

---

## v3 시작 컨텍스트 (이 섹션은 v3 첫 세션이 먼저 읽어야 한다)

### 현재 상태
- **라이브**: paperis.vercel.app, **v2.0.4** (master 브랜치, tag `v2.0.4`, commit `87b06fc`)
- **GitHub**: Rehab0x/paperis (master + v2.0.0 ~ v2.0.4 태그)
- **Vercel**: Pro plan (5분 function timeout). 프로젝트 `randy-kims-projects-6c97c3d7/paperis`. 자동 git deploy 비활성, **수동 `vercel deploy --prod --yes`** 가 정식 배포 경로
- **Vercel prod env**: `GEMINI_API_KEY`, `UNPAYWALL_EMAIL=randymcg83@gmail.com`만 등록. `NCP_CLOVA_*` / `GOOGLE_CLOUD_TTS_API_KEY`는 사용자 .env.local에만 있음 — 사용자는 v2.0.4의 **앱 내 설정 → API 키** 입력 패널에서 본인 키를 넣고 prod에서 직접 사용 중
- **사용자 .env.local**: `GEMINI_API_KEY` / `PUBMED_API_KEY` / `UNPAYWALL_EMAIL` / `NCP_CLOVA_CLIENT_ID` / `NCP_CLOVA_CLIENT_SECRET` / `GOOGLE_CLOUD_TTS_API_KEY` 모두 존재

### v3 시작 시 알아둘 핵심 결정 (load-bearing)
- **단일 AI 스택은 깨졌다**. v2.0.3에서 Naver Clova, v2.0.4에서 Google Cloud TTS가 등록되어 TTS는 3-provider 라우팅. 검색식·요약은 여전히 Gemini만.
- **API 키는 사용자별 입력 가능**. 클라이언트가 localStorage에 저장 후 모든 fetch에 `X-Paperis-Keys: base64(JSON)` 헤더로 동봉. 서버 라우트가 `applyUserKeysToEnv(req)`로 process.env override → provider들이 그 키 사용. (Node 단일 프로세스 race가 이론상 가능하지만 dev/단일 사용자 prod에선 무시 가능 수준이라 의도적으로 단순화. 동시성 문제 의심되면 provider별 ctx 인자로 변경 검토)
- **테마는 class 기반 dark variant**. globals.css의 `@variant dark (&:where(.dark, .dark *));` + ThemeProvider가 html에 `.dark` 토글. FOUC는 layout `<head>` 안 inline script로 hydration 전에 처리. `<html>`에 `suppressHydrationWarning` 필수.
- **PlayerBar 높이는 동적 CSS 변수** (`--player-bar-h`). ResizeObserver로 측정 → 라이브러리/설정 드로어가 그 위에서 끝남. PlayerBar가 모바일에선 두 줄, 데스크탑에선 한 줄로 높이가 달라지므로 hardcode 금지.
- **TTS provider chunk 분할**. Clova 1900 byte, Google Cloud 4500 byte. Gemini는 한 번에 전체. MP3는 byte concat으로 자연스럽게 합쳐짐 (ID3 tag 없는 raw frame 가정).
- **라이브러리 list은 audioBlob 제외 메타만**. `listTrackMetas()` cursor 순회로 메모리 폭주 회피 (트랙 5–10편 동시 로드 시 Chrome STATUS_ACCESS_VIOLATION 크래시 사례). 재생 시점에만 `getTrackAudio(id)`로 그 트랙 blob 로드.
- **검색 안전망**: PubMed esearch는 종종 HTML/플레인 텍스트 응답 → `res.text()` → `JSON.parse` try/catch로 친절 메시지 변환. Gemini는 가끔 raw 제어문자(\n, \r) 포함된 query 반환 → query-translator에서 sanitize. friendlyErrorMessage가 JSON parse 에러도 retryable로 감지.
- **v2의 master 브랜치는 v1.1과 별개로 v2 라인이 자리잡음**. v3는 master에서 다시 분기할지, v2.x로 진화시킬지 결정 필요.

### 알려진 이슈·한계 (v3에서 다뤄볼 후보)
- 인용수순 정렬은 현재 페이지(20건) 내에서만 — 진정한 글로벌 인용수 정렬은 OpenAlex Works API 별도 검색이 필요해 v2에서 보류
- 영어 UI 토글 미지원 (한국어 고정)
- HTML 풀텍스트 추출은 자체 구현 — 일부 publisher 페이지에서 정확도 떨어짐 (`@mozilla/readability` 도입 미정)
- 검색 결과의 `[MeSH Terms]` 매핑이 Gemini 정확도에 의존. 빈 결과 발생 시 자동 broadening 로직 없음 (사용자가 수동 재검색)
- TTS narration 길이가 어떤 논문에선 5분 넘어 Vercel function timeout 한계 근접 — chunk 단위 progressive 합성/스트리밍 미구현
- Clova Premium은 정액제(월 9만원) — 사용자가 prod에 영구 적용은 보류, 본인 .env.local에서만 평가
- 라이브러리 백업 JSON은 base64 인코딩이라 트랙 50편 = 100MB+. 개별 트랙 export 또는 zip 압축 미구현
- TTS 변환 결과가 첫 응답 이후 자동 재시도 안 됨 (사용자가 수동으로 다시 누름)
- IndexedDB 라이브러리는 브라우저 로컬 — 다른 기기 동기화 X (의도된 v2 결정. v3에서 클라우드 동기화 도입은 별도 결정 사항)

### 핵심 파일 빠른 인덱스
```
app/
  layout.tsx                     루트 — Theme/ApiKeys/TtsProviderPreference/TtsQueue/Player Provider 중첩, FOUC inline script, suppressHydrationWarning
  page.tsx                       HomeInner — 검색·페이지네이션·디테일 패널 통합
  api/
    search/route.ts              자연어 → 검색식 → PubMed → OpenAlex → 정렬
    summarize/route.ts           미니 요약 batch
    summarize/read/route.ts      긴 요약 streaming
    fulltext/route.ts            Unpaywall → EPMC → PMC 체인
    pdf/route.ts                 unpdf 텍스트 추출
    tts/route.ts                 narration 생성 + provider.synthesize
    tts/preview/route.ts         설정 패널 미리듣기 (v2.0.4 신규)
components/
  PaperDetailPanel.tsx           디테일 패널 본체 (풀텍스트·긴요약·TTS)
  PlayerProvider/PlayerBar.tsx   글로벌 플레이어, --player-bar-h CSS 변수
  LibraryDrawer/AudioLibrary.tsx 라이브러리 (드로어 + 트랙 리스트)
  SettingsDrawer.tsx             6개 섹션 (테마·provider·화자속도·알림·API키·백업복원)
  ThemeProvider.tsx              class 기반 dark, hydration safe useState init
  ApiKeysProvider.tsx            6종 키 localStorage + X-Paperis-Keys 헤더 동봉
  TtsProviderPreferenceProvider.tsx provider/voiceByProvider/speakingRate
  TtsQueueProvider.tsx           글로벌 TTS 큐 (FIFO, 단일 워커, 완료 토스트+Notification)
  useFetchWithKeys.ts            X-Paperis-Keys 자동 동봉 fetch wrapper
lib/
  pubmed.ts openalex.ts xml-utils.ts
  gemini.ts                      callWithRetry / friendlyErrorMessage / streamSummary / generateNarrationText
  query-translator.ts            gemini-2.5-flash-lite + responseSchema + control char sanitize
  query-cache.ts client-cache.ts 서버 LRU + 클라 localStorage
  paper-type.ts summary.ts
  fulltext/                      unpaywall·europe-pmc·pmc·html-extract·index
  tts/                           types · gemini · clova · google-cloud · index (registry)
  audio-library.ts               idb CRUD + listTrackMetas + exportLibrary/importLibrary
  user-keys.ts                   X-Paperis-Keys 헤더 → process.env override
  promise-polyfill.ts            Node 22.17 Promise.try 폴리필 (unpdf 호환)
  anonymous-id.ts
public/sw.js                     paperis-v2 cache (정적 자산만, /api/는 무개입)
```

### v3 시작 시 안전한 첫 행동
1. 사용자에게 v3 방향성·범위·이름(v3? v2.x→v3?) 확인
2. master에서 분기할지, v3 브랜치를 새로 팔지 결정
3. 변경 폭이 크면 EnterPlanMode → AskUserQuestion으로 의사결정 갈래 좁히기

---

## v2 브랜치 — 새 시작 라인

v1.1.0 라이브 시점에 사용자가 v2 방향성을 새로 잡아 master에서 분기. v2.0.0 시점부터 master에서 v2 코드로 fast-forward됨. v1 시리즈는 master의 `v1.1.0` 태그까지가 마지막.

### v2 출시 (master)

| 버전 | 날짜 | 핵심 |
|---|---|---|
| **v2.0.4** | 2026-05-04 | 설정 패널 확장 — 6개 섹션 완성 (테마·TTS provider·화자/속도+미리듣기·알림 권한·API 키 6종 입력·라이브러리 백업/복원). Google Cloud TTS provider 추가 (Neural2/WaveNet, 월 1M자 무료). API 키는 클라 localStorage → `X-Paperis-Keys` 헤더 → 서버 process.env override |
| **v2.0.3** | 2026-05-04 | 페이지네이션 (20건씩 `?page=N`), 앱 설정 패널·테마(라이트/다크/시스템) 도입, Naver Clova Voice provider 등록(설정에서 선택), 헤더 단순화(🎧+⚙ 아이콘), 영어 검색 prompt 보강, PubMed esearch JSON 안전망, Gemini control char sanitize, 친절 에러 메시지에 JSON parse 패턴 |
| **v2.0.2** | 2026-04-30 | 라이브러리 드로어 슬라이드 애니메이션·max-w-5xl, PlayerBar 동적 높이(`--player-bar-h`), 모바일 컨트롤 두 줄 + −10/+10 텍스트, TTS 큐 배지 클릭 시 진행/대기 popover, 트랙별 `📜` 인라인 스크립트, 트랙 → `🔎` 논문 디테일, IndexedDB v1→v2(position 인덱스), `listTrackMetas`로 메모리 폭주 회피, `Promise.try` 폴리필, fetch timeout, backdrop-blur 전부 제거 |
| **v2.0.1** | 2026-04-29 | 미니 요약 첫 줄에 주제 강제, 모바일/좁은 화면 디테일 패널 풀스크린 + 닫기, 풀텍스트 체인 단계별 fail/skip 사유 노출, PubMed `<ReferenceList>` 안의 ArticleId가 paper 본인 doi/pmcId를 덮던 파서 버그 fix, useEffect Strict Mode mount→cleanup→mount에서 첫 fetch 응답이 cancelled 처리되던 문제 fix, Node 22 Promise.try 폴리필 |
| **v2.0.0** | 2026-04-29 | 마일스톤 1–8 일괄 — 자연어 검색·미니/긴 요약·풀텍스트 체인·TTS narration·오디오 라이브러리·anonymous ID·로그인/DB 제거 (master를 v2 코드로 fast-forward) |

### v2 마일스톤 (모두 완료, 2026-04-29)

- **M1 인프라 정리** — v2 브랜치 분기, app/components/lib/types 삭제 후 인프라(package.json, next.config, tsconfig, tailwind v4 CSS-first, manifest.ts, sw.js, 아이콘)만 보존. auth/db 의존성(next-auth, drizzle, neon, dotenv) 제거, idb 추가
- **M2 검색 백엔드** — types/index.ts 재정의(SortMode·MiniSummary·FullTextSource·AudioTrack 등), [lib/pubmed.ts](lib/pubmed.ts)·[lib/openalex.ts](lib/openalex.ts)·[lib/xml-utils.ts](lib/xml-utils.ts) 포팅, [lib/gemini.ts](lib/gemini.ts) 유틸리티(callWithRetry/friendlyErrorMessage), [lib/query-translator.ts](lib/query-translator.ts) (Gemini 2.5 Flash Lite + responseSchema), [lib/query-cache.ts](lib/query-cache.ts) 서버 LRU, [app/api/search/route.ts](app/api/search/route.ts)
- **M3 검색 UI** — [SearchBar](components/SearchBar.tsx) / [SortControl](components/SortControl.tsx) / [ResultsList](components/ResultsList.tsx) / [PaperCard](components/PaperCard.tsx), [lib/client-cache.ts](lib/client-cache.ts) localStorage TTL, [app/page.tsx](app/page.tsx) 마스터-디테일, URL이 source of truth (`?q&sort&pmid&page`)
- **M4 미니 요약** — [lib/paper-type.ts](lib/paper-type.ts) classifyPaperType, [lib/summary.ts](lib/summary.ts) batch JSON 모드 (research vs review 분기), [app/api/summarize/route.ts](app/api/summarize/route.ts), [components/MiniSummary.tsx](components/MiniSummary.tsx). 상위 3개 자동 batch + 4번~ 클릭 시 단일
- **M5 풀텍스트 체인** — [lib/fulltext/](lib/fulltext/) (unpaywall · europe-pmc · pmc · html-extract · index 오케스트레이터), [app/api/fulltext/route.ts](app/api/fulltext/route.ts), [app/api/pdf/route.ts](app/api/pdf/route.ts) (unpdf), [components/FullTextView.tsx](components/FullTextView.tsx) / [PdfUpload.tsx](components/PdfUpload.tsx) / [PaperDetailPanel.tsx](components/PaperDetailPanel.tsx). 긴 요약 스트리밍은 [lib/gemini.ts](lib/gemini.ts)의 `streamSummary` + [app/api/summarize/read/route.ts](app/api/summarize/read/route.ts)
- **M6 TTS provider** — [lib/tts/types.ts](lib/tts/types.ts) 인터페이스, [lib/tts/gemini.ts](lib/tts/gemini.ts) GeminiTtsProvider (narration only, WAV LE 래핑 보존), [lib/tts/index.ts](lib/tts/index.ts) registry, [app/api/tts/route.ts](app/api/tts/route.ts), [components/TtsButton.tsx](components/TtsButton.tsx), [lib/audio-library.ts](lib/audio-library.ts) idb CRUD + BroadcastChannel, [lib/anonymous-id.ts](lib/anonymous-id.ts)
- **M7 오디오 라이브러리 + 글로벌 플레이어** — [components/PlayerProvider.tsx](components/PlayerProvider.tsx) 컨텍스트 (단일 audio element ref, 자동 다음 트랙, 키보드 단축키), [components/PlayerBar.tsx](components/PlayerBar.tsx) 하단 고정, [components/AudioLibrary.tsx](components/AudioLibrary.tsx), [components/LibraryLink.tsx](components/LibraryLink.tsx) 카운트 배지
- **M8 마무리** — README.md / CLAUDE.md / TODO.md를 v2 기준으로 갱신, .env.example 정리, `npm run build` 통과 확인

### v1과 v2 차이 요지

| | v1 | v2 |
|---|---|---|
| 검색 | 키워드 + 4 니즈 필터 | 자연어 + Gemini 검색식 변환 (캐싱) + 페이지네이션 |
| 정렬 | 4축 가중치 슬라이더 | 최신/인용수/적합도 라디오 |
| 요약 | 한 모드 (긴 요약) | 미니(카드) + 긴(디테일) 분리, paperType 분기 |
| 풀텍스트 | PMC만 | Unpaywall → EPMC → PMC → PDF |
| TTS | narration + dialogue (Gemini) | narration only, **3 provider 라우팅** (Gemini · Clova Premium · Google Cloud Neural2) + 화자/속도 + 미리듣기 |
| 오디오 | 장바구니 + 일회성 재생목록 | IndexedDB 라이브러리 (트랙 누적, 자동 재생 X), **백업/복원**, 글로벌 PlayerBar + 인라인 스크립트 |
| 인증/DB | Auth.js v5 + Neon Postgres | 없음 (anonymous ID만) |
| 설정 | 없음 | **6개 섹션 설정 패널** (테마·provider·화자속도·알림·API 키·백업) |
| 테마 | 시스템만 (prefers-color-scheme) | 라이트/다크/시스템 + 사용자 저장 |

---

## 출시 버전 (v1 시리즈, master 브랜치)

| 버전 | 날짜 | 핵심 |
|---|---|---|
| **v1.1.0** | 2026-04-26 | Google OAuth 로그인 (Auth.js v5), Neon Postgres + Drizzle ORM, 카트/추천 가중치 디바이스 간 동기화, 비로그인 모드는 그대로 |
| v1.0.3 | 2026-04-25 | PMC PMID 미스매치 검증, Open Access 카드 PDF 업로드, 카트 항목 클릭 → 메인 우측 상세, 풀텍스트 기반 재생목록 narration |
| v1.0.2 | 2026-04-25 | 페이지 번호 버튼, 출퇴근 재생목록(장바구니+병렬 짧은 narration+커스텀 트랙 플레이어), 키보드 시크 ←/→/Space, 트랙→PaperCard 모달, 헤더 로고 홈 링크 |
| v1.0.1 | 2026-04-25 | 추천 가중치 슬라이더(최신성/인용수/저널/니즈) + OpenAlex enrichment + 결정론적 스코어링, PMC Open Access full-text 요약, 마스터-디테일 + 카드 캐시, Gemini 503 자동 재시도 |
| v1.0.0 (MVP) | 2026-04-24 | PubMed 검색 + 니즈 필터, Gemini 한국어/영어 스트리밍 요약, Gemini TTS narration / dialogue (멀티스피커, audio/wav), 연관 학습, PDF 업로드(unpdf), PWA 설치, Vercel 배포 |

---

## 완료된 작업

### MVP 1~8단계 (v1.0.0)
- 1단계 PubMed 연동 ([lib/pubmed.ts](lib/pubmed.ts), [app/api/pubmed/route.ts](app/api/pubmed/route.ts), [types/index.ts](types/index.ts))
- 2단계 Gemini 요약 ([lib/gemini.ts](lib/gemini.ts) `streamSummary`, [app/api/summarize/route.ts](app/api/summarize/route.ts))
- 3단계 기본 UI ([components/SearchBar.tsx](components/SearchBar.tsx) / [PaperList.tsx](components/PaperList.tsx) / [PaperCard.tsx](components/PaperCard.tsx))
- 4단계 Gemini TTS ([lib/tts.ts](lib/tts.ts) — `gemini-2.5-flash-preview-tts`, `[A]:`/`[B]:` 정규화, 24kHz mono PCM → WAV 헤더 수동 래핑)
- 5단계 추천 3편 (`recommendPapers` → 이후 v1.0.1에서 결정론적 스코어링으로 교체)
- 6단계 연관 학습 ([app/api/related/route.ts](app/api/related/route.ts) — `MAX_RELATED_DEPTH=2`, excludePmids로 중복 방지)
- 7단계 PDF 업로드 ([components/PdfUpload.tsx](components/PdfUpload.tsx), [app/api/pdf/route.ts](app/api/pdf/route.ts) — unpdf, `Promise.try` 폴리필, `next.config.ts` `serverExternalPackages`)
- 8단계 Vercel 배포 — `paperis.vercel.app`, `GEMINI_API_KEY` Production/Development 등록
- PWA 설치 — manifest.ts + sw.js + 192/512/maskable 아이콘 + RegisterSW
- 안정성 — `callWithRetry` 지수 백오프, `[요약 중단]` 마커 기반 친절한 에러 박스 + 다시 시도 버튼

### v1.0.1 — 추천 시스템 재설계 + Full-text 요약 + 레이아웃
- **추천 시스템 재설계**: Gemini가 픽킹하던 구조를 **결정론적 스코어링**으로 분리
  - [lib/openalex.ts](lib/openalex.ts) — PMID 일괄 enrichment(인용수, `2yr_mean_citedness`)
  - [lib/scoring.ts](lib/scoring.ts) — 4축 점수(최신성/인용수/저널/니즈), 가중치별 정렬
  - [lib/gemini.ts](lib/gemini.ts) `explainRecommendations` — 픽킹 결과에 한국어 한 문장 이유만 생성
  - [components/RecommendWeights.tsx](components/RecommendWeights.tsx) — 4 슬라이더 + localStorage(`paperis.recommend.weights.v1`)
  - 결과: 환각 PMID 위험 사라짐 + 사용자가 "최신/인용/저널/필터" 4축으로 추천을 직접 조절
- **PMC Open Access full-text 요약**:
  - [lib/pmc.ts](lib/pmc.ts) — JATS XML 파싱(fig/table/refs 제거, 30k자 캡, head 70%+tail 25% 트림)
  - [app/api/pmc/route.ts](app/api/pmc/route.ts), [lib/xml-utils.ts](lib/xml-utils.ts) — `pubmed.ts`와 공용
  - `SummarizeInput.sourceLabel` 추가 → 시스템 인스트럭션이 "abstract-only" disclaimer 자동 생략
  - PaperCard 첨부 슬롯 통합: PDF 업로드(closed) / PMC 가져오기(open) 모두 `fullText` 단일 필드
- **마스터-디테일 레이아웃**:
  - URL이 source of truth(`?q&filter&page&pmid`) — 새로고침/공유에도 유지
  - 데스크톱 좌목록 우상세, 모바일은 스택 네비
  - [lib/card-cache.ts](lib/card-cache.ts) — pmid 키 세션 캐시(요약/오디오/연관/첨부 상태 보존)

### v1.1.0 — 로그인 + 디바이스 동기화
- **인증**: Auth.js v5 + Google OAuth + database session ([auth.ts](auth.ts), [app/api/auth/[...nextauth]/route.ts](app/api/auth/%5B...nextauth%5D/route.ts))
  - `session` 콜백에서 `user.id` 명시 매핑 — Drizzle adapter + database session 조합에서 클라이언트로 user.id 전달 보장
- **DB**: Neon Postgres + Drizzle ORM ([lib/db/schema.ts](lib/db/schema.ts), [lib/db/index.ts](lib/db/index.ts), [drizzle.config.ts](drizzle.config.ts))
  - Auth.js 표준 4개 + `user_cart` (unique on user_id+pmid) + `user_weights` (PK user_id)
- **계정 API** ([app/api/account/cart/route.ts](app/api/account/cart/route.ts), [app/api/account/weights/route.ts](app/api/account/weights/route.ts))
  - 카트 PUT은 race-safe **멱등 upsert** (`onConflictDoUpdate` + `notInArray` delete) — Neon HTTP는 statement-level이라 진짜 트랜잭션 X
- **클라이언트 동기화** ([components/AccountSyncProvider.tsx](components/AccountSyncProvider.tsx), [lib/cart.ts](lib/cart.ts), [lib/weights-store.ts](lib/weights-store.ts))
  - 첫 로그인: server↔local 머지 후 한 번 PUT
  - 평상시: subscribeCart/subscribeWeights → 350ms debounce → 서버 PUT
  - `setStoredWeights`는 같은 값이면 dispatch 생략, page subscribe 콜백은 functional update + equality 체크 → 무한 루프 방지
- **헤더 UI** ([components/AuthMenu.tsx](components/AuthMenu.tsx)): 로그인 버튼 / 로그인 후 아바타 드롭다운(이름/이메일/로그아웃)
- 비로그인 모드는 기존 localStorage만 사용해 그대로 동작 — 서버 동기화는 부가 기능

### v1.0.3 — PMC 미스매치 + 풀텍스트 재생목록
- PMC 응답에 `articlePmid`, `articleTitle` 동봉 → 시드 PMID와 다른 본문 감지 + 빨간 경고 + "그래도 사용" / 취소 + PDF 업로드 fallback ([lib/pmc.ts](lib/pmc.ts), [components/PaperCard.tsx](components/PaperCard.tsx))
- Open Access 카드도 PDF 업로드 슬롯 노출
- 장바구니 항목 클릭 → 메인 페이지 우측 상세 (PaperModal 대신 마스터-디테일 통합)
- 재생목록 "본문(full text)으로 narration" 토글 — 카드 캐시 + Open Access 자동 PMC fetch + abstract fallback ([components/CartPanel.tsx](components/CartPanel.tsx))
- `/api/playlist` paper별 `sourceLabels` 배열 수용 → abstract-only disclaimer 자동 제거

### v1.0.2 — 페이지네이션 UX + 출퇴근 재생목록
- 숫자형 페이지네이션 ([components/Pagination.tsx](components/Pagination.tsx)) — `← 1 … 11 [12] 13 … 50 →`
- **출퇴근 재생목록(장바구니 패턴)**:
  - [lib/cart.ts](lib/cart.ts) — localStorage + custom event(같은 탭 컴포넌트 동기화), 최대 10편
  - [components/CartButton.tsx](components/CartButton.tsx) — 카드 헤더 토글
  - [components/CartPanel.tsx](components/CartPanel.tsx) — 슬라이드 오버 + 짧은 모드 체크박스 + 한 번에 생성
  - [app/api/playlist/route.ts](app/api/playlist/route.ts) — `Promise.all` 병렬 narration + TTS, 트랙별 base64 JSON
  - [lib/gemini.ts](lib/gemini.ts) `SummarizeInput.brief` — 1-2분 출퇴근 다이제스트 모드
- **커스텀 플레이어**:
  - [components/PlaylistPlayer.tsx](components/PlaylistPlayer.tsx) — ⏮ ⏭ 트랙 점프, ±10초 시크, 진행바, 트랙 리스트
  - 키보드: ← / → 10초 시크, Space 재생/일시정지 (입력창 포커스 시 무시)
  - "📄 이 논문 보기" → [components/PaperModal.tsx](components/PaperModal.tsx) 풀 PaperCard, ESC로 닫힘
  - 카드 캐시 덕에 모달에서 본 요약이 검색 결과에서도 그대로 보임
- **헤더 UX**: 로고/이름 클릭 → 홈(`/`), SearchBar가 URL prop 변화에 동기화

---

## 다음 후보 (v1.2 ~)

- [ ] **이메일 magic link 로그인**: Resend/SES 등 메일 발신 셋업 후 Auth.js EmailProvider 추가 — Google 외 옵션
- [ ] **청취 진행률 / 들은 트랙 표시**: 같은 큐를 며칠에 나눠 듣기 + 트랙별 lastPosition 서버 저장
- [ ] **트랙 IndexedDB 영속화**: 한 번 만든 재생목록을 새로고침 후에도 유지
- [ ] **백그라운드 청취**: CartPanel 닫아도 audio 유지되는 persistent mini-player
- [ ] **검색/탐색 히스토리** 서버 저장
- [ ] **카드 캐시 서버 저장**: 요약/오디오는 비싸니 디바이스 간 공유

## 기술부채 / 개선 후보 (우선순위 낮음)

- [ ] **키 회전**: 이 대화 로그에 `GEMINI_API_KEY`/Vercel 토큰 노출됨 → 발급처에서 revoke 후 재발급 권장
- [ ] **백그라운드 청취**: CartPanel 닫으면 `<audio>`가 unmount → 재생 정지. 패널 외부에 persistent 플레이어 영역을 두고 패널 닫아도 음악 유지
- [ ] **트랙 길이 제어**: brief=true도 모델 변동에 따라 1.5–3분 범위. 글자수 기반 컷오프 또는 더 강한 프롬프트 제약
- [ ] **PWA 오프라인 지원**: 지금 SW는 설치 가능성만 보장. 홈 shell/정적 페이지 precache 추가 시 오프라인 첫 화면 가능
- [ ] **에러 바운더리**: React error boundary 없음. 런타임 에러 시 화면이 깨짐
- [ ] **모바일 반응형 점검**: 카드 내부 버튼 그룹이 좁은 폭에서 좀 빡빡함
- [ ] **테스트**: 단위 테스트 0개. `lib/pubmed.ts` XML 파서, `lib/scoring.ts` 점수 계산, `lib/pmc.ts` 본문 추출, `[A]:` 정규화 같은 순수 함수부터 추가 가치 높음
- [ ] **OpenAlex enrichment 캐싱**: 가중치 슬라이더 움직일 때마다 매번 OpenAlex 재호출 — 같은 PMID 셋이면 메모리 캐시 또는 Vercel KV
- [ ] **Hobby 플랜 maxDuration 실측**: 대화체 장문 / 5편 이상 playlist에서 timeout 발생 케이스 정리
- [ ] **CSP / 보안 헤더**: `Content-Security-Policy` / `X-Frame-Options`
- [ ] **PubMed rate limit**: 초당 3회 제한 대응 (API 키 없을 때 다중 사용자 대응)
- [ ] **장기 캐시**: 같은 PMID + 같은 옵션으로 요약/오디오 재요청 시 Vercel KV / Blob 등
- [ ] **Gemini TTS 안정판 전환**: `preview` 꼬리표 떨어지면 모델명 업데이트
- [ ] **트랙 IndexedDB 영속화**: 현재는 새로고침하면 트랙 사라짐. 출퇴근에 한 번 만들고 며칠 듣게 하려면 영속화 필요
- [ ] **(선택) GitHub ↔ Vercel 자동 배포**: 현재는 로컬 `vercel deploy --prod` 수동. push 자동 트리거로 전환 + Preview env 추가

---

## 의사결정 기록 (변경 금지 항목)

- **인증 = Auth.js v5 + Google OAuth + Neon Postgres + Drizzle**: 다른 provider/DB 도입은 사용자 재합의 후. session strategy `database`(JWT 아님), session 콜백에서 `user.id` 명시 매핑 필수.
- **카트 PUT 멱등 upsert**: Neon HTTP는 statement-level이라 진짜 트랜잭션 X. delete + insert 패턴 race condition으로 unique 충돌 발생함. `onConflictDoUpdate` + `notInArray` delete만 사용.
- **로그인 무관 동작 보존**: 비로그인 사용자도 모든 기능 그대로 동작. 서버 동기화는 부가 기능.
- **단일 AI 스택**: 요약+TTS 모두 Gemini. Claude / OpenAI SDK 도입 금지. 필요 시 사용자와 재합의 후에만.
- **추천 = 결정론적 + 설명**: 픽킹은 [lib/scoring.ts](lib/scoring.ts) 4축 가중 점수가 담당, Gemini는 [lib/gemini.ts](lib/gemini.ts) `explainRecommendations`로 한 줄 이유만 생성. 환각 PMID 방지 + 사용자가 직접 컨트롤 가능.
- **대화체 태그 포맷**: `[A]:` / `[B]:` 고정. 프롬프트(`lib/gemini.ts`)와 TTS(`lib/tts.ts`) 양쪽이 이 포맷에 묶여 있음 — 바꾸려면 동시에 수정.
- **WAV 헤더 수동 래핑**: Gemini TTS가 24kHz mono PCM을 주고 브라우저는 WAV를 바로 재생. 이 경로 유지.
- **한국어 우선 UI**: 영어 토글은 있지만 기본 UI 문구·에러 메시지는 한국어.
- **PDF 파서는 `unpdf` 사용**: `pdf-parse`는 Turbopack에서 worker 경로 문제로 실패. `pdfjs-dist`는 번들러 개입 시 `Promise.try` 폴리필이 필요. `next.config.ts`의 `serverExternalPackages`에서 제거하지 말 것.
- **재생목록 패턴 = 트랙 분리 (한 파일 X)**: 한 WAV로 합쳐 받으면 트랙 점프·"이 논문 보기"가 어려움. 항상 트랙별 base64로 응답하고 클라이언트가 큐로 다룬다.
- **카드 상태 캐시는 pmid 키**: 검색 결과·추천·연관·playlist 모달 — 어디서 같은 논문을 열어도 동일 캐시 인스턴스. `lib/card-cache.ts` 모듈 단위 Map.
- **URL이 검색 source of truth**: `?q&filter&page&pmid`. SearchBar는 controlled가 아니라 prop 변경 시 useEffect로 동기화.
