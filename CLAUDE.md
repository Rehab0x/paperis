# Paperis v3 — CLAUDE.md

> 외부 노출 문서는 [README.md](README.md). 기획은 [PAPERIS_V3_PLAN.md](PAPERIS_V3_PLAN.md), 단계별 작업 계획은 [PAPERIS_V3_ROADMAP.md](PAPERIS_V3_ROADMAP.md), 작업 일지는 [TODO.md](TODO.md). 이 파일은 **AI 코드 어시스턴트용 컨텍스트·컨벤션** 문서.
>
> **이 문서는 v3 작업 라인 기준이다.** v2.0.4까지의 의사결정은 §의사결정 진화 표에 정리. v1.1.0은 master `v1.1.0` 태그, v2.x는 `v2.0.0`~`v2.0.4` 태그 참조.

---

## 프로젝트 개요

**Paperis v3**는 v2의 단순화 라인을 의도적으로 뒤집어 **저널 단위 큐레이션**을 1순위 진입점으로 만들고, 사용자 계정·구독 결제를 도입하는 라인이다. v2까지의 자연어 검색은 보조 진입점으로 보존.

- 현재 라이브: **v2.0.4** (paperis.vercel.app). v3는 master에서 그대로 진화 중 (별도 v3 브랜치 분기 안 함)
- 타겟: 재활의학과 의사 (뇌졸중 재활 특화) → v3에서 임상과 확장 (재활/심장/신경 3개 시작)
- 슬로건: "From papers to practice"
- 1순위 시나리오: 출퇴근 청취. v3에서도 모든 흐름이 결국 TTS → IndexedDB 라이브러리 → PlayerBar로 수렴해야 함

### v3 핵심 진입점 (저널 큐레이션 3종)

```
임상과 선택 → 저널 선택
             ├── 📅 호 탐색 (특정 월호 → 경향성 + top5 + 전체 목록)
             ├── 🏷️ 주제 탐색 (저널 내 spasticity 등 → 관련 논문 모아보기)
             └── 📈 최근 트렌드 (최근 6개월 자동 분석 → "요즘 핫한 주제")
                              └── 개별 논문 → OA 풀텍스트 → 요약/TTS (v2 흐름 재사용)
```

자연어 검색은 헤더 보조 진입점으로 보존 (v2.0.4 라이브 사용자 100% 호환).

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 언어 | TypeScript (strict) |
| 프레임워크 | Next.js 16 (App Router, Turbopack) |
| 스타일 | Tailwind CSS v4 (CSS-first, config 파일 없음 — `app/globals.css`의 `@import "tailwindcss"`) |
| 자연어 → 검색식 / 트렌드 분석 | Gemini 2.5 Flash Lite (검색식), 2.5 Flash (요약·트렌드 narration) |
| TTS — **default = Clova** | NCP Clova Voice Premium (v3 default), Google Cloud TTS Neural2/WaveNet, Gemini TTS (fallback) |
| 논문 데이터 | PubMed E-utilities (esearch + efetch) — v3는 ISSN 기반 쿼리 통일 |
| 저널 메타 / 인용수 | OpenAlex Sources API (저널 자동 추천) + Works API (인용수 enrichment) |
| 풀텍스트 | Unpaywall → Europe PMC → PMC efetch → unpdf(업로드) |
| 인증 | **Auth.js v5 + Google OAuth + Drizzle adapter** (v3 4단계에서 부활) |
| DB | **Neon Postgres + Drizzle ORM** (v3 4단계 부활) — users / user_journal_prefs / subscriptions / usage_monthly |
| 캐시 | Upstash Redis (트렌드/호 분석 결과, 과거 호 ∞ / 당월 24h) + 모듈 LRU(query-cache) |
| 결제 | Toss Payments 빌링 (BYOK 1회 + Pro 월 구독). customerMobilePhone 필수 → 온보딩에서 휴대폰 수집 |
| 오디오 저장 | IndexedDB (`idb`) — v2 그대로 (라이브러리 메타만 list, 재생 시 blob 로드) |
| 배포 | Vercel Pro (5분 function timeout). 자동 git deploy 비활성, **수동 `vercel deploy --prod --yes`** |

