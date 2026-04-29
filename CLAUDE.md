# Paperis v2 — CLAUDE.md

> 외부 노출 문서는 [README.md](README.md). 이 파일은 **AI 코드 어시스턴트용 컨텍스트·컨벤션** 문서. 이 문서는 v2 브랜치 전용이며, master에는 v1.1 시점의 CLAUDE.md가 그대로 있다.

## 프로젝트 개요

**Paperis v2**는 v1 시리즈를 한 번 단순화해서 다시 시작한 라인이다. 핵심 가치는 똑같다 — 바쁜 의료인이 짬짬이 PubMed 최신 연구를 따라갈 수 있게 한다. 다만 v2는 검색-청취 흐름을 한 번에 보이게 깎아냈다.

- 현재: v2 브랜치 (master는 v1.1.0 라이브)
- 타겟: 재활의학과 의사 (뇌졸중 재활 특화)
- 슬로건: "From papers to practice"
- 출퇴근 청취가 1순위 시나리오 — 새 기능을 평가할 때 항상 "이게 출퇴근 청취 흐름에 도움이 되는가?"부터 묻는다.

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 언어 | TypeScript (strict) |
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 스타일 | Tailwind CSS v4 (CSS-first, config 파일 없음 — `app/globals.css`의 `@import "tailwindcss"`) |
| 자연어 → 검색식 | Gemini 2.5 Flash Lite (`gemini-2.5-flash-lite`, `responseSchema`) |
| 요약 / Narration | Gemini 2.5 Flash (`gemini-2.5-flash`, streaming) |
| TTS | Gemini TTS (`gemini-2.5-flash-preview-tts`, narration only) |
| 논문 데이터 | PubMed E-utilities (esearch + efetch) |
| 인용수 / 저널 메트릭 | OpenAlex Works API |
| 풀텍스트 | Unpaywall → Europe PMC → PMC efetch → unpdf(업로드) |
| 오디오 저장 | IndexedDB (`idb`) |
| 배포 | Vercel |

> **인증/DB 없음.** v1에 있던 Auth.js, Neon Postgres, Drizzle은 v2에서 모두 제거. 사용자 데이터는 브라우저 안에만 (localStorage + IndexedDB).

---

## 환경변수 (.env.local)

```
GEMINI_API_KEY=        # 필수
PUBMED_API_KEY=        # 권장 (없으면 초당 3회 제한)
UNPAYWALL_EMAIL=       # 권장 (없으면 풀텍스트 체인 1단계 스킵)
```

---

## 핵심 흐름

### 1. 검색 (`/api/search`)
- 입력: `{ q: string (자연어), sort: SortMode, retmax?, retstart? }`
- 처리: `getCachedQuery(q)` → 미스 시 `translateNaturalLanguage(q)` (Gemini 2.5 Flash Lite, JSON 모드, `{ query, note }`) → `searchPubMed(query, sort, ...)` (esearch + efetch + parser) → `enrichPapers(papers)` (OpenAlex 일괄, soft-fail) → sort=citations이면 `citedByCount` desc 후정렬
- 응답: `{ query, note, papers, total, sort, cached }`
- 캐시: 서버 모듈 LRU(`lib/query-cache.ts`, 24h TTL, 200개) + 클라 localStorage(`lib/client-cache.ts`, 24h TTL, 50개)
- URL이 source of truth — `?q&sort&pmid`. SearchBar는 prop 변경 → useEffect로 입력값 동기화 (master 패턴 보존)

### 2. 미니 요약 (`/api/summarize`)
- `lib/paper-type.ts` `classifyPaperType` → `"research"` | `"review"`
- `generateMiniSummaries(papers, language)` — Gemini 2.5 Flash, `responseSchema`로 `{ summaries: [{ pmid, paperType, bullets[] }] }`. 4-5 bullet, 각 60자 이내
- 프롬프트가 paperType별로 분기 (연구는 N/효과크기/p값 강조, 리뷰는 합의/논쟁 강조)
- 페이지에서 상위 3개는 자동 batch, 4번~ 카드는 클릭 시 단일

### 3. 긴 요약 (`/api/summarize/read`)
- `streamSummary({ paper, mode: "read", language, sourceLabel })` 제너레이터
- plain text streaming (response body로 chunk 그대로 전송, 클라가 ReadableStream으로 점진 렌더)
- 풀텍스트가 있으면 `paper.abstract` 자리에 본문 주입 + `sourceLabel` 지정 → 시스템 인스트럭션이 abstract-only disclaimer 자동 생략

### 4. 풀텍스트 체인 (`/api/fulltext`)
- 순서: Unpaywall(DOI 필요 + UNPAYWALL_EMAIL) → Europe PMC(DOI/PMCID/PMID) → PMC efetch(PMCID)
- 각 단계 try/catch 후 다음으로 폴백. 모두 실패 시 `{ ok: false, attempted: [...] }` 반환 → 클라가 `PdfUpload` 슬롯 노출
- 응답 텍스트는 30k자로 트림 (head 70% + tail 25% + 중간 생략 마커)
- HTML→텍스트는 `lib/fulltext/html-extract.ts`에서 직접 처리 (Readability 의존 없음). 정확도 부족 시 추후 Readability 도입 검토

