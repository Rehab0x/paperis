# Paperis — CLAUDE.md

> 외부 노출 문서는 [README.md](README.md), 작업 일지는 [TODO.md](TODO.md). 이 파일은 **AI 코드 어시스턴트용 컨텍스트·컨벤션** 문서.

## 프로젝트 개요

**Paperis**는 바쁜 의료인이 짬짬이 최신 PubMed 연구 지견을 따라갈 수 있게 해주는 서비스다. 검색·요약·듣기·연관학습·full-text·재생목록을 한 흐름으로 제공한다.

- 슬로건: "From papers to practice"
- 현재 버전: v1.0.2 (2026-04-25, paperis.vercel.app 라이브)
- MVP 타겟: 재활의학과 의사 (뇌졸중 재활 특화)
- 향후 확장: 의학 전 분야 → 전 과학 분야

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 언어 | TypeScript (strict) |
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 스타일링 | Tailwind CSS v4 |
| AI 요약 / 추천 이유 / 연관 쿼리 | Gemini 2.5 Flash (`@google/genai`, streaming) |
| TTS | Gemini TTS (`gemini-2.5-flash-preview-tts`, 단일/멀티스피커) |
| 논문 데이터 | PubMed E-utilities (esearch + efetch) |
| 인용수 / 저널 메트릭 | OpenAlex Works API (무료, 키 불필요) |
| PMC 본문 | PMC E-utilities efetch (JATS XML) |
| PDF 파싱 | unpdf (pdfjs-dist serverless 빌드) |
| 배포 | Vercel |

---

## 프로젝트 구조

```
app/
  page.tsx                  메인 화면 (마스터-디테일 + URL state)
  layout.tsx                루트 레이아웃 (PWA 메타, SW 등록)
  manifest.ts               Web App Manifest
  api/
    pubmed/route.ts         논문 검색 (q, filter, start, retmax)
    recommend/route.ts      4축 가중 스코어링 + Gemini 이유 → 추천 3편
    related/route.ts        시드 + 힌트 → 연관 논문
    summarize/route.ts      읽기 모드 스트리밍 요약
    tts/route.ts            한 편 narration / dialogue 합성 (audio/wav)
    playlist/route.ts       여러 편 짧은 narration 병렬 합성 (트랙 JSON+base64)
    pmc/route.ts            Open Access full-text 추출
    pdf/route.ts            PDF 업로드 → 텍스트 추출 (서버 저장 X)
components/
  SearchBar, PaperList, PaperCard, PaperModal
  Pagination, RecommendWeights
  CartButton, CartPanel, PlaylistPlayer
  AudioPlayer, PdfUpload, RegisterSW
lib/
  pubmed.ts, pmc.ts         PubMed/PMC API 클라이언트
  gemini.ts                 streamSummary / explainRecommendations / generateRelatedQuery
  tts.ts                    Gemini TTS + WAV 헤더 수동 래핑
  openalex.ts               PMID 일괄 enrichment
  scoring.ts                4축 결정론적 점수 계산
  cart.ts                   장바구니 (localStorage + custom event)
  card-cache.ts             카드별 세션 캐시 (pmid 키 모듈 Map)
  xml-utils.ts              PubMed/PMC XML 헬퍼
types/index.ts              공통 타입
public/sw.js, public/icons/ PWA 자산
```

---

## 환경변수 (.env.local, Git 제외)

```
GEMINI_API_KEY=        # 필수. 요약 / 추천 이유 / 연관 쿼리 / TTS / 플레이리스트
PUBMED_API_KEY=        # 선택. 없어도 동작 (초당 3회 제한)
```

---

## 핵심 기능 (사용자 관점)

자세한 동작은 [README.md](README.md) 참고. 여기는 **AI가 코드 작업할 때 알아야 할 흐름**만.

### 검색 (`/api/pubmed`)
- esearch → efetch 파이프라인. esearch는 `count`(전체)와 `idlist`(현재 페이지)를 줌.
- 페이지네이션은 `start` 쿼리 파라미터(retstart). 페이지 크기 20 고정.
- URL이 검색 상태의 source of truth — `?q&filter&page&pmid`. SearchBar는 prop 변경에 useEffect로 동기화(외부 변화 → 입력값 갱신).

### 추천 (`/api/recommend`)
- **결정론적 + 설명** 분리. 픽킹은 `lib/scoring.ts` 4축 가중 점수 (recency / citations / journal / niche).
  - 인용수와 `2yr_mean_citedness`는 `lib/openalex.ts`로 일괄 enrichment.
  - 가중치는 클라이언트 슬라이더(`components/RecommendWeights.tsx`, localStorage `paperis.recommend.weights.v1`).
- Gemini는 `lib/gemini.ts` `explainRecommendations`로 top 3에 한국어 한 문장 이유만 생성. 환각 PMID 위험 없음.
- 1페이지에서만 호출. 가중치 변경은 350ms debounce 후 재호출.

### 요약 (`/api/summarize`)
- `streamSummary({ paper, mode, language, sourceLabel?, brief? })` 제너레이터.
- `mode`: `read` | `narration` | `dialogue`. `dialogue`는 `[A]:` / `[B]:` 라인 단위.
- `sourceLabel`이 있으면 시스템 인스트럭션이 "abstract-only" disclaimer 자동 생략. PMC full-text나 PDF 업로드 첨부 시 사용.
- `brief: true`는 narration을 1-2분 출퇴근 다이제스트로. 재생목록 합성에서 사용.