> **단일 AI 스택은 v2.0.3-4부터 깨짐.** TTS는 multi-provider, 검색·요약·트렌드는 Gemini 단일 유지.

---

## 환경변수 (.env.local)

```bash
# 기존 v2 유지
GEMINI_API_KEY=                 # 필수 (검색·요약·트렌드)
PUBMED_API_KEY=                 # 권장 (없으면 초당 3회 제한)
UNPAYWALL_EMAIL=                # 권장 (없으면 풀텍스트 1단계 스킵)
NCP_CLOVA_CLIENT_ID=            # v3 default TTS provider
NCP_CLOVA_CLIENT_SECRET=
GOOGLE_CLOUD_TTS_API_KEY=       # 선택 (Neural2/WaveNet)

# v3 신규
DATABASE_URL=                   # Neon Postgres (4단계)
AUTH_SECRET=                    # Auth.js (4단계)
AUTH_GOOGLE_ID=                 # Google OAuth (4단계)
AUTH_GOOGLE_SECRET=
UPSTASH_REDIS_REST_URL=         # 캐시 (5단계, 부재 시 인메모리 fallback)
UPSTASH_REDIS_REST_TOKEN=
TOSS_SECRET_KEY=                # 결제 (7단계)
TOSS_CLIENT_KEY=
TOSS_LIVE_MODE=0                # 0=sandbox / 1=live (8단계 사업자등록 후)

# v3 feature flags (단계별 점진 롤아웃)
NEXT_PUBLIC_FEATURE_JOURNAL=0       # 3단계 — 저널 진입점
NEXT_PUBLIC_FEATURE_AUTH=0          # 4단계 — AuthMenu/온보딩
NEXT_PUBLIC_FEATURE_USAGE_LIMIT=0   # 6단계 — Free 한도
NEXT_PUBLIC_FEATURE_BILLING=0       # 7단계 — 결제 페이지
```

**API 키 사용자별 입력**: 클라이언트가 localStorage에 저장 후 모든 fetch에 `X-Paperis-Keys: base64(JSON)` 헤더로 동봉. 서버 라우트가 `applyUserKeysToEnv(req)`로 process.env override. v3에서도 그대로 유지 — BYOK 결제 안 해도 자기 키 사용 가능 (정책 결정).

---

## 핵심 흐름

### v2부터 유지 — 자연어 검색·미니/긴 요약·풀텍스트·TTS·라이브러리

v2 핵심 흐름은 v3에서도 그대로. 변경 없음. 라이브 회귀 방지가 1순위.

- `/api/search` — 자연어 → Gemini Flash Lite → PubMed → OpenAlex enrich → 정렬
- `/api/summarize` — 미니 요약 batch (research/review 분기)
- `/api/summarize/read` — 긴 요약 streaming
- `/api/fulltext` — Unpaywall → EPMC → PMC 체인
- `/api/tts` — narration 생성 + provider.synthesize (v3 default = Clova)
- `/api/pdf` — unpdf 텍스트 추출
- 글로벌 PlayerBar + IndexedDB 라이브러리 + PlayerProvider — 그대로

### v3 신규 — 저널 큐레이션

#### 1. 저널 카탈로그 (`data/journals.json` + GitHub raw)
- 임상과 메타데이터만 (`{ id, name, nameEn, openAlexFieldId }`). 저널은 OpenAlex가 런타임 조회
- `lib/journals.ts` — `getJournalCatalog()` (GitHub raw fetch + `next: { revalidate: 3600 }`) + 로컬 fallback
- `lib/openalex.ts` — `searchJournalsByField(fieldId)` (필드별 인용수 정렬 상위 10개) + `searchJournalsByName(query)` (자동완성)

