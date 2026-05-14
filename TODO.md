# Paperis — TODO / 진척 기록

> 마지막 갱신: 2026-05-15 (라이브러리 소스 배지 + reading UX + noise 필터 + 명시적 submit + BYOK API Key 가이드)
> 외부 노출 문서는 [README.md](README.md), 컨텍스트는 [CLAUDE.md](CLAUDE.md). 이 파일은 작업 일지·기술부채·의사결정 기록 보관용.

---

## 현재 상태

- **라이브**: paperis.vercel.app — v3 M1~M7 + 멀티 AI provider + 디자인 시스템 + **Phase 2-A 랜딩페이지/i18n 인프라** 배포
- **GitHub**: Rehab0x/paperis (master), origin과 동기화
- **Vercel**: Pro plan (5분 maxDuration), 수동 배포 (`vercel deploy --prod --yes`), daily cron (KST 자정 자동결제)
- **외부 통합 (prod env 등록 완료)**: Neon Postgres · Google OAuth · NCP Clova · Gemini · PubMed/Unpaywall · Upstash Redis · Toss Payments (sandbox)
- **데이터**: `data/journals.json` GitHub raw fetch (1h revalidate). 25 임상과, 3개(재활/심장/신경)에 manualSeedJournals 입력
- **Phase 2-A flag**: `NEXT_PUBLIC_FEATURE_LANDING` default 0 (prod 검증 후 1로 활성)

### v3 마일스톤 진척

- M1 ✅ TTS default Clova + Gemini fallback 가드
- M2 ✅ 카탈로그(GitHub raw) + OpenAlex Sources/Works
- M3 ✅ 저널 큐레이션 풀스택 (호/주제/트렌드 + 차단/추가/즐겨찾기 + 페이지네이션 + OA 정렬)
- M4 ✅ Auth.js v5 + Neon + 온보딩 + localStorage↔DB 양방향 동기화
- M5 ✅ Upstash Redis 캐시 (silent fallback)
- M6 ✅ Free 사용량 한도 (`FEATURE_USAGE_LIMIT=1` prod 활성)
- M7 ✅ Toss Payments 풀스택 (PR1~PR5, sandbox 검증 완료)
- **M8 다음** — 사업자등록 후 `TOSS_LIVE_MODE=1` + 라이브 결제 활성

### v3 후반부 작업 (M1~M8 외)

- ✅ **에디토리얼 디자인 시스템** — Fraunces 세리프 + Pretendard + warm 오렌지 액센트. `paperis-*` Tailwind 토큰. 다크 + 라이트 양쪽 변환
- ✅ **홈 카드 시스템** — ContinueListening / MySpecialties / TrendFeatured (favorites 매일 로테이션) / MyJournalsNewIssues (14일 휴리스틱 ●)
- ✅ **PlayerBar 컴팩트** — SVG 아이콘, 모바일 2줄, marquee 거리 기반 일정 속도, range thumb 드래그 시크
- ✅ **TTS 트랙 한국어 제목** — narration과 병렬로 Flash Lite 번역
- ✅ **모바일 history sync** — JournalPaperList selectedPmid를 URL `?pmid=`로 → 모바일 뒤로가기 자연스러움
- ✅ **Settings 아코디언** — 섹션 토글, BYOK 게이트, AI provider 선택, API 키 그룹화
- ✅ **createPortal 드로어** — 라이브러리/설정이 헤더 backdrop-filter containing block 회피
- ✅ **멀티 AI provider (Phase A~E)** — Gemini/Claude/OpenAI/Grok 추상화 + 등급별 권한 게이트
- ✅ **관리자 권한** — `ADMIN_EMAILS` env. 결제 없이 BYOK 효과
- ✅ **등급별 권한 명확화** — Free/Pro/BYOK/Admin 분리 (본인 키 강제 / 서버 env / fallback 룰)

### 글로벌 확장 (Phase 2) — docs/GLOBAL_EXPANSION_PLAN.md

- ✅ **Phase 2-A 랜딩페이지 + i18n 인프라** (2026-05-13)
  - 자체 i18n (`lib/i18n.ts` + `messages/{ko,en}.json`, next-intl 미사용 — 가볍게)
  - `app/[locale]/` SSG 랜딩 (Hero/Stats/How/Features/Pricing), 다크/라이트 양쪽
  - `middleware.ts` — / 진입 시 쿠키 → GeoIP → Accept-Language(ko 토큰 우선) 분기
  - URL 구조 = **하이브리드**: 랜딩만 `/[locale]/`, 앱은 `/app` 유지 (회귀 위험 최소)
  - 기존 `app/page.tsx` → `app/app/page.tsx` 이동, 루트는 server redirect fallback
  - 내부 "/" 링크 14곳 → "/app" 일괄 수정 (헤더 로고/홈으로/onboarding redirect/AuthMenu callbackUrl)
  - 글로벌 Footer (`components/Footer.tsx` + `lib/branding.ts`) — 모든 페이지 © 표기, PlayerBar 높이 보정
  - **회귀 fix 2건** (Phase 2-A 직후 발견): TtsQueueBadge·LibraryDrawer가 `router.push("/?...")` 쓰던 부분 → `/app?...`
- ✅ **Phase 2-B 영어 서비스 파이프라인** (2026-05-14)
  - `lib/i18n.ts getRequestLanguage(req, body?)` — 서버가 cookie 기반 자동 결정 (body.language 명시 우선, 미명시 시 paperis.locale 쿠키)
  - `lib/tts/index.ts resolveTtsProvider(name, language)` — 사용자가 provider 명시 안 한 경우 ko→Clova, en→Google Cloud TTS 자동 선택
  - 프롬프트 영어 분기 — `lib/summary.ts`/`lib/gemini.ts`(read+narration)/`lib/trend.ts`(trend+headline) — 한국어 의학용어 보존 지침과 한국어 인사 회피 지침은 영어 출력 시 무의미해 자동 제거, 톤·예시는 영어로
  - API 라우트 7개 (TTS 3·summarize 2·journal trend 2) — `body.language === "en" ? "en" : "ko"` 하드코딩 → `getRequestLanguage(req, body)` 일괄
  - 클라이언트 `useLocale()` 훅 신설 — `paperis.locale` cookie 기반. PaperDetailPanel/TrendTtsButton의 `language: "ko"` 하드코딩 제거
  - `lib/journals.ts SpecialtyLocaleScope("ko"|"en"|"both")` 타입 + `Specialty.defaultLocale?` optional + `isSpecialtyVisibleForLocale` 헬퍼 — Phase 2-C 온보딩 UI에서 활성 예정. JSON 자체는 그대로(GitHub web으로 점진 입력 가능)