### 듣기 — 한 편 (`/api/tts`) / 여러 편 (`/api/playlist`)
- 단일: 카드 안 narration/dialogue 버튼. 한 번에 하나.
- 재생목록: 장바구니에 모은 논문(`lib/cart.ts`)을 `Promise.all` 병렬로 합성. 트랙별 base64 inline JSON 응답 → 클라이언트가 blob URL로 변환해 큐.
- 플레이어(`PlaylistPlayer`): ⏮ ⏭ 트랙 점프, ±10초 시크, 키보드(←/→/Space, 입력 필드 포커스 시 무시).
- 트랙에 원본 `Paper` 동봉 → "📄 이 논문 보기"에서 `PaperModal` 띄움. 카드 캐시(`lib/card-cache.ts`)가 같은 pmid면 검색 결과 카드와 상태 공유.

### 본문 첨부
- Open Access(`paper.access === "open"` + `pmcId`): `/api/pmc?pmcId=...` 자동 호출 가능.
- 유료(`access === "closed"`): `<PdfUpload>` 슬롯, `/api/pdf` 멀티파트.
- 둘 다 `lib/card-cache.ts`의 `fullText` 필드(`source: "pdf" | "pmc"`)로 통합. 이후 요약/TTS/연관 호출에서 자동으로 abstract 자리에 full text 주입.

---

## 코딩 컨벤션

- TypeScript strict
- 컴포넌트 PascalCase, 함수/변수 camelCase
- API 라우트: Next.js App Router (`route.ts`), 가능하면 `runtime = "nodejs"` 명시, 무거운 합성은 `maxDuration = 300`
- 에러 처리: try/catch 필수, 사용자에게는 한국어 친절한 메시지. Gemini 에러는 `lib/gemini.ts`의 `friendlyErrorMessage`로 정규화
- 주석: 한국어로 작성 가능
- React 19 / Next 16: setState in effect 룰이 켜져 있음. 외부 시스템(localStorage, URL 등) 동기화는 의도적 disable 코멘트로

---

## Gemini 프롬프트 방향

> 모델: 요약/추천이유/연관쿼리는 `gemini-2.5-flash`, TTS는 `gemini-2.5-flash-preview-tts`. SDK: `@google/genai`. 스트리밍은 `generateContentStream`, 구조화 응답은 `responseMimeType: "application/json"` + `responseSchema`.

### 읽기용 요약 (`mode: read`)
재활의학과 전문의를 위한 임상 중심 요약. 연구 질문/설계 → 대상 → 중재/프로토콜 수치 → 결과(효과 크기, CI, p값) → 임상 적용 포인트 → 한계. 영어 의학 용어 원어 보존.

### 듣기 — 내레이션 (`mode: narration`)
- 기본(`brief: false`): 의대 교수가 레지던트에게 강의하듯, 5~10분 자연스러운 구어체.
- 짧은 모드(`brief: true`): 회진 다이제스트, 1~2분, 핵심 결과 + 가장 actionable 한 takeaway 1개.

### 듣기 — 대화체 (`mode: dialogue`)
두 명의 재활의학과 의사가 토론. `[A]: ` / `[B]: ` 라인 단위 고정 포맷. 5~10분.

### 추천 이유 (`explainRecommendations`)
이미 결정된 top 3에 대해서만 호출. dominant factor를 기반으로 한국어 한 문장(80자 이내).

### 연관 검색식 (`generateRelatedQuery`)
시드 논문 + 사용자 힌트 → PubMed 검색식 + 검색 방향 한국어 설명. 5~15 토큰의 PubMed 문법 사용.

---

## 의사결정 기록 (변경 금지 / 변경 시 사용자 재합의 필요)

- **단일 AI 스택**: 요약+TTS 모두 Gemini. Claude / OpenAI SDK 도입 금지.
- **추천은 결정론적 + Gemini 설명**: 픽킹은 `lib/scoring.ts`, Gemini는 이유만. 환각 PMID 방지 + 사용자 가중치 컨트롤.
- **`[A]:` / `[B]:` 대화체 태그 포맷 고정**: 프롬프트와 TTS speaker config 양쪽이 묶여 있음.
- **TTS는 PCM → 수동 WAV 래핑**: Gemini가 24kHz mono 16-bit PCM을 줌, 브라우저는 WAV를 바로 재생. 이 경로 유지.
- **재생목록 = 트랙 분리 (단일 WAV X)**: 트랙 점프·"이 논문 보기"가 가능하려면 분리 필수.
- **카드 상태 캐시는 pmid 키 모듈 Map**: 검색 결과·연관 학습·재생목록 모달 어디서 같은 논문을 열어도 같은 캐시 인스턴스 사용.
- **URL이 검색 source of truth**: SearchBar는 controlled가 아닌 prop 변경 시 useEffect로 동기화.
- **PDF 파서는 `unpdf`**: `pdf-parse`는 Turbopack worker 경로 이슈로 실패. `next.config.ts` `serverExternalPackages: ["unpdf", "pdfjs-dist"]` 유지.
- **한국어 우선 UI**: 영어 토글은 있지만 기본 UI 문구·에러 메시지는 한국어.

---

## 주의사항 (사용자/법적)

- `.env.local`/`.vercel/`/Claude 로컬 설정은 모두 gitignore. 절대 커밋 금지.
- PubMed API 초당 3회 제한 (API 키 없을 때).
- 유료 논문 full text를 무단으로 수집하지 않음. 사용자가 합법적으로 보유한 PDF만 업로드 대상.
- 임상 의사결정 도구가 아님 — README 주의사항 참고.

---

*Paperis CLAUDE.md — v1.0.2 시점 갱신, 2026.04*
