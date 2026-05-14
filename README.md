# Paperis v3

> **From papers to practice** — 바쁜 의료인이 짬짬이 최신 PubMed 연구를 따라갈 수 있게 해주는 서비스. 자연어 검색·저널 큐레이션·풀텍스트 요약·TTS 청취를 한 흐름으로 묶었다.

**라이브**: [paperis.vercel.app](https://paperis.vercel.app)

---

## 무엇을 하는가

1. **저널 큐레이션 (메인 진입)** — 임상과 선택 → 저널 선택 → 호 탐색 / 주제 탐색 / 분기 트렌드 분석. 결과는 카드 + 미니 요약 + 풀텍스트 + TTS 청취로 이어진다
2. **자연어 검색 (보조 진입)** — 입력을 사용자가 선택한 AI provider가 PubMed 검색식으로 변환. v2 사용자를 위한 흐름 보존
3. **출퇴근 청취** — TTS narration → IndexedDB 라이브러리 → 글로벌 PlayerBar에서 큐 재생

서비스 진입은 두 단계 — `paperis.vercel.app/`은 비로그인 사용자에게 한/영 랜딩페이지(`/ko`, `/en`)를 보여주고, 로그인된 사용자나 deep link 사용자는 `/app`(앱 본체)로 바로 진입한다. 미들웨어가 쿠키 → GeoIP(`x-vercel-ip-country`) → Accept-Language(ko 토큰 우선) 순으로 자동 분기.

영어 사용자의 LLM/TTS 출력도 자동으로 영어로 — `paperis.locale` 쿠키 기반. 클라이언트가 별도 명시 없으면 서버(`getRequestLanguage`)가 쿠키 보고 결정한다. ko → Clova(default), en → Google Cloud TTS. 프롬프트도 locale별로 분기(영어 출력은 한국어 의학용어 보존 지침/한국어 인사 회피 지침 자동 제거).

앱 UI 텍스트도 i18n 마이그레이션 완료(Phase 2-C1·2-C2 + 후속 fix). 헤더/홈/검색·디테일/TTS·라이브러리/저널 큐레이션(호/주제/트렌드, server-rendered 페이지 포함)/설정 드로어/계정·결제·온보딩까지 모두 영어. 영어 모드는 specialty 한글 secondary 자동 숨김. trend 헤드라인은 client에서 URL에 `&language=locale` 명시 + locale 변화 시 refetch — KO/EN 캐시 완벽 분리. 남은 한국어는 `legal/*` 약관 페이지(C3, 법률 검토 필요)뿐.

설계 1순위 시나리오: **출퇴근길에 듣는다**. 모든 흐름이 결국 TTS → 라이브러리 → 플레이어로 수렴한다.

---

## 핵심 기능

### 검색·요약·TTS
- **자연어 → PubMed 검색식**: 사용자가 선택한 AI provider(기본 Gemini)가 검색식 + 한 줄 요약 생성. 서버 LRU + 클라 localStorage 양쪽 캐시
- **미니 요약**: 논문 타입(연구/리뷰)별로 강조점이 다른 4–5 bullet. 자동 batch 모드 토글
- **풀텍스트 체인**: Unpaywall → OpenAlex OA → Europe PMC → PMC efetch → Semantic Scholar → medRxiv → 사용자 PDF 업로드. unpaywall/s2/medrxiv 출처는 "📥 Download PDF" 라벨로 직접 다운로드
- **긴 요약 스트리밍**: 풀텍스트 또는 abstract 기반. AI provider별 generateStream. 풀텍스트 확보 시에도 abstract 선택 가능한 입력 소스 토글 (Long Summary 위 별도 섹션)
- **Abstract `<details>` 섹션**: PaperDetailPanel에서 원문 abstract 깔끔하게 펼침 (open default)
- **TTS narration**: 자동 재생 X. 라이브러리에 append만. 글로벌 PlayerBar에서 큐 재생. 트랙 제목은 자동 한국어 번역. 한국어 narration도 3-4문장마다 빈 줄로 문단 분리 (영어와 동일한 가독성)
- **라이브러리 소스 배지**: 트랙이 트렌드/풀텍스트/초록 어느 소스에서 만들어졌는지 한눈에 (`📊 Trend` / `📄 Full text` / `🧾 Abstract`)
- **한국어 제목 보조 표시 (ko 사이트 전용, 설정 토글 default OFF)**: 검색·호 탐색·주제 탐색·트렌드 모든 카드에서 영문 제목 아래에 한글 번역을 작은 회색으로 표시. 영문 원제목은 인용·식별성 위해 그대로 유지. 한 번 번역된 제목은 pmid 키로 클라 localStorage + 서버 Redis에 영구 캐시

### 저널 큐레이션 (v3 메인)
- **임상과 카탈로그**: 25개 임상과 (GitHub raw fetch + 로컬 fallback). 사용자가 즐겨찾기 / 직접 추가 / 차단
- **호 탐색**: 특정 월호의 논문 + 경향 + top 5 요약. Editorial/Letter/Erratum 등 비-substantive 페이퍼 기본 필터 (사용자 토글로 모두 보기 가능)
- **주제 탐색**: 저널 내 키워드/MeSH로 모아보기
- **트렌드 분석 (v2)**: 연도·분기 단위 themes 분석 + 방법론 변화 + 임상 시사점 + narration 스크립트. 트렌드 자체를 TTS로 청취 가능
- **트렌드 헤드라인 (라이트)**: 홈 피처드 카드용 — 한 문장 추출 (~5–10초, Flash Lite)
- **OA 우선 정렬**: 호/주제/트렌드 결과를 전체 단위로 OA 위로
- **명시적 submit**: 호 탐색·트렌드는 연도/월/분기 입력 후 우측 accent 버튼(Search/Analyze) 눌러야 fetch — select 변경 즉시 fetch 거슬림 회피

### 홈 화면 카드 시스템
- **이어 듣기**: IndexedDB의 가장 최근 트랙. 클릭 시 큐 재생
- **내 임상과**: 사용자 선택 임상과 칩 (chip carousel)
- **이번 분기 트렌드**: favorites 저널 중 매일 다른 저널의 헤드라인 (KST epoch day 로테이션). Fraunces 세리프 헤드라인
- **내 저널**: favorites + 사용자 추가 저널 가로 스크롤. 14일 이상 안 본 저널은 ● 표시
- v2 자연어 검색은 검색바 입력 시에만 결과로 전환 (홈 빈 상태 ↔ 검색 결과 전환)

### 결제 + 등급 시스템
| 등급 | 한도 | 본인 키 입력 | 키 미입력 시 | Provider 선택 |
|---|---|---|---|---|
| **Free** | 월 3/5/3 | ❌ | 서버 env | ❌ Gemini 강제 |
| **Pro** | 무제한 | ❌ | 서버 env (Pro 권리) | ✅ env 보유한 것만 |
| **BYOK** | 무제한 | ✅ | 호출 실패 (본인 키 강제) | ✅ 본인 키 입력한 것만 |
| **Admin** | 무제한 | ✅ | 서버 env fallback | ✅ env + 본인 키 합집합 |

- **BYOK 1회 결제 (9,900원)**: 평생 권한. 본인 API 키 입력 + 무제한
- **Pro 월 구독 (4,900원/월)**: 우리 서버 키 + 무제한 + provider 자유 선택
- **Admin (ADMIN_EMAILS env)**: 결제 없이 BYOK 효과. 본인 키 OR 서버 env fallback
- **API 키 발급 가이드**: 설정 → API 키 섹션 옆 "발급 ↗" 인라인 링크 (8개 provider) + `/help/api-keys` 단계별 가이드 페이지 (ko/en 자동 분기, 보안 안내 + 목차)

### 멀티 AI Provider
사용자가 선택한 provider로 모든 LLM 호출 (검색/요약/트렌드).
- **Gemini** — 기본. flash-lite/flash 라인업
- **Claude** — `@anthropic-ai/sdk`. haiku 4.5 / sonnet 4.6. tool_use input_schema로 JSON 강제
- **OpenAI** — gpt-4.1 라인업. response_format json_schema (strict)
- **Grok (xAI)** — OpenAI SDK + xAI baseURL 재사용. grok-4 라인업

추상화 레이어 (`lib/ai/`): `AiProvider` 인터페이스 (`generateText`/`generateStream`/`generateJson`) + provider-agnostic JSON Schema + ModelTier(fast/balanced/heavy).

---

## 디자인 시스템

**에디토리얼 의학 저널 톤** — Apple News + FT Weekend 같은 차분하고 격조 있는 분위기.

- **폰트**: Fraunces (세리프, 저널명·헤드라인) + Pretendard (본문, 한글 가독성)
- **컬러**: 따뜻한 오렌지 액센트 (#ff5b3a 다크 / #c44b1e 라이트). `paperis-*` 토큰으로 단일 시스템
- **다크 + 라이트 모드**: 같은 철학으로 라이트 변환 (zinc 한기 X, 따뜻한 white + 머스타드)
- **요소**: backdrop-blur sticky topbar, marquee 제목, range thumb 드래그 시크
- 라이브러리/설정 드로어는 `createPortal`로 body 마운트 (헤더 backdrop-filter containing block 회피)

---

## 환경변수 (`.env.local`)

```bash
# ── 필수 ────────────────────────────────────────────────────
GEMINI_API_KEY=                  # 기본 AI provider (검색·요약·트렌드)
DATABASE_URL=                    # Neon Postgres
AUTH_SECRET=                     # `npx auth secret`
AUTH_GOOGLE_ID=                  # Google OAuth
AUTH_GOOGLE_SECRET=

# ── 권장 ────────────────────────────────────────────────────
PUBMED_API_KEY=                  # 없으면 초당 3회 제한
UNPAYWALL_EMAIL=                 # 풀텍스트 1단계
NCP_CLOVA_CLIENT_ID=             # TTS default. 두 키 모두 필요
NCP_CLOVA_CLIENT_SECRET=
GOOGLE_CLOUD_TTS_API_KEY=        # TTS 추가 옵션 (Neural2/WaveNet)
UPSTASH_REDIS_REST_URL=          # 트렌드/호 캐시 (silent fallback)
UPSTASH_REDIS_REST_TOKEN=

# ── 추가 AI provider (Pro 사용자에게 노출) ──────────────────
ANTHROPIC_API_KEY=               # Claude
OPENAI_API_KEY=                  # OpenAI
XAI_API_KEY=                     # Grok

# ── 관리자 ──────────────────────────────────────────────────
ADMIN_EMAILS=                    # 콤마 구분. BYOK 효과 + env fallback

# ── 결제 ──────────────────────────────────────────────────
TOSS_SECRET_KEY=                 # Toss Payments
TOSS_CLIENT_KEY=
NEXT_PUBLIC_TOSS_CLIENT_KEY=
TOSS_LIVE_MODE=0                 # 1 = 라이브 (M8 사업자등록 후)
CRON_SECRET=                     # Vercel cron 인증 (Bearer)

# ── Feature flags ─────────────────────────────────────────
NEXT_PUBLIC_FEATURE_AUTH=1       # AuthMenu 노출
NEXT_PUBLIC_FEATURE_JOURNAL=1    # /journal 진입
FEATURE_USAGE_LIMIT=1            # Free 한도 활성
NEXT_PUBLIC_FEATURE_LANDING=0    # / → /ko|/en 랜딩 분기 (Phase 2-A, 0=기존 / → /app)
```

`.env.example` 전체 참조. `.env.local`은 `.gitignore`로 제외.

---

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 타입 체크 + 빌드 + 라우트 출력
```

배포는 Vercel 수동:
```bash
vercel deploy --prod --yes
```

---

## 기술 스택

| 역할 | 도구 |
|---|---|
| 언어 / 프레임워크 | TypeScript (strict), Next.js 16 (App Router, Turbopack) |
| 스타일 | Tailwind CSS v4 (CSS-first) + Fraunces + Pretendard |
| 인증 | Auth.js v5 + Google OAuth + Drizzle adapter |
| DB | Neon Postgres + Drizzle ORM (add-only 마이그레이션) |
| 캐시 | Upstash Redis (silent fallback) + 모듈 LRU |
| 결제 | Toss Payments 빌링 (BYOK 1회 + Pro 월 구독 + Vercel cron 자동결제) |
| AI provider | `lib/ai/` 추상화 — Gemini / Claude / OpenAI / Grok |
| TTS | Naver Clova Voice Premium · Google Cloud TTS · Gemini TTS fallback (narration only) |
| 논문 데이터 | PubMed E-utilities (esearch + efetch) |
| 메타 / 인용수 | OpenAlex Sources + Works |
| 풀텍스트 | Unpaywall · OpenAlex · Europe PMC · PMC · Semantic Scholar · medRxiv · unpdf |
| 오디오 저장 | IndexedDB (`idb`) — 라이브러리 트랙 store |
| 배포 | Vercel Pro (5분 maxDuration, 수동 prod 배포, 일일 cron) |

---

## 프로젝트 구조 (요약)

```
app/
  layout.tsx                      Provider 중첩 + Fraunces + Pretendard + 글로벌 Footer
  page.tsx                        / 진입 server redirect (→ /app, 미들웨어가 못 잡았을 때 fallback)
  [locale]/                       랜딩페이지 SSG (Phase 2-A) — ko/en
    layout.tsx                    locale 검증 + generateStaticParams
    page.tsx                      Hero/Stats/How/Features/Pricing
    LangToggle.tsx                KO/EN 토글 (쿠키 저장)
  app/
    page.tsx                      v2 자연어 검색 + 홈 카드 시스템 (앱 본체)
  account/page.tsx                구독 + 사용량 + 정보
  billing/page.tsx                BYOK/Pro 결제 시작
  billing/{success,fail}/         결제 콜백
  onboarding/page.tsx             휴대폰 + 약관
  journal/
    page.tsx                      임상과 그리드
    specialty/[id]/page.tsx       임상과별 저널 추천
    [issn]/page.tsx               저널 홈 (호/주제/트렌드 탭)
  legal/{terms,privacy,refund}/   약관·개인정보·환불 페이지
  help/api-keys/                  BYOK API 키 발급 가이드 (서버 컴포넌트, ko/en 자동)
  api/
    search summarize summarize/read fulltext pdf tts tts/preview tts/text
    journal/{search,issues,topic,trend,trend-headline}
    account/{onboarding,prefs,usage,subscription}
    billing/{checkout,confirm,issue-billing-key,charge-first}
    cron/recurring-billing                              매일 KST 자정 자동결제
    auth/[...nextauth]
components/
  Footer                                                 글로벌 푸터 (모든 페이지, PlayerBar 보정)
  useLocale                                              client cookie 기반 locale 훅 (Phase 2-B)
  useAppMessages                                         앱 UI i18n 메시지 훅 (Phase 2-C)
  PlayerBar PlayerProvider AudioLibrary LibraryDrawer    글로벌 미디어 (포털 마운트)
  ContinueListeningCard MySpecialtiesPicker
  TrendFeaturedCard MyJournalsNewIssues UsageBanner      홈 카드 시스템
  JournalTabs JournalCard JournalPaperList               큐레이션
  IssueExplorer TopicExplorer TrendDigest TrendTtsButton
  PaperDetailPanel PaperCard MiniSummary
  SettingsDrawer (아코디언) ApiKeysProvider              섹션 토글 + BYOK 게이트
  AuthMenu AuthSessionProvider AccountSyncProvider
  ThemeProvider TtsProviderPreferenceProvider TtsQueueProvider
  useFetchWithKeys                                       X-Paperis-Keys + Anon-Id + Ai-Provider 자동 동봉
lib/
  ai/                              types · registry · gemini · claude · openai (Grok 재사용)
  ai-preference                    사용자 provider 선호 localStorage
  branding                         COMPANY_NAME / copyright 연도 (한 곳 갱신)
  i18n                             Locale 타입 · Accept-Language 파서 · getRequestLanguage
  user-keys                        BYOK 게이트 + applyUserKeysToEnv
  admin                            ADMIN_EMAILS 체크
  usage                            checkAndIncrement + getPlan + KST yearMonth
  billing                          Toss Payments wrapper
  journals openalex pubmed         카탈로그 + 메타 + 검색
  paper-filter                     호 탐색 noise(Editorial/Letter/Erratum 등) 필터
  trend                            generateJournalTrend + generateTrendHeadline (lite)
  summary query-translator gemini  미니 요약 + 검색식 변환 + Gemini provider
  fulltext/                        unpaywall openalex europe-pmc pmc s2 medrxiv asset-fetcher
  tts/                             Clova/GoogleCloud/Gemini provider registry
  audio-library journal-cache      IndexedDB + Redis wrapper
  journal-{favorites,additions,blocks,meta-cache,visits}   localStorage 5종
  specialty-prefs anonymous-id auto-mini-summary
  db/                              Drizzle schema + connection
data/journals.json                 임상과 카탈로그
messages/{ko,en}.json              랜딩페이지 카피 (Phase 2-A)
auth.ts                            Auth.js v5 + Drizzle adapter
middleware.ts                      / 진입 시 랜딩/앱 분기 (Phase 2-A)
```

---

## 주의사항

- **임상 의사결정 도구가 아님** — 출판된 논문 검색·요약·청취 도구
- **유료 논문 풀텍스트는 무단 수집하지 않음** — 사용자가 합법적으로 보유한 PDF만 업로드 슬롯에서 추출
- **PubMed E-utilities** — API 키 없이 초당 3회 제한
- **IndexedDB 라이브러리** — 브라우저 로컬 저장. 다른 기기와 자동 동기화되지 않음 (오디오만 — 임상과·저널 prefs는 로그인 시 DB 동기화)
- **결제는 sandbox 검증 완료** — M8 사업자등록 후 `TOSS_LIVE_MODE=1`로 라이브 활성화