#### 2. 호 탐색 (`/api/journal/issues`)
- 입력: `{ issn, year, month }`
- PubMed 쿼리: `"{issn}"[ISSN] AND ("{year}/{month}/01"[PDAT] : "{year}/{month}/{lastDay}"[PDAT])`
- 결과: top 5 abstract 요약 + 전체 논문 목록 + Gemini가 호 전체 abstract로 경향성 분석
- 캐시: Redis `issue:{issn}:{yyyy-mm}`. 과거 호 ∞ TTL, 당월 24h

#### 3. 주제 탐색 (`/api/journal/topic`)
- 입력: `{ issn, topic }` (재활: spasticity / stroke / gait / dysphagia / CIMT 등 추천 태그 + 자유 입력)
- Gemini가 자유 입력 → MeSH 변환
- PubMed: `"{issn}"[ISSN] AND {mesh}[MeSH Terms]`

#### 4. 최근 트렌드 (`/api/journal/trend`)
- 입력: `{ issn }` — 최근 6개월
- Gemini 트렌드 narration → "이 저널에서 요즘 핫한 주제" 한눈에
- 캐시: Redis `trend:{issn}:{yyyy-mm}` 24h

#### 5. ISSN 기반 PubMed 쿼리 (오타 위험 0)
```
기존 v2: "Arch Phys Med Rehabil"[TA]   ← 저널명 오타 위험
v3:     "0003-9993"[ISSN]             ← 고유값
```

### v3 신규 — Auth + 온보딩 + 개인화 (4단계)

```
Google 로그인
  └── 신규 유저 (onboarding_done=false)
        └── /onboarding 강제 redirect
              ① 휴대폰 번호 (Toss billing 필수)
              ② 약관 동의 (서비스/개인정보/3자제공 필수, 마케팅 선택)
              ③ 임상과 선택 (복수) → 저널 확인 (OpenAlex 자동 추천 10개, 빼거나 추가 가능)
              └── onboarding_done=true → 홈
```

DB 스키마 (Drizzle):
- `users` (Auth.js 표준 + `phone, terms_agreed_at, marketing_agreed, onboarding_done`)
- `accounts`, `sessions`, `verification_tokens` (Auth.js 표준)
- `user_journal_prefs` (user_id, journal_issn, specialty_label, is_pinned, sort_order) — 멱등 upsert (v1.1 패턴)
- `subscriptions` (user_id, status, plan, expires_at, toss_customer_key, toss_billing_key)
- `usage_monthly` (user_id, year_month, curation_count, tts_count, fulltext_count, PK on user+month)

**비로그인 사용자 보존**: 비로그인도 모든 v2 흐름 + v3 저널 큐레이션 사용 가능. 한도만 anonymous-id로 카운트. 로그인 시 anonymous-id 사용량을 user_id로 머지.

### v3 신규 — Free 사용량 한도 (6단계)

| 기능 | Free | BYOK | Pro |
|---|---|---|---|
| 자연어 검색 / 미니 요약 | 무제한 | 무제한 | 무제한 |
| 저널 팔로우 / 개인화 | ✅ | ✅ | ✅ |
| 저널 큐레이션 (호/주제/트렌드 실행) | 월 3회 | 무제한 | 무제한 |
| TTS narration | 월 5편 | 무제한 | 무제한 |
| 풀텍스트 요약 | 월 3편 | 무제한 | 무제한 |

- `lib/usage.ts` `checkAndIncrement(identityKey, kind, plan)` — identityKey는 user_id 우선, 없으면 anonymous-id
- BYOK 우회: `applyUserKeysToEnv`가 사용자 Gemini 키 적용 시 plan을 "byok-effective"로 간주, 카운트 스킵
- Vercel Cron 매월 1일 (KST 자정 가정, 결정 필요) 자동 reset
- 한도 초과 시 친절 에러 + "로그인" 또는 "Pro 업그레이드" CTA

### v3 신규 — 결제 (7단계, Toss Payments)

