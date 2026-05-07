# Paperis v3 — 구현 로드맵

> 짝꿍 문서: [PAPERIS_V3_PLAN.md](PAPERIS_V3_PLAN.md) (전체 기획), [TODO.md](TODO.md) (v2.0.4 스냅샷 + v3 시작 컨텍스트), [CLAUDE.md](CLAUDE.md) (작업 컨벤션).
> 이 문서는 1~8단계 마일스톤을 PR 단위까지 쪼갠 작업 계획. 사용자 결정 (2026-05-08): **master에서 그대로 진화 / PLAN 1~8 순서 유지 / CLAUDE.md v3 재작성**.

---

## 0. 전제 조건

- master 브랜치에서 v2.0.4 위에 그대로 진화. **별도 v3 브랜치 분기 안 함**
- v2.0.4 라이브 사용자가 깨지지 않도록 **각 단계에 feature flag + fallback 가드 필수**
- 매 단계 끝에 `npm run build` + 회귀 체크리스트(§3-4) 통과 후 commit/release tag (`v3.0.0-alpha.N`)
- DB 마이그레이션은 add-only — drop column 금지 (롤백 보존)

---

## 1. 마일스톤 1 — TTS 기본 provider 전환 (`gemini` → `clova`)

| 항목 | 내용 |
|---|---|
| 목표 | 트렌드/긴 narration 안정성 확보. v3 진입 전 TTS 타임아웃 제거 |
| 의존성 | 없음 |
| 검증 | `npm run build` + v2 narration 1편 변환 → 라이브러리 append → 모바일 재생 |

**하위 작업**

1. [lib/tts/index.ts](lib/tts/index.ts) — `DEFAULT_PROVIDER` `"clova"` 변경 + Clova 키 부재 시 `gemini` fallback 가드
2. [app/api/tts/route.ts](app/api/tts/route.ts) / [app/api/tts/preview/route.ts](app/api/tts/preview/route.ts) — provider 미지정 요청에서 `getTtsProvider()` 호출 검증, Clova 키 부재 시 친절 에러
3. [components/TtsProviderPreferenceProvider.tsx](components/TtsProviderPreferenceProvider.tsx) — 기본값 `"clova"` (기존 사용자 localStorage 보존)
4. [components/SettingsDrawer.tsx](components/SettingsDrawer.tsx) — provider 섹션 라벨/설명 업데이트
5. README / .env.example — `NCP_CLOVA_*` 권장 표시 강화

**회귀 위험**: 라이브 사용자 중 Clova 키 미보유자 → server `process.env.NCP_CLOVA_CLIENT_ID/SECRET` 부재 시 Gemini로 자동 강등 가드 필수. **Vercel prod env에 Clova 키 미등록** 상태이므로 fallback 없으면 즉시 깨짐.

---

## 2. 마일스톤 2 — `data/journals.json` + 카탈로그 fetch 레이어

| 항목 | 내용 |
|---|---|
| 목표 | 임상과 메타데이터 + OpenAlex field ID를 외부 데이터로 분리 |
| 의존성 | 없음 (1단계와 병렬 가능) |
| 검증 | `npm run build` + `getJournalCatalog()` 호출 → 3개 임상과 반환 + revalidate 3600 동작 |

**하위 작업**

1. `data/journals.json` 신규 — 재활의학과(`fields/2734`), 심장내과(`fields/2705`), 신경과(`fields/2728`)
2. `lib/journals.ts` 신규 — `getJournalCatalog()` (GitHub raw fetch + revalidate 3600) + 타입 + 로컬 fallback
3. [lib/openalex.ts](lib/openalex.ts) 확장 — `searchJournalsByField(fieldId, page=1)` + `searchJournalsByName(query)` (자동완성)
4. TODO.md "v3 시작 컨텍스트"에 카탈로그 위치 추가

**회귀 위험**: 매우 낮음. 새 모듈은 아직 import 없음. `enrichPapers` export 시그니처는 **반드시 보존** (search route 의존).

---

## 3. 마일스톤 3 — 저널 큐레이션 (호 / 주제 / 트렌드)

| 항목 | 내용 |
|---|---|
| 목표 | v3 핵심 — 비로그인에서도 저널 단위 진입 3가지 흐름 동작 |
| 의존성 | 2단계 |
| 검증 | 재활의학과 → Archives of PM&R → 호/주제/트렌드 정상 + v2 자연어 검색 회귀 없음 |

**하위 작업**