- ✅ **Phase 2-C1 앱 UI i18n** (2026-05-14 완료) — 핵심 사용자 흐름 전체 영어 완주
  - 인프라: `messages/app.*` 네임스페이스 + `useAppMessages` 클라이언트 훅 + `fmt(template, params)` 인터폴 헬퍼
  - 헤더 3개: LibraryLink·SettingsLink·AuthMenu
  - 홈 카드 5개: ContinueListening·MySpecialtiesPicker·TrendFeaturedCard·MyJournalsNewIssues·UsageBanner
  - 검색·결과·디테일 8개: SearchBar·SortControl·PaperCard·MiniSummary·PaperDetailPanel·FullTextView·PdfUpload
  - TTS·플레이어·라이브러리 6개: TtsButton·TtsCompletionToast·TtsQueueBadge·PlayerBar(ScriptPanel)·AudioLibrary·LibraryDrawer
  - 저널 큐레이션 9개: JournalTabs·JournalCard·IssueExplorer·TopicExplorer·TrendDigest·JournalPaperList·JournalSearchAdder·JournalPagination·JournalEntryLink
  - app/app/page.tsx 헤더 안내 (검색식 토글/OA/페이지네이션/empty 등)
  - **총 31개 컴포넌트 + 230+ 메시지 키**, 영어 모드 사용자 핵심 흐름 영어 완주 가능
- ✅ **Phase 2-C2 부수 그룹** (2026-05-14 완료) — 설정 드로어 + specialty 관리 + 페이지 5개
  - C2-A: MySpecialtiesGrid·MySpecialtiesEditor·SpecialtyJournalsList·JournalBlocksManager (locale별 specialty name/nameEn 분기 포함)
  - C2-B: SettingsDrawer 단일 최대 (테마/TTS provider+voice+speed/자동 미니/알림/AI provider/API 키/내 임상과/차단/백업 9개 섹션 + ByokGateBadge + VoicePreview + AutoMiniToggle + NotificationPermission + ApiKeysSection + AiProviderSection + LibraryBackup)
  - C2-C: account·billing·billing/success·billing/fail·onboarding (날짜는 locale별 toLocaleDateString, 가격은 KRW 그대로 — Stripe 도입 전)
  - **총 14개 컴포넌트/페이지 + 250+ 메시지 키**
  - **후속 fix (같은 날)**: server-rendered journal 페이지 3개 누락분 (`getServerLocale` helper) + specialty 영어 모드 한국어 secondary 숨김 + MiniSummary bullet 정렬 + trend periodLabel ko/en 분기 + trend cache v2 prefix bump + TrendFeaturedCard URL language 명시(locale 변화 refetch + hydrated 가드) + 홈 카드 순서 최종
- ✅ **Phase 2-C2 추가 다듬기 (2026-05-15)**
  - **라이브러리 소스 배지** — `AudioTrack.sourceLabel` 필드 + AudioLibrary가 트랜드/풀텍스트/초록 3종 배지 표시 (`📊 Trend` / `📄 Full text` / `🧾 Abstract`). PlayerBar metaLine에 voice 추가(모바일에서도 화자 노출). PaperDetailPanel SOURCE_LABEL 맵 (Unpaywall/EPMC/PMC 별 라벨)
  - **Reading UX 4건** — (1) Korean TTS 스크립트 문단 분할 (Gemini narration prompt에 "3-4문장마다 빈 줄" 지침, 한국어 출력에도 적용) (2) PaperDetailPanel Abstract `<details>` 섹션 (open default) (3) FullTextView "📥 Download PDF" / "View original ↗" 라벨 분기 (unpaywall/s2/medrxiv는 PDF) (4) 풀텍스트 확보 시 abstract도 요약/TTS 가능하도록 입력 소스 토글
  - **입력 소스 토글 재배치** — Long Summary 안에 있던 풀텍스트/초록 토글을 Long Summary 위 별도 섹션 "요약·TTS 소스"로 분리 (요약만 토글 가능하다는 오해 제거). "전체 본문 미확보" 문구 → 깔끔한 "초록 기반으로 요약합니다."
  - **호 탐색 noise 필터** — `lib/paper-filter.ts` NOISE_PUBLICATION_TYPES + isSubstantivePaper + countNoise. IssueExplorer에서 Editorial/Letter/Erratum 등 기본 ON 필터 + 사용자 토글 (DOI 직접 접속 case 지원)
  - **호 탐색·트렌드 명시적 submit** — pending(사용자 입력) vs committed(fetch 트리거) 상태 분리 + Search/Analyze 버튼. select 변경 즉시 fetch 거슬림 해결. 버튼은 우측 정렬 + 항상 accent 색상 (비활성도 같은 색, opacity로만 표시)
  - **트렌드 안내 문구 정돈** — "Gemini가 abstract 모음을..." → "abstract 모음을..." (멀티 AI provider 시대)
  - **BYOK API Key 발급 가이드** — (A) `KEY_HELP_URLS` 상수 + SettingsDrawer renderField 옆 인라인 "발급 ↗" 링크 (8개 provider, Unpaywall만 이메일이라 제외) (B) `/help/api-keys` 가이드 페이지 — 서버 컴포넌트 + `getServerLocale()` 분기 ko/en, 8개 provider 단계별 스크린샷 없는 텍스트 가이드, ApiKeysSection 상단에 진입 링크
- ⬜ **Phase 2-C3** 약관 페이지 영어 번역 (legal/terms·privacy·refund — 법률 검토 필요)
- ⬜ **Phase 2-D** Stripe 결제 연동 (해외 사용자 USD) — 한국 사업자등록(M8) 완료 후

---

## 다음 후보 / 기술부채

### v3 마일스톤 (남은 것)

- [ ] **M8** 사업자등록 후 `TOSS_LIVE_MODE=1` + 푸터 사업자 정보 + 라이브 검증
  - 사업자 등록증, 통신판매업 신고 완료 시 시작
  - Toss 라이브 키 발급 → Vercel env 교체
  - `/legal/{terms,privacy,refund}` 페이지의 placeholder(`support@paperis.example`, 사업자 정보)를 실제 값으로 갱신
  - 라이브 결제 1회 + 환불 1회 회귀 검증
  - 푸터 컴포넌트 신설 (사업자명·대표·연락처·통판신고번호)

### prod 활성화 / 운영 대기