```
첫 결제: 카드 등록 → billing_key 발급 → DB 저장
매월:    Vercel Cron → 자동결제 → expires_at 갱신
실패:    suspended → 사용자 알림
```

- BYOK 1회 결제: `subscriptions.plan='byok'` → Free 한도 우회 (BYOK 결제 = "공식 unlock". 자기 X-Paperis-Keys 입력은 그대로 무제한 — 막지 않음)
- Pro 월 구독: 빌링 키 기반 자동결제
- 사업자 등록·통신판매업 신고 완료 후 8단계에서 `TOSS_LIVE_MODE=1`

---

## 코딩 컨벤션

- TypeScript strict. 컴포넌트 PascalCase, 함수/변수 camelCase
- API 라우트: App Router(`route.ts`), `runtime = "nodejs"`, 무거운 합성은 `maxDuration = 300`
- 에러 처리: try/catch 필수. Gemini 에러는 `friendlyErrorMessage(err, language)`로 정규화 (한국어). v3 새 라우트도 같은 패턴
- 주석: 한국어 OK. **WHY**가 비자명할 때만. WHAT은 식별자가 말한다
- React 19 / Next 16: setState in effect 룰. 외부 시스템 동기화는 의도적 disable 코멘트로
- DB 마이그레이션은 **add-only**. drop column 금지 (롤백 보존)
- 새 페이지/라우트 작성 시 PlayerBar `--player-bar-h` 의존: main에 `pb-[calc(var(--player-bar-h)+...)]` 또는 `pb-32` 보존
- 새 페이지 wrapping 시 ThemeProvider/ApiKeysProvider 안에 들어가는지 확인 (`app/layout.tsx`)
- 모든 Gemini 호출 라우트는 `applyUserKeysToEnv(req)` 동일 패턴 (BYOK 사용자 호환)

---

## v2 → v3 의사결정 진화

| v2 결정 | v3 변화 |
|---|---|
| 단일 AI 스택 (Gemini만) | **깨짐**. v2.0.3-4부터 TTS 3-provider. v3 default TTS = Clova, Gemini는 fallback |
| Auth.js / Neon / Drizzle 전부 제거 | **부활** (4단계). v1.1 패턴 + v3 신규 schema |
| 로그인 없음 (anonymous ID만) | **선택 가능**. 비로그인도 v2 흐름 + v3 큐레이션 사용 가능, anonymous-id 기반 Free 한도 적용 |
| TTS는 narration only | 유지. dialogue 모드 부활 안 함 |
| TTS provider chunk 분할 (Clova 1900, GC 4500) | 더 중요해짐. 트렌드 narration이 길어 chunk 분할 회귀 테스트 필수 |
| TTS 변환 자동재생 X, 라이브러리 append만 | 유지. v3 큐레이션도 동일 (출퇴근 시나리오) |
| WAV 헤더 수동 래핑 (Gemini PCM) | Gemini fallback 시에만 사용. Clova/GC는 MP3 |
| API 키 client localStorage + X-Paperis-Keys 헤더 | 유지. BYOK 결제와 별개로 자기 키 입력은 그대로 무제한 (결제는 "공식 unlock" 편의) |
| URL이 검색 source of truth (`?q&sort&pmid&page`) | 유지 + 확장. 저널도 `/journal/[issn]/issue/[yyyymm]` |
| PDF 파서 = unpdf, `serverExternalPackages` 보존 | 유지 |
| 인용수순 = 페이지 내 정렬만 | 유지 (제약 동일) |
| `listTrackMetas` cursor 순회 | 유지 (load-bearing, 메모리 폭주 회피) |
| PlayerBar 동적 높이 `--player-bar-h` | 유지. 신규 페이지도 의존 |
| 테마 = class 기반 dark + FOUC inline script + suppressHydrationWarning | 유지. 신규 라우트 모두 wrapping 검증 |
| 검색 안전망 (PubMed JSON parse / Gemini control char sanitize) | 유지 |
| 한국어 우선 UI | 유지 |