1. `app/journal/page.tsx` — 임상과 그리드
2. `app/api/journal/search/route.ts` — OpenAlex 저널 검색 (자동완성)
3. `app/journal/[issn]/page.tsx` — 저널 홈 (탭 3개)
4. `app/api/journal/issues/route.ts` — `?issn&year&month` → PubMed `[ISSN]` AND `[PDAT]` → enrich → top5 + 전체 + Gemini 경향성
5. `app/api/journal/topic/route.ts` — `?issn&topic` → MeSH 변환 → PubMed
6. `app/api/journal/trend/route.ts` — `?issn` → 최근 6개월 → Gemini 트렌드
7. `app/journal/[issn]/issue/[yyyymm]/page.tsx` — 호 큐레이션 (PaperCard 재사용 + 경향성 카드)
8. [lib/pubmed.ts](lib/pubmed.ts) 확장 — ISSN 기반 쿼리 빌더
9. [app/page.tsx](app/page.tsx) 헤더에 "저널 탐색" 진입점 추가 (v2 검색 영역 보존)

**회귀 위험**: 중간. `app/page.tsx`는 헤더 한 줄만 추가. `lib/pubmed.ts`는 새 함수 추가만, 기존 `searchPubMed` 시그니처 보존. 호별 200건+ enrich 시 OpenAlex polite pool 부담 → per-page 200 페이징 + soft-fail 보존. `applyUserKeysToEnv` 패턴은 신규 라우트도 동일.

---

## 4. 마일스톤 4 — Auth.js v5 + Neon + 온보딩

| 항목 | 내용 |
|---|---|
| 목표 | Google OAuth + 휴대폰/약관 + 저널 개인화 서버 저장 |
| 의존성 | 3단계 (개인화 대상 필요) |
| 검증 | 비로그인으로 v2 + 저널 큐레이션 동작 → 로그인 → 신규 온보딩 → user_journal_prefs CRUD → 로그아웃 후 비로그인 그대로 |

**하위 작업**

1. 의존성 추가: `next-auth@beta` (v5), `drizzle-orm`, `@neondatabase/serverless`, `drizzle-kit` (dev)
2. `auth.ts` + `app/api/auth/[...nextauth]/route.ts` — Google OAuth + Drizzle adapter + database session. session 콜백에서 `user.id` 명시 매핑 (v1.1 load-bearing)
3. `lib/db/schema.ts` + `lib/db/index.ts` + `drizzle.config.ts` — Auth.js 표준 4개 + `users.{phone, terms_agreed_at, marketing_agreed, onboarding_done}` + `user_journal_prefs`
4. `app/onboarding/page.tsx` — 휴대폰 + 약관 + 임상과/저널 (3 step wizard). `onboarding_done=false` → 모든 라우트 redirect
5. `app/api/account/prefs/route.ts` — user_journal_prefs CRUD (멱등 upsert v1.1 패턴)
6. `components/AuthMenu.tsx` — 헤더 아바타 드롭다운 (v1.1 기반 복원)
7. `components/AccountSyncProvider.tsx` — 첫 로그인 onboarding 체크
8. **anonymous-id 흐름 유지** — 비로그인 사용자도 v2 흐름 그대로 (load-bearing)

**회귀 위험**: 매우 높음. v2 라이브 사용자가 로그인 강제로 떨어지면 즉시 사용 불가 → **비로그인 모드 보존 가드 필수**. `applyUserKeysToEnv` race 위험 증가 → provider별 ctx 인자 리팩토링 검토. v1.1.0 코드는 git 태그에서 참고 복원 가능.

---

## 5. 마일스톤 5 — Upstash Redis 캐싱

| 항목 | 내용 |
|---|---|
| 목표 | 트렌드/호 분석 결과 캐시. 첫 사용자만 Gemini 호출 |
| 의존성 | 3단계 |
| 검증 | 같은 (issn, yyyy-mm) 두 번째 호출 → `x-cache: hit` + Gemini 0건 |

**하위 작업**

1. 의존성: `@upstash/redis`. Vercel Marketplace 연결
2. `lib/journal-cache.ts` — wrapper. 키 `trend:{issn}:{yyyy-mm}` / `issue:...`. TTL: 과거 호 ∞, 당월 24h
3. 3단계 라우트 3개 수정 — 캐시 조회 → miss 시 호출 후 set
4. [lib/query-cache.ts](lib/query-cache.ts) 호환 검토 — 모듈 LRU 그대로 유지

**회귀 위험**: 낮음. Redis 부재 시 wrapper가 silent fallback (캐시 miss 처리). `UPSTASH_REDIS_REST_URL` 미설정 시 인메모리 LRU로 자동 강등.