- [ ] **추가 AI provider env 등록** — `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`XAI_API_KEY` Vercel prod에 등록 시 Pro 사용자도 선택 가능. 현재는 본인 키 입력한 BYOK 사용자만
- [ ] **`usage_monthly` 오래된 row cleanup** — lazy reset 패턴이라 행 누적. cron으로 N개월 이전 row delete

### UX 개선 후보 (우선순위 낮음)

- [ ] **카탈로그 추가 시드** — 정형외과/마취/응급/내과 등 22개 임상과의 manualSeedJournals ISSN 입력
- [ ] **새 호 실제 감지** — 현재 ● 인디케이터는 "14일 안 본 저널" 휴리스틱. 가벼운 latest-issue 메타만 받는 엔드포인트 + localStorage `lastSeenIssue:{openAlexId}` 비교로 정확도 강화 가능
- [ ] **이어 읽기 카드** — 홈 우선순위 3. reading history DB 추가 필요 (`user_reading_history`)
- [ ] **시간대 인식 카드** — 출퇴근(7-9시)/점심(12-13시)/저녁(18-20시)별 추천 콘텐츠 강조
- [ ] **HTML 풀텍스트 정확도** — `@mozilla/readability` 도입 (자체 구현은 일부 publisher에서 정확도 낮음)
- [ ] **TTS narration 길이 제어** — 5분 넘는 케이스에서 Vercel timeout 한계 근접. chunk 단위 progressive 합성 미구현
- [ ] **라이브러리 백업 zip 압축** — 트랙 50편 base64 = 100MB+. 개별 트랙 export 또는 zip 미구현
- [ ] **에러 바운더리** — React error boundary 없음. 런타임 에러 시 화면 깨짐
- [ ] **단위 테스트** — `lib/pubmed.ts` XML 파서, `lib/openalex.ts` group_by 정렬, `lib/account-prefs.ts` 멱등 upsert, `lib/usage.ts` race-safe 분기, `lib/ai/*` provider mock
- [ ] **CSP / 보안 헤더** — `Content-Security-Policy` / `X-Frame-Options`
- [ ] **PWA 오프라인 지원** — 홈 shell/정적 페이지 precache
- [ ] ~~영어 UI 토글~~ → **Phase 2-B/2-C로 이관** (랜딩만 i18n 완료, 앱 UI는 다음 사이클)
- [ ] **이메일 magic link** — Resend/SES 등 메일 발신 셋업 후 Auth.js EmailProvider 추가
- [ ] **applyUserKeysToEnv race** — Node 단일 프로세스에서 동시 요청 시 process.env 충돌 이론적 가능성. provider별 ctx 인자로 리팩토링 검토
- [ ] **NCBI ERROR 자동 재시도** — 현재는 ERROR 응답 시 throw. NCBI flapping 자주 발생하므로 backoff retry 1-2회 추가 검토

### 해결된 항목 (v3에서)

- [x] OpenAlex enrichment 캐싱 — `next: { revalidate: 3600 }` + M5 Redis로 강화
- [x] 인용수순 정렬 페이지 한계 — 호 탐색에서는 OpenAlex enrichment + 페이지 내 정렬로 동작
- [x] 라이브러리 다른 기기 동기화 — v3 M4에서 user_journal_prefs 4 테이블로 임상과·저널만 동기화 (오디오 자체는 여전히 IndexedDB)
- [x] OA 정렬이 "현재 페이지" 한정 → 전체 결과 단위 정렬 (호/주제/트렌드 모두 한 번에 받아 클라 페이지네이션). 자연어 검색은 페이지 단위 토글
- [x] 페이지 이동 시 결과 하단에서 시작되던 UX → 자동 smooth scroll top + 페이지네이션 상하 양쪽 표시
- [x] 모바일 뒤로가기로 paper detail 통과해서 점프하던 문제 — URL `?pmid` 동기화
- [x] 라이브러리/설정 드로어가 헤더 영역만큼만 보이던 문제 — `createPortal`로 body 마운트
- [x] PlayerBar 모바일 두 줄로 펴져 라이브러리 짧아짐 — single row + SVG + 컴팩트
- [x] PlayerBar 진행 막대 클릭 시크 → 드래그 thumb. 시간/위치 정확 일치 (padding 보정)
- [x] PlayerBar marquee 너무 빠름 — 거리 기반 일정 속도 + 최소 30초
- [x] PlayerBar ⏸ 모바일 오렌지 박스 (iOS 컬러 이모지) — SVG로 교체
- [x] 헤더 ⚙ 이모지 환경별 렌더링 차이 — heroicons cog-6-tooth SVG로 교체
- [x] 트렌드 전체 분석 30~90초 → 홈 카드용 lite endpoint (~5-10초, Flash Lite, headline만)
- [x] 트렌드 빈 박스 로딩 → 명시적 "분석 중" 메시지 + spinner + 메타
- [x] BYOK 결제 후 본인 키 미입력 시 우리 키 무단 사용 가능 — 엄격 게이트 (호출 실패 + 에러 메시지)
- [x] Pro provider 선택 불가 (BYOK만 가능) → Pro도 env 보유 provider 선택 가능, 비보유는 disabled
- [x] TtsQueueBadge·LibraryDrawer가 `router.push("/?...")` 사용 — Phase 2-A 도입 후 `/app?...`로 가지 않으면 미들웨어가 다시 가로채 pmid 쿼리 잃는 버그. `ae1ac52`에서 fix
- [x] "Gemini가 검색식으로 바꿔 돌립니다" 안내 문구 — 멀티 AI provider 시대에 부정확. provider 언급 제거
- [x] SortControl 모바일에서 한쪽 몰림 — inline-flex + wrapper justify-center로 가운데 정렬
- [x] LibraryDrawer/SettingsDrawer 헤더 이모지+한글 — Paperis 로고 톤(Fraunces + accent dot)으로 통일

---

## 의사결정 기록 (load-bearing — 변경 시 사용자 재합의 필요)

### v3 핵심 정신

- **저널 큐레이션 1순위 진입** — 자연어 검색은 보조. 임상과→저널→호/주제/트렌드 흐름이 메인
- **출퇴근 청취 1순위 시나리오** — 모든 흐름이 결국 TTS → IndexedDB 라이브러리 → PlayerBar로 수렴
- **로그인 무관 동작 보존** — 비로그인도 v2 검색 + v3 큐레이션 모두 사용 가능. 사용량 한도는 anonymous-id 기반
- **홈은 빈 검색 상태에서 카드 시스템 노출** — 검색바 입력 시 v2 결과로 자연 전환. `q.trim()` 조건 분기

### 인증 / DB

- **Auth.js v5 + Google OAuth + Neon + Drizzle** — session strategy `database`(JWT 아님), session 콜백에서 `user.id` + `onboardingDone` 명시 매핑
- **사용자 prefs PUT = 멱등 upsert** — Neon HTTP는 statement-level이라 트랜잭션 X. `onConflictDoUpdate` + `notInArray` delete (v1.1 카트 패턴 → v3 user_specialties/blocks/additions/favorites 차용)
- **DB 마이그레이션 = add-only** — drop column 금지. 이전 코드도 새 schema 위에서 동작 보장

### 등급 시스템 (2026-05-12~13 정립)

- **Free**: 한도 적용. provider = gemini 강제. 본인 키 입력 X
- **Pro**: 무제한 (우리 env 키). provider 자유 선택. env 키 있는 provider만 활성, 없는 건 disabled. 본인 키 입력 X
- **BYOK**: 무제한 (본인 키 강제). 본인 키 입력 안 한 provider 호출 시 명확한 에러 — env fallback 없음. `applyUserKeysToEnv`가 BYOK 사용자만 헤더 키 적용. `getEffectiveAiProvider`가 명시 `apiKey` opt 전달 (process.env 상태 무관)
- **Admin (ADMIN_EMAILS env)**: 결제 없이 BYOK 효과. 본인 키 입력 OR 서버 env fallback 양쪽 OK. UI에서 "BYOK (관리자)" 표시
- **헤더 위조 방지** — 클라가 `X-Paperis-Keys`/`X-Paperis-Ai-Provider`를 위조해도 서버에서 등급 판정 후 게이트. Free가 Claude 헤더 보내도 Gemini로 강제

### 캐시 / 사용량

- **Upstash Redis silent fallback** — 키 부재 시 모든 호출 캐시 miss, 라우트는 정상 동작
- **캐시 hit은 사용량 카운트 X** — PubMed/AI 호출 비용 0이라 limit 차감 안 함. 사용자 친화적
- **트렌드 캐시는 풀/라이트 분리** — `trend:` (themes 포함) vs `trend-headline:` (한 문장). 홈 카드는 라이트만 쓰고 캐시 hit 시 ~100ms
- **`FEATURE_USAGE_LIMIT` prod 활성 (2026-05-11)** — Free 사용자에게 한도 적용 중
- **yearMonth = KST 기준** — 한국 의사 대상. `lib/usage.ts currentYearMonthKST`
- **lazy reset 파티셔닝** — yearMonth가 키에 포함되어 매달 자동 분리

### 결제 / 등급 게이트

- **BYOK 1회 결제 = 평생 권한** — Toss 일반 결제(`/payments/confirm`). 9,900원. 본인 키 입력 권한 + 무제한
- **Pro 월 구독 = 자동결제** — Toss billingKey 발급 → 매월 KST 자정 cron이 chargeBilling. 4,900원
- **cron WHERE 가드** — `status='active' AND expiresAt <= NOW()`. cancelled는 skip (해지 = expiresAt까지 사용 가능, 자동결제 시도 X)
- **해지 = status='cancelled' + billingKey null** — expiresAt까지 권한 유지. cron이 picksup 안 함
- **orderId prefix 검증** — `byok-{userIdPrefix}-{ts}-{rand}`. 다른 사용자 orderId로 confirm 호출 차단
- **amount 검증** — server PRICING.byokOnce/proMonthly와 일치 강제. 클라 위조 차단

### 멀티 AI provider

- **provider-agnostic 추상화** — `lib/ai/types.ts` `AiProvider` 인터페이스. `generateText`/`generateStream`/`generateJson` + `AiJsonSchema`(표준 JSON Schema) + `ModelTier`(fast/balanced/heavy)
- **provider별 JSON 패턴 차이 흡수** — Gemini responseSchema / Claude tool_use input_schema / OpenAI response_format json_schema strict / Grok = OpenAI 호환
- **Grok = OpenAI SDK + xAI baseURL 재사용** — 별도 SDK 없이 한 구현체로 두 provider
- **getEffectiveAiProvider 등급별 룰** — Free → default 강제, Pro → env 있는 것만, BYOK → 본인 키 강제 (명시 apiKey opt), Admin → env+본인 키 합집합
- **헤더 `X-Paperis-Ai-Provider`** — 클라가 사용자 선호 전달. default와 다를 때만 동봉 (트래픽/캐시 최적)

### TTS / 미디어

- **TTS multi-provider, default Clova + Gemini fallback** — 키 부재 시 자동 강등. `x-tts-degraded-from` 헤더
- **TTS narration only** — dialogue 모드 부활 금지
- **TTS 트랙 한국어 제목** — 한국어 출력일 때만 Flash Lite로 번역. `x-tts-title-ko-b64` 헤더 → IndexedDB `titleKo` 필드. 라이브러리/PlayerBar는 `titleKo ?? title`
- **listTrackMetas cursor 순회** — 메모리 폭주(Chrome STATUS_ACCESS_VIOLATION) 회피. blob은 재생 시점에만 로드
- **PlayerBar 동적 높이** `--player-bar-h` — ResizeObserver. 신규 페이지도 `pb-32` 보존
- **PlayerBar 단일 행** — 모바일에서도 single row. 제목은 marquee로 처리
- **PlayerBar SVG 아이콘** — ⏸/▶/⏮/⏭ 인라인 SVG (iOS 컬러 이모지 박스 회피)
- **SeekBar range thumb 드래그** — `<input type=range>` + 좌우 padding 7px(thumb 반지름)로 progress fill과 thumb 위치 1:1. onChange마다 즉시 onSeek (drag-end 의존 X)
- **Marquee 거리 기반 일정 속도** — 30px/sec, 최소 30초. JS에서 거리 측정 → `--marquee-duration` 주입

### UI / 데이터 흐름

- **호 탐색·트렌드는 명시적 submit** — pending(select 입력) vs committed(fetch 트리거) 상태 분리. 사용자가 연도만 바꾸려는데 즉시 fetch되는 거슬림 회피. Search/Analyze 버튼 우측 정렬 + 항상 accent 색상 (비활성은 opacity로만 표시 — 위치·역할 인지 보존)
- **호 탐색 noise 필터 default ON** — Editorial/Letter/Erratum 등은 substantive paper 아니라 시선 부담. `lib/paper-filter.ts` NOISE_PUBLICATION_TYPES set. 사용자 토글로 모두 보기 가능 (DOI 직접 진입 case 지원)
- **입력 소스 토글은 Long Summary 위 별도 섹션** — Long Summary 안에 두면 "요약만 풀텍스트/초록 토글 가능"한 것처럼 보임. 토글이 요약·TTS 양쪽에 적용된다는 mental model 표시
- **PaperDetailPanel dedupe ref 가드 금지** — Strict Mode mount→cleanup→remount cycle에서 가드가 두 번째 mount 막아 무한 loading. `cancelled` flag + `AbortController`만
- **테마 = class 기반 dark + FOUC inline script + suppressHydrationWarning** — globals.css `@variant dark`. 신규 라우트 wrapping 검증
- **카드 상태 캐시는 pmid 키** — `lib/card-cache.ts` 모듈 단위 Map
- **URL = source of truth** — 검색 `?q&sort&pmid&page`, 저널 `/journal/[issn]?tab=&from=`. JournalPaperList도 `?pmid`로 동기화 (모바일 history)
- **자동 미니요약 default OFF** — 검색 결과 layout shift + Gemini quota 낭비
- **저널 호/주제/트렌드 = 한 번에 받기 + 클라 페이지네이션** — server에서 호 전체(200/100/80건 cap) → JournalPaperList가 OA sort + slice + 스크롤 모두 관리
- **OA 정렬은 전체 결과 단위** (저널 큐레이션) / **페이지 단위** (자연어 검색, server pagination이라 비용)
- **드로어는 createPortal로 body 마운트** — 헤더 backdrop-filter가 fixed 자식의 containing block이 되는 CSS 사양 회피

### 디자인 시스템

- **Fraunces (세리프) + Pretendard (본문)** — 저널명/헤드라인은 `font-serif`, 본문은 default Pretendard (CDN)
- **`paperis-*` Tailwind 토큰** — bg/surface/surface-2/border/text/text-2/text-3/accent/accent-dim/new. `@theme inline`으로 v4 자동 utility 생성
- **다크 + 라이트 양쪽 변환** — zinc 한기 제거. 같은 철학으로 라이트 = 따뜻한 white + 머스타드, 다크 = 프로토타입 그대로
- **paperis-stagger 애니메이션** — 홈 카드 위→아래 순차 등장

### 외부 API quirks

- **PubMed `[ISSN]` 따옴표** — `0028-3878[ISSN]`(따옴표 없음)이 `[Journal]`로 정확. `"..."[ISSN]`은 `[All Fields]` fallback
- **PubMed ERROR 응답** — 200 + `esearchresult.ERROR` 필드로 장애 알림. 우리 코드가 throw → 502 + 친절 메시지 (silent 0건 방지)
- **OpenAlex 임상과 매핑 = subfields** — 26 fields 너무 broad. 250 subfields가 임상과와 매칭. Works `primary_topic.subfield.id` group_by → Sources batch fetch
- **manualSeedJournals 화이트리스트** — OpenAlex topic 분류 노이즈 보완
- **NCBI 장애 자주 발생** — backend 라우팅 실패. 사용자에겐 "PubMed 일시 장애 (NCBI)" 메시지

### 안전 가드

- 매 단계 `npm run build` 통과 + 회귀 체크리스트 수동 검증
- prod deploy는 수동 (`vercel deploy --prod --yes`) — 머지 != 배포
- 외부 의존(Clova/Redis/Toss/NCBI/AI provider) 부재 시 silent 강등 — 라우트 자체는 절대 500 안 남
- **PDF 파서 = unpdf** — pdf-parse는 Turbopack worker 경로 이슈. `next.config.ts` `serverExternalPackages`에서 제거 금지
- **드로어 portal 마운트** — 헤더 backdrop-filter가 부모면 fixed top-0 bottom-X가 헤더 영역에 갇힘. `createPortal(content, document.body)` 필수

---

## 핵심 파일 인덱스 (v3 최종)

```
app/
  layout.tsx                     Provider 중첩 + Fraunces (next/font) + Pretendard (CDN link)
  globals.css                    paperis-* 토큰 + @theme inline + marquee/seek/stagger 키프레임
  page.tsx                       v2 검색 + 홈 카드 시스템
  account/page.tsx               구독 (BYOK/Pro/Admin 라벨) + 사용량 + 정보
  billing/page.tsx               BYOK/Pro 결제 시작
  billing/{success,fail}/        결제 콜백
  onboarding/page.tsx            휴대폰 + 약관
  journal/
    layout.tsx                   /journal/* 공통 헤더 (backdrop-blur)
    page.tsx                     임상과 그리드
    specialty/[id]/page.tsx      임상과별 저널 추천
    [issn]/page.tsx              저널 홈 — 호/주제/트렌드 탭. MarkJournalVisited mount
  legal/{terms,privacy,refund}/  약관·개인정보·환불 (M8에서 사업자 정보 갱신)
  api/
    search summarize summarize/read fulltext pdf tts tts/preview tts/text
    journal/{search,issues,topic,trend,trend-headline}
    account/{onboarding,prefs,usage,subscription}
    billing/{checkout,confirm,issue-billing-key,charge-first}
    cron/recurring-billing       매일 KST 자정 (vercel.json cron: `0 15 * * *`)
    auth/[...nextauth]
components/
  PlayerBar                      single row + SVG + marquee + range thumb + createPortal ScriptPanel
  PlayerProvider                 글로벌 미디어 큐 (queue/currentIndex/play/pause/seek)
  LibraryDrawer (portal)         body 마운트, top-0 bottom-(player-bar-h)
  AudioLibrary                   IndexedDB 트랙 리스트
  SettingsDrawer (portal, 아코디언)  Theme/TTS/AI provider/API Keys/내 임상과/차단/백업
  ContinueListeningCard          IndexedDB 최근 트랙
  MySpecialtiesPicker            칩 carousel
  TrendFeaturedCard              favorites epoch day 로테이션 + 라이트 트렌드 fetch
  MyJournalsNewIssues            favorites + additions + 14일 ● 인디케이터
  UsageBanner                    Free 한도 임박/소진 시 표시
  JournalTabs JournalCard JournalPagination JournalSearchAdder
  IssueExplorer TopicExplorer TrendDigest TrendTtsButton
  JournalPaperList               URL ?pmid 동기화 (모바일 history)
  MySpecialtiesGrid MySpecialtiesEditor SpecialtyJournalsList JournalBlocksManager
  PaperDetailPanel PaperCard MiniSummary ResultsList Pagination
  AuthMenu AuthSessionProvider AccountSyncProvider
  ThemeProvider ApiKeysProvider TtsProviderPreferenceProvider TtsQueueProvider
  MarkJournalVisited             /journal/[issn] 진입 시 lastVisitedAt 기록
  useFetchWithKeys               X-Paperis-Keys + Anon-Id + Ai-Provider 자동 동봉
data/journals.json
auth.ts                          Auth.js v5 + Google + Drizzle (env 부재 시 placeholder)
lib/
  ai/                            types · registry · gemini-provider · claude-provider · openai-provider (Grok 재사용)
  ai-preference                  사용자 provider 선호 (localStorage)
  user-keys                      BYOK 게이트 (admin/byok plan 확인 후 applyUserKeysToEnv)
  admin                          ADMIN_EMAILS 체크
  usage                          checkAndIncrement + getPlan + KST yearMonth + isAdminEmail 우선
  billing                        Toss Payments wrapper (confirm/issueBillingKey/chargeBilling + PRICING)
  journals openalex pubmed       카탈로그 + 메타 + 검색
  trend                          generateJournalTrend (heavy) + generateTrendHeadline (fast, lite)
  summary query-translator gemini  미니 요약 + 검색식 변환 + Gemini 헬퍼
  fulltext/                      unpaywall · openalex · europe-pmc · pmc · s2 · medrxiv · asset-fetcher
  tts/                           Clova/GoogleCloud/Gemini provider + resolveTtsProvider
  audio-library                  idb 기반 CRUD + titleKo 필드
  journal-cache                  Upstash Redis wrapper (silent fallback)
  journal-{favorites,additions,blocks,meta-cache,visits}  localStorage 5종
  specialty-prefs anonymous-id auto-mini-summary
  db/                            Drizzle schema + connection
public/sw.js
types/index.ts                   v2 + v3 공통 + AudioTrack.titleKo
types/next-auth.d.ts             Session.user.id + onboardingDone
vercel.json                      cron 설정 (recurring-billing)
```

---

## 버전 히스토리

| 버전 | 날짜 | 핵심 |
|---|---|---|
| **v3** (master 진화) | 2026-05-08~14 | 저널 큐레이션 + Auth + Neon + 결제 + 멀티 AI provider + 에디토리얼 디자인 + **Phase 2-A 랜딩페이지/i18n + Phase 2-B 영어 서비스 파이프라인**. paperis.vercel.app 라이브 |
| v2.0.4 | 2026-05-04 | 설정 패널 6개 섹션 + Google Cloud TTS + API 키 6종 + X-Paperis-Keys |
| v2.0.3 | 2026-05-04 | 페이지네이션 + 테마(라이트/다크/시스템) + Naver Clova + 검색 안전망 |
| v2.0.2 | 2026-04-30 | PlayerBar 동적 높이 + listTrackMetas + IndexedDB v2 |
| v2.0.1 | 2026-04-29 | 미니 요약 주제 강제 + 풀스크린 디테일 + 풀텍스트 fail 사유 |
| v2.0.0 | 2026-04-29 | 자연어 검색·미니/긴 요약·풀텍스트·TTS·라이브러리. Auth/DB 제거 |
| v1.1.0 | 2026-04-26 | Google OAuth + Neon Postgres + 카트/가중치 동기화 |
| v1.0.3 | 2026-04-25 | PMC 미스매치 + 풀텍스트 재생목록 |
| v1.0.2 | 2026-04-25 | 페이지 번호 + 출퇴근 재생목록 + 키보드 시크 |
| v1.0.1 | 2026-04-25 | 추천 가중치 + OpenAlex enrichment + 결정론적 스코어링 + PMC full-text |
| v1.0.0 (MVP) | 2026-04-24 | PubMed + Gemini 요약/TTS + 연관 학습 + PDF + PWA + Vercel |

---

## v3 진척 상세 (커밋 단위)

### M1·M2 (2026-05-08)

- **M1** TTS default `gemini` → `clova` + `resolveTtsProvider` 가드. `x-tts-degraded-from` 헤더
- **M2** `data/journals.json` + `lib/journals.ts` (GitHub raw + 로컬 fallback) + `lib/openalex.ts` 확장

### M3 (2026-05-08)

- PR1~PR3 저널 큐레이션 풀스택 + JournalPaperList 공통 + Gemini 트렌드 batch
- PR4-1~PR4-4 페이지네이션 + OA 정렬 + 차단 + referrer 추적 + 카탈로그 25개 + 설정 패널
- PR5-1~PR5-3 group_by count + manualSeedJournals + 사용자 추가 + 즐겨찾기 ⭐
- fix: dedupe ref 가드 제거 / 자동 미니요약 default OFF

### M4 (2026-05-09)

- PR1 Auth.js v5 + Drizzle + Neon adapter, AuthMenu(`FEATURE_AUTH` flag)
- PR2 `/onboarding` + `/api/account/onboarding`
- PR3 schema 4 테이블 + 멱등 upsert + `AccountSyncProvider` (debounced 500ms)

### Prod 배포 + M5·M6 (2026-05-09~10)

- **M5** Upstash Redis 캐시 (silent fallback) + 진단 log dev 한정
- **M6** Free 사용량 한도 (`lib/usage.ts` `checkAndIncrement`). `useFetchWithKeys`에 `X-Paperis-Anon-Id` 자동 동봉. KST yearMonth + lazy reset
- **UX** OA 정렬 전체 결과 + 페이지네이션 상하 + smooth scroll top

### M7 (2026-05-11~12)

- PR1 lib/billing.ts (TossApiError/confirmPayment/issueBillingKey/chargeBilling/PRICING) + 약관/개인정보/환불 페이지
- PR2 BYOK 1회 결제 (/api/billing/checkout, confirm, /billing 페이지)
- PR3 Pro 월 구독 (issue-billing-key, charge-first, cron/recurring-billing, vercel.json cron)
- PR4 /account 페이지 + 구독 해지 (status='cancelled', billingKey null)
- PR5 UsageBanner + 한도 초과 CTA에 가격 노출

### 후속 fix + UX 정리 (2026-05-12)

- **NCBI ERROR 안전망** — silent 0건 방지, friendly 메시지
- **back 링크** — /account/onboarding/billing 등 헤더 없는 페이지에 ← 홈으로

### 디자인 시스템 (2026-05-12)

- **Phase 1** Foundation — Fraunces + Pretendard + paperis-* 토큰 + @theme inline + marquee/seek/stagger
- **Phase 2** 홈 + 핵심 컴포넌트 (PlayerBar/Search/Sort/PaperCard 등)
- **Batch 1~4** 저널 탐색 흐름 + 설정/라이브러리/TTS + 페이지 본문 + /legal + 잔류 정리
- 코드베이스 zinc/emerald/red/amber/indigo/violet/sky 토큰 0개 — paperis-* 통일

### 홈 1순위 카드 + UX (2026-05-12~13)

- **ContinueListeningCard / MySpecialtiesPicker / MyJournalsNewIssues** + 즐겨찾기 메타 캐시 (`lib/journal-meta-cache.ts`)
- **저널 카드 ●** "새 호 가능성" 의미로 (14일 휴리스틱). 즐겨찾기는 ★ 별도 마커
- **TTS 한국어 제목 번역** — narration과 병렬, `x-tts-title-ko-b64` 헤더, IndexedDB `titleKo`
- **모바일 history sync** — JournalPaperList selectedPmid를 URL `?pmid` 동기화 + push/replace 정책
- **Settings 아코디언** + BYOK 게이트 (subscription.plan='byok'만 API 키 활성)
- **BYOK 정책 변경** — 키 입력 = BYOK 결제자만. `applyUserKeysToEnv`에 DB 검증 추가
- **TrendFeaturedCard** + 라이트 헤드라인 endpoint (Flash Lite, ~5-10s) + 로딩 상태 명시
- **favorites 매일 로테이션** — KST epoch day % length

### 멀티 AI provider (2026-05-13)

- **Phase A·B** lib/ai/ 추상화 + Gemini/Claude 구현. types · registry · gemini-provider · claude-provider
- **Phase C** UI provider 선택 + 헤더 전송. ApiKeysProvider 4종 키 추가, AiProviderSection (BYOK 게이트)
- **Phase D** 모든 LLM 라우트가 사용자 선택 provider 사용. `getEffectiveAiProvider(req)` + lib 함수 시그니처 확장
- **Phase E** OpenAI + Grok provider (xAI baseURL 재사용)

### Admin + 등급별 권한 (2026-05-13)

- **lib/admin.ts** — `ADMIN_EMAILS` env. `isAdminEmail`/`isCurrentUserAdmin`
- usage/user-keys/registry/subscription 라우트에 admin 통과 분기
- **등급별 권한 명확화** — Free/Pro/BYOK/Admin 분리 룰 코드로 강제. BYOK 본인 키 강제, Pro provider 선택 (env 보유 시), Admin env fallback
- API 응답에 `envProviders` 추가, UI에서 disabled 로직

### 최종 UX 수정 (2026-05-13)

- **PlayerBar SeekBar 드래그·정렬** — onChange 즉시 commit + padding 7px (thumb 위치 1:1)
- **PlayerBar thumb 가림** — h-3→h-4, margin-top 제거 (라이브러리 드로어와 안 겹침)
- **PlayerBar marquee 속도** — 거리 기반 일정 (30px/sec, 최소 30초)
- **헤더 ⚙ SVG 교체** — heroicons cog-6-tooth solid (🎧와 시각 무게 균형)

### Phase 2-A 글로벌 확장 — 랜딩페이지/i18n 인프라 (2026-05-13)

커밋: `4e42a42` (Phase 2-A 본체), `ae1ac52` (회귀 fix + UX)

- **i18n 자체 구현** — `lib/i18n.ts` (Locale 타입, `parseAcceptLanguage` ko 토큰 우선) + `messages/{ko,en}.json`
- **`app/[locale]/`** SSG 랜딩 — Hero/Stats/How/Features/Pricing/LangToggle, paperis-* 토큰 그대로 (다크+라이트)
- **`middleware.ts`** — / 진입 분기. 쿠키 우선 → GeoIP(`x-vercel-ip-country`) → Accept-Language → DEFAULT (en)
  · 한국인 사용자가 영어 우선 브라우저 써도 Accept-Language 토큰에 `ko` 있으면 ko로 (load-bearing)
  · 로그인 사용자는 랜딩 건너뛰고 /app으로
- **URL 구조 = 하이브리드** — 랜딩만 `/[locale]/`, 앱은 `/app` 유지 (v3 라이브 회귀 위험 최소)
- **앱 본체 이동** — `app/page.tsx` → `app/app/page.tsx`. 루트 `app/page.tsx`는 `redirect("/app")` server component fallback
- **내부 "/" 링크 14곳 → "/app"** — 헤더 로고/onboarding redirect/← 홈으로/AuthMenu callbackUrl
- **글로벌 Footer** (`components/Footer.tsx` + `lib/branding.ts`) — `© 2026 {COMPANY_NAME}` placeholder ("Neokuns"). 사업자등록 후 한 줄만 갱신하면 일괄 변경. PlayerBar 높이 (--player-bar-h) 만큼 padding-bottom 보정
- **Feature flag** `NEXT_PUBLIC_FEATURE_LANDING` default 0 — 라이브 회귀 시 즉시 0으로 끄면 / → /app 강제 (기존 동작)
- **회귀 fix 2건** (`ae1ac52`) — TtsQueueBadge/LibraryDrawer가 `router.push("/?...")` 쓰던 곳 → `/app?...` (안 고치면 미들웨어가 가로채 pmid 쿼리 손실)
- **UX 4건** — `/app` 빈 상태 문구 provider 비종속 / SortControl 모바일 가운데 / 드로어 헤더 Audio Library·Settings (Fraunces + accent dot) / 글로벌 Footer

기획·프로토타입: `docs/GLOBAL_EXPANSION_PLAN.md`, `docs/paperis_landing_prototype.html`, `docs/HOME_LAYOUT_SPEC.md`, `docs/RESEARCH_READING_BEHAVIOR_Marketing.md`, `docs/Paperis_home_prototype.html`

### Phase 2-C2 후속 fix — server journal 페이지 + UX 다듬기 (2026-05-14)

커밋: `3542b75` (server journal pages), `deb2cfd` (specialty secondary 숨김 + bullet 정렬), `6d1af97` (trend periodLabel + 홈 카드 순서), `7cda77f` (trend cache v2), `2debc41` (Trends 위치), `feca728` (TrendFeaturedCard locale 명시)

- **server-rendered journal 페이지 3개** (`/journal`, `/journal/specialty/[id]`, `/journal/[issn]`) — `useAppMessages`는 client hook이라 빠뜨렸음. `getServerLocale()` helper 추가 + `getMessages(locale).app` 직접 사용. `journalIndex`/`journalSpecialty`/`journalDetail` 메시지 키. specialty.name도 locale별 분기. 부수효과: `cookies()` 호출로 SSG → Dynamic 전환 (catalog fetch는 여전히 revalidate 3600 캐시)
- **영어 모드에서 specialty 한국어 secondary 숨김** — MySpecialtiesGrid·Editor·specialty/[id] 헤더. 외국 사용자에게 무의미한 한글 표기 제거. 한국어 모드는 영어 nameEn이 secondary로 그대로 표시
- **MiniSummary bullet 수직 가운데 정렬** — `mt-1` 제거 + `items-center` (1px 위로 떠 보이던 시각 fix)
- **server `buildPeriod()` 영어 분기** — trend route 두 곳. 기존 "2026년 Q2 (4–6월)" 한국어 hardcoded → ko/en 분기. en은 "Q2 2026 (Apr–Jun)" / "2026 Annual"
- **trend cache key v2 prefix bump** — Phase 2-B 시점 캐시(영어 키에 한국어 라벨)를 즉시 무효화. `trend-headline:v2:...` / `trend:v2:...`
- **TrendFeaturedCard URL language 명시 + locale 변화 refetch** — 서버 cookie 동기화 미세 타이밍 이슈 회피. `useLocale` + hydrated 가드로 SSR-safe 첫 렌더 후 한 번만 fetch. URL `&language=locale` 명시로 캐시 키 정확 보장
- **홈 카드 순서 최종** — Continue listening → Trends → My specialties → My journals. 트렌드 헤드라인이 시선 잡고 임상과·저널 탐색 도구가 아래

### Phase 2-C2 부수 그룹 i18n 마이그레이션 — 완료 (2026-05-14)

커밋: `d39e69f` (C2-A·B: specialty 관리 + SettingsDrawer), `d1c3487` (C2-C: 계정/결제/온보딩 페이지 5개)

- **메시지 약 250개 추가** — settings(85)/specialtyManage(11)/blocks(4)/specialtyJournals(11)/account(40)/billing(50)/onboarding(20)
- **SettingsDrawer 109줄 한국어 → 0** — 9개 섹션(THEME/TTS provider/voice·speed/auto mini/notify/AI provider/API keys/specialties/blocks/backup) 전체 i18n
- **VoicePreview** — voice prefix(ko-/en-)로 PREVIEW_KO vs PREVIEW_EN 선택 그대로 유지. 미리듣기 버튼/실패 메시지만 m.* 분기
- **specialty name 분기** — MySpecialtiesGrid·MySpecialtiesEditor·JournalBlocksManager가 locale === "en"일 때 nameEn 표시
- **날짜 포맷** — account·billing/success가 `toLocaleDateString(locale === "en" ? "en-US" : "ko-KR")` — Pro 다음 결제일/해지 만료일 모두 locale 맞춤
- **가격 표기** — billing 페이지 BYOK 9,900 / Pro 4,900. 영어 라벨은 "KRW"/"KRW/mo" (Toss 결제 KO 사용자만, Stripe 미도입). Phase 2-D에서 GeoIP/locale 기반 분기 예정

### Phase 2-C1 앱 UI i18n 마이그레이션 — 완료 (2026-05-14)

커밋: `d6b4f24` (인프라+헤더), `dc47cb0` (홈 카드), `09677b1` (검색·디테일), `6f6e591` (TTS·라이브러리), `733af58` (저널 큐레이션+앱 홈)

- **인프라** — `messages/{ko,en}.json`에 `app.*` 네임스페이스. `components/useAppMessages.ts` (useLocale + getMessages 묶음). `lib/i18n.ts fmt()` placeholder 인터폴 헬퍼 (`"about {min} min"` + `{ min: 12 }` 패턴)
- **31개 컴포넌트 + 230+ 메시지 키** — 헤더(3) + 홈 카드(5) + 검색·디테일(8) + TTS·라이브러리(6) + 저널 큐레이션(9) + 앱 홈 헤더
- **specialty.nameEn 분기** — MySpecialtiesPicker가 locale === "en"이면 nameEn 표시 (lib/journals.ts `defaultLocale` 후속 활용은 C2)
- **클라이언트 useLocale 훅 ↔ 서버 getRequestLanguage** — Phase 2-B cookie sync와 자연스럽게 연동. 사용자가 /en에 도착하면 모든 UI/API가 일관되게 영어
- **JournalCard "use client" 전환** — 기존 server-friendly였지만 useAppMessages 훅 필요로 client component로. server pages에서 import 그대로 가능
- **저널 카탈로그 월 이름 i18n** — IssueExplorer가 ko={1월..12월} / en={January..December} 배열로 분기
- **TrendDigest direction 라벨** — `↑ 증가/🆕 신규/⚡ 논쟁/→ 지속` ↔ `↑ Increasing/🆕 New/⚡ Debated/→ Ongoing` locale별
- **남은 한국어**: 설정 드로어 (SettingsDrawer 109줄), 계정/결제/온보딩 페이지, 약관 (legal/*), specialty 관리 UI 4개 — C2/C3

### Phase 2-B 글로벌 확장 — 영어 서비스 파이프라인 (2026-05-14)

커밋: `2fe275e`

- **서버 자동 locale 결정** — `lib/i18n.ts getRequestLanguage(req, body?)`. 우선순위: body.language 명시 > paperis.locale 쿠키 > "ko" fallback. NextRequest cookies + Request raw Cookie 헤더 둘 다 호환.
- **API 라우트 7개 일괄 적용** — `/api/tts`·`/api/tts/preview`·`/api/tts/text`·`/api/summarize`·`/api/summarize/read`·`/api/journal/trend`·`/api/journal/trend-headline`. 기존 `body.language === "en" ? "en" : "ko"` 하드코딩 제거. GET 라우트는 `{ language: searchParams.get("language") }` 형태로 헬퍼에 전달.
- **TTS provider 언어별 default** — `resolveTtsProvider(name, language)` 확장. 사용자가 명시 안 한 경우 `DEFAULT_PROVIDER_BY_LANG`(ko→clova, en→google-cloud). 영어 narration이 한국어 전용 Clova로 가는 미스매치 방지.
- **프롬프트 영어 분기** — 한국어 의학용어 보존 지침(`Preserve precise English medical terms ... inside the target language`)은 영어 출력 시 무의미하므로 제거. 한국어 인사 회피 지침("전공의 여러분", "안녕하세요")은 영어 인사("Hello", "Welcome", "Dear colleagues") 회피로 변환. trend narrationScript 분량 라벨 ("7–10분" ↔ "7–10 minutes"). 영향: `lib/summary.ts systemInstruction`, `lib/gemini.ts readSystemInstruction·narrationSystemInstruction`, `lib/trend.ts trendSystemInstruction·generateTrendHeadline`.
- **클라이언트 useLocale 훅** — `components/useLocale.ts`. document.cookie에서 paperis.locale 추출. SSR-safe (첫 렌더 "ko", useEffect에서 실제 값으로 swap). 사용처: PaperDetailPanel(긴 요약 + TTS), TrendTtsButton(트렌드 narration + appendTrack 메타).
- **클라이언트 하드코딩 제거** — `language: "ko"` 4곳 → `language: locale`. 영어 모드 사용자가 영어 화면에서 호출하면 자동으로 영어 narration·요약을 받게 됨.
- **저널 카탈로그 locale 인프라** — `lib/journals.ts SpecialtyLocaleScope("ko"|"en"|"both")` 타입 + `Specialty.defaultLocale?` optional + `isSpecialtyVisibleForLocale(s, locale)` 헬퍼. 미설정 = "both"로 호환. `data/journals.json` 자체는 변경 없음 — 추후 GitHub web으로 점진 입력. Phase 2-C 온보딩 UI에서 활성.

---

*이 파일은 v3 최종 시점 기준. v1·v2 마일스톤 상세는 `git log` 또는 commit message 본문 참고.*