### 5. TTS (`/api/tts`)
- 입력: `{ paper, language, providerName?, voice?, sourceLabel?, fullText? }`
- 처리: `generateNarrationText(paper, language, sourceLabel)`로 narration 스크립트 생성 → `getTtsProvider(providerName).synthesize({ text, language, voice })` → `audio/wav` 응답 + `x-audio-duration-ms` 등 메타 헤더
- Gemini provider는 24kHz/16-bit/mono PCM을 받아 RIFF 헤더로 감싼 WAV 반환 — 모든 DataView write가 little-endian (`true`)이어야 브라우저 재생 가능
- 새 provider 추가 시 `lib/tts/{provider-name}.ts`만 작성하고 `lib/tts/index.ts`의 registry에 등록

### 6. 오디오 라이브러리 + 플레이어
- `lib/audio-library.ts` — `idb`로 IndexedDB DB(`paperis-audio`) 트랙 store CRUD. `appendTrack` (항상 새 레코드), `listTracks` (createdAt desc), `removeTrack`, `clearTracks`, `countTracks`, `subscribeAudioLibrary`
- 변경 알림: 같은 탭은 `CustomEvent("paperis:audio-library-changed")`, 다른 탭은 `BroadcastChannel("paperis-audio-library")` — `subscribeAudioLibrary`가 양쪽 모두 구독
- `components/PlayerProvider.tsx` — 글로벌 컨텍스트, 단일 `HTMLAudioElement` ref 보유. queue/currentIndex/isPlaying/currentTime 상태. ended 이벤트 → 자동 다음 트랙. 키보드 단축키(Space, ←/→, Shift+←/→)는 입력 포커스 시 무시
- `components/PlayerBar.tsx` — 하단 고정. `currentIndex < 0`일 땐 렌더 X
- **TTS 변환 → 트랙 삽입 흐름 (load-bearing)**: TtsButton 클릭 → `/api/tts` → 응답 받으면 `appendTrack` → 토스트 한 줄("라이브러리 끝에 추가됨"). **자동 재생 X, 페이지 이동 X, 모달 X.** 출퇴근 직전 여러 편 미리 변환해두는 시나리오 최적화. PlayerBar는 라이브러리에서 명시적으로 트랙을 누를 때만 활성화

---

## 코딩 컨벤션

- TypeScript strict. 컴포넌트 PascalCase, 함수/변수 camelCase
- API 라우트: App Router(`route.ts`), `runtime = "nodejs"`, 무거운 합성은 `maxDuration = 300`
- 에러 처리: try/catch 필수. Gemini 에러는 `friendlyErrorMessage(err, language)`로 정규화 후 사용자에게 한국어 친절 메시지
- 주석: 한국어 OK. **WHY**가 비자명할 때만. WHAT은 식별자가 말한다
- React 19 / Next 16: setState in effect 룰. 외부 시스템 동기화는 의도적 disable 코멘트로

---

## 의사결정 기록 (변경 시 사용자 재합의)

- **단일 AI 스택 (Gemini)**: 검색식 변환·요약·TTS 모두 Gemini. Claude / OpenAI SDK 도입 금지.
- **검색식 = Gemini 2.5 Flash Lite, 요약·TTS = Gemini 2.5 Flash 계열**: 사용자 명시 분리. 검색식은 결정론적 변환이라 더 작고 빠른 lite 모델로 충분 (원래 `gemini-2.0-flash`로 잡았으나 신규 사용자 대상 retire되어 lite로 교체)
- **Auth.js / Neon / Drizzle 전부 제거**: v1.1 기능 회귀. 추후 재도입 시 별 브랜치
- **TTS는 narration only**: dialogue 모드 제거. multi-speaker config 코드 모두 정리
- **TTS provider 인터페이스 추상화**: 새 provider는 `lib/tts/<name>.ts` 하나만 추가하면 끝. registry에 등록
- **풀텍스트 체인 = Unpaywall → Europe PMC → PMC**: license 정보 명확한 Unpaywall 우선. EPMC/PMC는 fallback. PDF 업로드는 모두 실패 시의 마지막 수단
- **TTS 변환은 자동재생 X, 트랙리스트 끝에 append만**: 출퇴근 시나리오 최적화. 변환 작업이 시청 흐름을 끊지 않는 것이 핵심
- **인용수순은 페이지 내 정렬만**: PubMed esearch가 인용수 정렬을 직접 지원 못함. OpenAlex enrichment 후 페이지 안에서만 정렬. 글로벌 정렬은 v2 미지원
- **TTS는 PCM → 수동 WAV 래핑**: Gemini가 24kHz mono 16-bit PCM 반환, 브라우저는 WAV를 바로 재생. 모든 DataView write에 `true`(little-endian) 보존
- **카드 / 검색 상태는 URL이 source of truth**: SearchBar는 controlled가 아닌 prop 변경 시 useEffect로 동기화
- **PDF 파서는 unpdf**: `pdf-parse`는 Turbopack worker 경로 이슈. `next.config.ts`의 `serverExternalPackages: ["unpdf", "pdfjs-dist"]` 유지
- **한국어 우선 UI**: 영어 토글은 추후 가능, 기본 UI 문구·에러 메시지는 한국어
- **로그인 없음**: anonymous ID는 `lib/anonymous-id.ts`의 localStorage UUID. 향후 동기화 도입 시 안정 식별자로 쓸 자리만 잡아둠

---

## 주의사항

- `.env.local` / `.vercel/` / `.claude/` 모두 gitignore. 절대 커밋 금지
- PubMed API 초당 3회 제한 (API 키 없을 때)
- 유료 논문 full text를 무단 수집하지 않음. 사용자가 합법적으로 보유한 PDF만 업로드 대상
- 임상 의사결정 도구가 아님 — README 주의사항 참고

---

*Paperis v2 CLAUDE.md — v2 브랜치 마일스톤 1–8 완료 시점 정리*