---

## 6. 마일스톤 6 — Free 사용량 제한 (`usage_monthly`)

| 항목 | 내용 |
|---|---|
| 목표 | Free 월 한도 (큐레이션 3 / TTS 5 / 풀텍스트 3) |
| 의존성 | 4단계 + 5단계 (캐시 hit는 사용량 제외 정책 결정 필요) |
| 검증 | Free로 큐레이션 3회 → 4회 한도 초과 + 업그레이드 CTA. BYOK 키 → 무제한 |

**하위 작업**

1. `lib/db/schema.ts` 확장 — `usage_monthly (user_id, year_month, curation_count, tts_count, fulltext_count)` PK (user_id, year_month)
2. `lib/usage.ts` — `checkAndIncrement(userId, kind, plan)`. plan="free"만 카운트, 초과 throw
3. 라우트 hook: 트렌드/호/주제, [app/api/tts/route.ts](app/api/tts/route.ts), [app/api/fulltext/route.ts](app/api/fulltext/route.ts), [app/api/summarize/read/route.ts](app/api/summarize/read/route.ts)
4. `app/api/account/usage/route.ts` — 잔여 횟수 조회
5. Vercel Cron — 매월 1일 00:00 (TZ 결정 필요) 다음 달 row 생성/리셋
6. **BYOK 우회**: `applyUserKeysToEnv`가 사용자 키 적용 → usage 체크 스킵 (`readUserKeys(req).gemini` 존재 시 plan="byok-effective")

**회귀 위험**: 매우 높음. 비로그인 사용자 정책 결정 필요 (질문 §4-2). usage 시스템 다운 시 라우트 통과해야 함 (graceful degradation).

---

## 7. 마일스톤 7 — Toss Payments 빌링 (BYOK + Pro)

| 항목 | 내용 |
|---|---|
| 목표 | BYOK 1회 결제 unlock + Pro 월 자동결제 |
| 의존성 | 4단계 + 6단계 |
| 검증 | 테스트 카드 BYOK → `subscriptions.plan='byok'` → BYOK 우회 동작. Pro → billing_key 저장 → 다음달 cron 결제 |

**하위 작업**

1. 의존성: Toss Payments SDK (`@tosspayments/payment-sdk` 또는 brandpay)
2. schema: `subscriptions (user_id, status, plan, expires_at, toss_customer_key, toss_billing_key)`
3. `lib/billing.ts` — Toss API wrapper
4. `app/api/billing/checkout/route.ts` — BYOK 1회
5. `app/api/billing/subscribe/route.ts` — Pro 빌링 키 발급
6. `app/api/billing/webhook/route.ts` — Toss 웹훅 (완료/실패/카드 만료)
7. `app/api/cron/recurring-billing/route.ts` — 매일 00:00 만료 구독 자동 결제
8. `app/billing/page.tsx` + `app/account/page.tsx`
9. **개인정보처리방침 + 이용약관** (법적 필수)
10. `lib/usage.ts` — plan='pro'/'byok' 무제한

**회귀 위험**: 매우 높음. 사업자 등록 완료 전 라이브 결제 키 발급 불가 → `TOSS_LIVE_MODE` env 토글로 sandbox/prod 분리 필수.

---

## 8. 마일스톤 8 — 사업자 등록 후 실결제 오픈

1. `TOSS_SECRET_KEY` / `TOSS_CLIENT_KEY` 라이브 키 교체
2. 푸터: 사업자등록번호, 통신판매업신고번호, 대표자, 주소, 고객센터 (전자상거래법)
3. `app/legal/refund/page.tsx` 환불 정책
4. 가격표 정식 공개 + Free 업그레이드 CTA 활성화
5. (선택) 마케팅 동의 사용자에게 첫 캠페인

---

## §3-1. 단계별 Feature Flag

| 단계 | flag / 가드 | 비활성 시 동작 |
|---|---|---|
| 1 | `NCP_CLOVA_CLIENT_ID` 부재 → Gemini fallback (코드 가드) | v2.0.4 그대로 |
| 2 | (해당 없음, import 안 되는 한 무영향) | — |
| 3 | `NEXT_PUBLIC_FEATURE_JOURNAL=1` | 헤더 진입점 숨김, v2 검색만 |
| 4 | `NEXT_PUBLIC_FEATURE_AUTH=1` | AuthMenu 숨김, onboarding 비활성, 비로그인만 |
| 5 | `UPSTASH_REDIS_REST_URL` 부재 → 인메모리 fallback | 캐시 미스 (느리지만 동작) |
| 6 | `NEXT_PUBLIC_FEATURE_USAGE_LIMIT=1` | 모든 라우트 무제한 |
| 7 | `NEXT_PUBLIC_FEATURE_BILLING=1` | 결제 페이지 404, 모든 사용자 effective Pro |
| 8 | `TOSS_LIVE_MODE=1` | sandbox/test 키 |