---

## 라이브 진화 안전 가드 (master 진화 전략)

v2.0.4가 라이브 → 매 단계가 회귀 없이 prod에 들어갈 수 있어야 함.

1. **Feature flag**: 단계별 `NEXT_PUBLIC_FEATURE_*` env로 비활성 가능 (자세한 표는 [PAPERIS_V3_ROADMAP.md](PAPERIS_V3_ROADMAP.md) §3-1)
2. **Fallback 가드**: 외부 의존(Clova, Redis, Toss) 부재 시 silent 강등 — 라우트 자체는 절대 500 안 남
3. **DB 마이그레이션 add-only**: drop column 금지. 이전 코드도 새 schema 위에서 동작
4. **회귀 체크리스트** (각 단계 끝에 수동 실행):
   1. 비로그인 자연어 검색 → 결과 20건
   2. 카드 미니 요약 자동 표시
   3. 카드 → 디테일 → 풀텍스트 → 긴 요약 스트리밍
   4. TTS 변환 → 라이브러리 append 토스트 → 재생 → PlayerBar
   5. 설정 → API 키 입력 → 자기 키로 동작
   6. 라이브러리 백업 → 복원
5. **단계 완료 시 git tag** (`v3.0.0-alpha.N`) → 회귀 발견 시 빠른 롤백
6. **Vercel deploy는 수동** (`vercel deploy --prod --yes`) — 머지 != 배포. 머지 후 prod 검증을 별도 단계로

---

## 마일스톤 요약 (PLAN.md §14 순서 그대로)

상세 작업·파일·위험·검증은 [PAPERIS_V3_ROADMAP.md](PAPERIS_V3_ROADMAP.md) 참조.

| # | 단계 | 의존성 | 회귀 위험 |
|---|---|---|---|
| 1 | TTS default `gemini` → `clova` + fallback 가드 | 없음 | Clova 키 부재 시 Gemini fallback 필수 |
| 2 | `data/journals.json` + `lib/journals.ts` + OpenAlex 확장 | 없음 | 매우 낮음 (사용처 없음) |
| 3 | 저널 큐레이션 (호/주제/트렌드) UI + API 4종 | 2 | `lib/pubmed.ts` 시그니처 보존, `app/page.tsx`는 헤더 한 줄만 |
| 4 | Auth.js + Neon + Drizzle + 온보딩 + 개인화 | 3 | **매우 높음**. 비로그인 모드 보존 가드 필수 |
| 5 | Upstash Redis 캐시 wrapper | 3 | Redis 부재 시 인메모리 fallback |
| 6 | Free 한도 (`usage_monthly`) | 4 + 5 | usage 시스템 다운 시 graceful pass-through |
| 7 | Toss Payments (BYOK + Pro) | 4 + 6 | sandbox/live 토글 분리 |
| 8 | 사업자 등록 후 라이브 키 + 푸터 + 환불 정책 | 7 + 사업자등록 | CS 부담 시작 |

대략 6-10주 (solo dev, 주 5세션 가정) — 자세한 추정은 ROADMAP §5.

---

## 주의사항

- `.env.local` / `.vercel/` / `.claude/` / `*.tsbuildinfo` 모두 gitignore. 절대 커밋 금지
- PubMed API 초당 3회 제한 (API 키 없을 때)
- 유료 논문 full text 무단 수집 금지. 사용자가 합법적으로 보유한 PDF만 업로드 대상
- 임상 의사결정 도구 아님 — README 주의사항 참고
- 4단계 진입 후 사용자 개인정보 처리 시작 → 개인정보처리방침 페이지 v3 7단계 전 게시 필수
- 8단계 라이브 결제 시작 → 환불/CS 대응 부담. solo dev 가용성 한계 명시 필요

---

*Paperis v3 CLAUDE.md — 2026-05-08 v2 → v3 재작성. 단계 완료 시점마다 본 문서도 갱신.*