---

## §3-4. v2 핵심 흐름 회귀 체크리스트 (각 단계 끝에 수동)

1. 비로그인 자연어 검색 (예: "stroke rehabilitation gait") → 결과 20건
2. 상위 카드 미니 요약 자동 표시
3. 카드 → 디테일 → 풀텍스트 → 긴 요약 스트리밍
4. TTS 변환 1건 → 라이브러리 append 토스트 → 라이브러리 재생 → PlayerBar
5. 설정 → API 키 입력 → 자기 키 동작
6. 라이브러리 백업 → 복원

---

## §4. 미해결 질문 (구현 직전에 결정 필요)

| # | 질문 | 영향 단계 | 기본 추정 |
|---|---|---|---|
| 1 | 사용량 카운터 월 리셋이 UTC vs KST 자정? | 6 | KST (한국 의사 대상) |
| 2 | 비로그인에게도 사용량 적용? anonymous-id 기반(우회 쉬움) vs 로그인 강제? | 6 | "큐레이션은 로그인 필수, v2 검색·미니요약은 비로그인 무제한" 분리 |
| 3 | BYOK 1회 결제 가격 (₩9,900 / ₩19,900?) | 7 | — |
| 4 | Pro 월 구독 가격 + 무료 체험 여부 | 7 | — |
| 5 | 온보딩 이탈 시 다음 방문에 그 step 복귀? 처음부터? | 4 | step별 progress 저장 후 복귀 |
| 6 | 트렌드 캐시 무효화 — TTL만(당월 24h) vs 새 호 출간 감지 강제 | 5 | TTL만 (단순화) |
| 7 | 사용자 직접 추가 저널 ISSN 검증 — OpenAlex search 결과만 vs 자유 입력? | 4 | OpenAlex search만 (오타 방지) |
| 8 | 저널 개인화 화면에서 임상과 그룹별 폴딩 vs 평면? | 4 | 그룹별 (PLAN §5) |
| 9 | 비로그인 누적 IndexedDB 라이브러리 — 로그인 후 그대로 노출? 클라우드 동기화는? | 4 / 후속 | 그대로 노출, 동기화는 v3+ 후속 |
| 10 | X-Paperis-Keys 우회로 BYOK 결제 안 하고 자기 키 쓰는 정책 — 막을지? | 6/7 | 막지 말 것 (v2 호환, 우리 비용 0) |

---

## §5. 작업 규모 추정

solo dev. "세션" = 2-4시간 작업 단위.

| 단계 | 신규 LOC | 수정 LOC | PR | 세션 | 비고 |
|---|---|---|---|---|---|
| 1 | 50 | 100 | 1 | 0.5 | TTS provider 전환 + fallback |
| 2 | 250 | 50 | 1 | 1 | journals.json + lib/journals.ts |
| 3 | 1500 | 200 | 5-7 | 5-7 | 가장 큰 단계 (UI 4 + API 4 + Gemini prompt 튜닝) |
| 4 | 1200 | 300 | 4-6 | 6-8 | Auth + onboarding + DB. v1.1 코드 참고 |
| 5 | 200 | 100 | 1-2 | 1-2 | wrapper + 3 라우트 |
| 6 | 400 | 200 | 2-3 | 2-3 | usage + Cron + UI 잔여 |
| 7 | 1500 | 200 | 5-7 | 7-10 | Toss + 웹훅 + cron + 약관 |
| 8 | 200 | 100 | 1-2 | 1-2 | 키 교체 + 푸터 + 환불 |
| **합계** | **~5300** | **~1250** | **20-29** | **24-34** | **6-10주** (주 5세션) |

위험 가산치:
- 4단계 Auth.js v5 + Drizzle + Next.js 16 / React 19 호환성 → +1-2 세션
- 7단계 Toss 한국 PG 사업자 검증·웹훅 → +2-3 세션
- v2.0.4 라이브 회귀 hotfix 평균 +0.5 세션 / 단계

---

*Paperis v3 ROADMAP — 2026-05-08 작성. PLAN.md는 기획, 이 문서는 실행 계획.*
