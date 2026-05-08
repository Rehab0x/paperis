# Paperis — TODO / 진척 기록

> 마지막 갱신: 2026-05-09 (v3 M1~M4 prod 라이브, paperis.vercel.app)
> 외부 노출 문서는 [README.md](README.md), 컨텍스트는 [CLAUDE.md](CLAUDE.md), v3 로드맵은 [PAPERIS_V3_ROADMAP.md](PAPERIS_V3_ROADMAP.md). 이 파일은 작업 일지·기술부채 보관용.

---

## 현재 상태

- **라이브**: paperis.vercel.app — v3 M1~M4 배포 완료, `FEATURE_JOURNAL=1` + `FEATURE_AUTH=1`
- **GitHub**: Rehab0x/paperis (master), origin과 동기화
- **Vercel**: Pro plan (5분 maxDuration), 수동 배포 (`vercel deploy --prod --yes`)
- **외부 통합**: Neon Postgres · Google OAuth · NCP Clova · Gemini · PubMed/Unpaywall — 모두 prod env 등록 완료
- **데이터**: `data/journals.json` GitHub raw fetch (1h revalidate). 25 임상과, 3개(재활/심장/신경)에 manualSeedJournals 입력

### v3 마일스톤 진척

- M1 ✅ TTS default Clova + Gemini fallback 가드
- M2 ✅ 카탈로그(GitHub raw) + OpenAlex Sources/Works
- M3 ✅ 저널 큐레이션 풀스택 (호/주제/트렌드 + 차단/추가/즐겨찾기 + 페이지네이션 + OA 정렬)
- M4 ✅ Auth.js v5 + Neon + 온보딩 + localStorage↔DB 양방향 동기화
- **M5 다음** — Upstash Redis 캐시 (트렌드/호 분석 첫 호출 후 Gemini 호출 0)
- M6 — Free 사용량 한도 (큐레이션 3 / TTS 5 / 풀텍스트 3 월별)
- M7 — Toss Payments (BYOK 1회 + Pro 구독)
- M8 — 사업자등록 후 라이브 결제 + 푸터 + 환불 정책

---

## 다음 후보 / 기술부채

### v3 마일스톤 (정해진 순서)

- [ ] **M5** Upstash Redis 캐시 (`lib/journal-cache.ts` wrapper, key `trend:{issn}:{yyyy-mm}` / `issue:{issn}:{yyyy-mm}`, 과거 호 ∞ TTL · 당월 24h)
- [ ] **M6** Free 사용량 한도 (`lib/usage.ts` `checkAndIncrement(identityKey, kind, plan)`. anonymous-id 또는 user_id. BYOK 우회. Vercel Cron 매월 1일 reset)
- [ ] **M7** Toss Payments (BYOK 1회 + Pro 빌링키 자동결제 + 웹훅 + 약관/환불 페이지)
- [ ] **M8** 사업자등록 후 `TOSS_LIVE_MODE=1` + 푸터 정보 + 라이브 검증

### 발견된 개선 후보 (우선순위 낮음)

- [ ] **카탈로그 추가 시드** — 정형외과/마취/응급/내과 등 22개 임상과의 manualSeedJournals ISSN 입력
- [ ] **에러 바운더리** — React error boundary 없음. 런타임 에러 시 화면 깨짐
- [ ] **HTML 풀텍스트 정확도** — `@mozilla/readability` 도입 검토 (자체 구현은 일부 publisher에서 정확도 낮음)
- [ ] **TTS narration 길이 제어** — 5분 넘는 케이스에서 Vercel timeout 한계 근접. chunk 단위 progressive 합성 미구현
- [ ] **라이브러리 백업 zip 압축** — 트랙 50편 base64 = 100MB+. 개별 트랙 export 또는 zip 미구현
- [ ] **검색 결과 자동 broadening** — `[MeSH Terms]` 빈 결과 시 fallback 로직 (사용자 수동 재검색)
- [ ] **단위 테스트** — `lib/pubmed.ts` XML 파서, `lib/openalex.ts` group_by 정렬, `lib/account-prefs.ts` 멱등 upsert 등 순수 함수부터
- [ ] **CSP / 보안 헤더** — `Content-Security-Policy` / `X-Frame-Options`
- [ ] **PWA 오프라인 지원** — 홈 shell/정적 페이지 precache
- [ ] **모바일 반응형 점검** — 카드 내부 버튼 그룹이 좁은 폭에서 빡빡
- [ ] **applyUserKeysToEnv race** — Node 단일 프로세스에서 동시 요청 시 process.env 충돌 이론적 가능성. provider별 ctx 인자로 리팩토링 검토 (단일 사용자 환경에선 사실상 무시 가능)
- [ ] **영어 UI 토글** — 한국어 고정 (영어 검색 prompt만 일부 보강됨)
- [ ] **이메일 magic link** — Resend/SES 등 메일 발신 셋업 후 Auth.js EmailProvider 추가 (Google 외 옵션)

### v3에서 일부 해결된 v2 한계

- [x] OpenAlex enrichment 캐싱 — `next: { revalidate: 3600 }` 적용 (M5에서 Redis로 더 강화 예정)
- [x] 인용수순 정렬 페이지 한계 — 호 탐색에서는 OpenAlex enrichment + 페이지 내 정렬로 동작
- [x] 라이브러리 다른 기기 동기화 — v3 M4에서 user_journal_prefs 4 테이블로 임상과·저널만 동기화 (오디오 자체는 여전히 IndexedDB)

---

## 의사결정 기록 (load-bearing — 변경 시 사용자 재합의 필요)

### v3 핵심 정신

- **저널 큐레이션 1순위 진입** — 자연어 검색은 보조. 임상과→저널→호/주제/트렌드 흐름이 메인 (PLAN.md §1)
- **출퇴근 청취 1순위 시나리오** — 모든 흐름이 결국 TTS → IndexedDB 라이브러리 → PlayerBar로 수렴
- **로그인 무관 동작 보존** — 비로그인도 v2 검색 + v3 큐레이션 모두 사용 가능. 사용량 한도는 anonymous-id 기반 (M6)

### 인증 / DB

- **Auth.js v5 + Google OAuth + Neon + Drizzle** — session strategy `database`(JWT 아님), session 콜백에서 `user.id` + `onboardingDone` 명시 매핑
- **사용자 prefs PUT = 멱등 upsert** — Neon HTTP는 statement-level이라 트랜잭션 X. `onConflictDoUpdate` + `notInArray` delete (v1.1 카트 패턴 → v3 user_specialties/blocks/additions/favorites 차용)
- **DB 마이그레이션 = add-only** — drop column 금지. 이전 코드도 새 schema 위에서 동작 보장
- **API 키 = 사용자별 X-Paperis-Keys** — 클라 localStorage → fetch 헤더 → 서버 process.env override. BYOK 결제와 별개로 자기 키 입력 그대로 무제한

### TTS / 미디어

- **TTS multi-provider, default Clova + Gemini fallback** — v2.0.3-4부터 단일 Gemini 깨짐. `lib/tts/index.ts` `resolveTtsProvider`가 키 부재 시 자동 강등
- **TTS narration only** — dialogue 모드 부활 금지. 출퇴근 청취 시나리오 단순화
- **WAV 헤더 수동 래핑 (Gemini)** — 24kHz mono PCM. DataView write `true`(little-endian)
- **TTS provider chunk 분할** — Clova 1900 bytes, Google Cloud 4500 bytes. MP3 byte concat
- **`listTrackMetas` cursor 순회** — 메모리 폭주(Chrome STATUS_ACCESS_VIOLATION) 회피. blob은 재생 시점에만 로드

### UI / 데이터 흐름

- **PaperDetailPanel dedupe ref 가드 금지** — Strict Mode mount→cleanup→remount cycle에서 가드가 두 번째 mount 막아 무한 loading. `cancelled` flag + `AbortController`만
- **PlayerBar 동적 높이** `--player-bar-h` — ResizeObserver 측정. 신규 페이지도 `pb-32` 또는 `pb-[calc(var(--player-bar-h)+...)]`
- **테마 = class 기반 dark + FOUC inline script + suppressHydrationWarning** — globals.css `@variant dark`. 신규 라우트 wrapping 검증
- **카드 상태 캐시는 pmid 키** — `lib/card-cache.ts` 모듈 단위 Map (검색·추천·연관·playlist 모달 공유)
- **URL = source of truth** — 검색 `?q&sort&pmid&page`, 저널 `/journal/[issn]?tab=&from=`. SearchBar는 prop 변경 시 useEffect로 동기화
- **자동 미니요약 default OFF** — 검색 결과 도착 후 layout shift + Gemini quota 낭비. 사용자가 설정에서 토글

### 외부 API quirks

- **PubMed `[ISSN]` 따옴표** — `0028-3878[ISSN]`(따옴표 없음)이 `[Journal]`로 정확 매핑. `"0028-3878"[ISSN]`(따옴표)은 `[All Fields]` fallback돼 노이즈. PDAT는 따옴표 + range
- **OpenAlex 임상과 매핑 = subfields** — 26개 fields는 너무 broad(전체 Medicine 등). 250여 개 subfields가 임상과와 매칭. Sources에 subfield 직접 필터 없어 Works `primary_topic.subfield.id` group_by → Sources batch fetch 우회
- **임상과 추천 정렬 = group_by count desc** — cited_by_count로 정렬하면 JAMA/Lancet이 어느 임상과든 위로. count desc 보존이 자연스러움
- **manualSeedJournals 화이트리스트** — OpenAlex topic 분류 노이즈(Plastic Surgery in PM&R 등) 보완. 카탈로그에서 핵심 저널 ISSN-L 박아둠
- **검색 안전망** — PubMed esearch JSON parse + Gemini control char sanitize + JSON parse 에러 retryable

### 안전 가드

- 매 단계 `npm run build` 통과 + 회귀 체크리스트 수동 검증 (v2 자연어 검색·미니요약·풀텍스트·TTS·라이브러리 흐름)
- prod deploy는 수동 (`vercel deploy --prod --yes`) — 머지 != 배포
- 외부 의존(Clova/Redis/Toss) 부재 시 silent 강등 — 라우트 자체는 절대 500 안 남
- **PDF 파서 = unpdf** — pdf-parse는 Turbopack worker 경로 이슈. `next.config.ts`의 `serverExternalPackages`에서 제거 금지

---

## 핵심 파일 인덱스 (v3 기준)

```
app/
  layout.tsx                     루트 — AuthSession/AccountSync/Theme/ApiKeys/Tts/Player Provider 중첩
  page.tsx                       v2 자연어 검색 + 미니요약 + 디테일 패널. 헤더에 Journal/Library/Settings/Auth 링크
  onboarding/page.tsx            휴대폰 + 약관 (M4 PR2)
  journal/
    layout.tsx                   /journal/* 공통 헤더 (Suspense 가드)
    page.tsx                     임상과 그리드 (server, ISR 1h, MySpecialtiesGrid가 client 분기)
    specialty/[id]/page.tsx      임상과별 시드 + 자동 추천 합치기 → SpecialtyJournalsList
    [issn]/page.tsx              저널 홈 — 탭 분기 + IssueExplorer/TopicExplorer/TrendDigest
  api/
    search · summarize · summarize/read · fulltext · pdf · tts · tts/preview   v2 코어
    journal/search · issues · topic · trend                                    v3 M3
    auth/[...nextauth]                                                         Auth.js v5 catch-all (M4 PR1)
    account/onboarding · prefs                                                 사용자 메타 + prefs CRUD (M4)
auth.ts                          Auth.js v5 + Google OAuth + Drizzle adapter. env 4종 부재 시 placeholder
components/
  AuthMenu · AuthSessionProvider · AccountSyncProvider                  M4 인증·동기화
  JournalEntryLink · JournalCard · JournalTabs · JournalPagination · JournalSearchAdder
  MySpecialtiesGrid · MySpecialtiesEditor · SpecialtyJournalsList · JournalBlocksManager
  IssueExplorer · TopicExplorer · TrendDigest · JournalPaperList
  PaperDetailPanel · PlayerProvider · PlayerBar · LibraryDrawer · AudioLibrary · SettingsDrawer
  ThemeProvider · ApiKeysProvider · TtsProviderPreferenceProvider · TtsQueueProvider
  useFetchWithKeys · useAutoMiniSummary
data/
  journals.json                  임상과 카탈로그 25개 (GitHub raw + 로컬 fallback, 1h revalidate)
lib/
  pubmed · xml-utils · openalex · journals · trend · summary · paper-type
  gemini · query-translator · query-cache · client-cache
  fulltext/ (unpaywall · europe-pmc · pmc · html-extract · index)
  tts/ (types · gemini · clova · google-cloud · index — Clova default + fallback)
  audio-library · anonymous-id · user-keys · promise-polyfill · auto-mini-summary
  specialty-prefs · journal-blocks · journal-additions · journal-favorites    localStorage 4종
  account-prefs                  서버 helper: load/save AccountPrefs (멱등 upsert)
  db/ (schema · index)           Drizzle + Neon. Auth.js 표준 4 + users 확장 + user_specialties/blocks/additions/favorites
public/sw.js                     paperis-v2 cache (정적 자산만, /api/는 무개입)
types/index.ts                   v2 + v3 공통 타입
types/next-auth.d.ts             Session.user.id + onboardingDone 추가 (M4 PR2)
```

---

## 버전 히스토리

| 버전 | 날짜 | 핵심 |
|---|---|---|
| **v3** (master 진화) | 2026-05-08~09 | 저널 큐레이션 + Auth + Neon + 디바이스 동기화. paperis.vercel.app 라이브 |
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

### M1 · M2 (2026-05-08)

- **M1** TTS default `gemini` → `clova` + `resolveTtsProvider`/`hasProviderCredentials` 가드 (`lib/tts/index.ts`). 환경에 Clova 키 없을 때 자동 Gemini 강등 + `x-tts-degraded-from` 응답 헤더
- **M2** `data/journals.json` (재활/심장/신경 3 임상과) + `lib/journals.ts` (GitHub raw + 로컬 fallback) + `lib/openalex.ts` `searchJournalsBySubfield`/`searchJournalsByName`/`getJournalByIssn`

### M3 (2026-05-08)

- **PR1** 임상과 그리드 + 임상과별 저널 추천 + 저널명 자동완성 + 헤더 진입점(`FEATURE_JOURNAL` flag)
- **PR2** 저널 홈(`/journal/[issn]`) + IssueExplorer (year/month picker + master-detail) + `/api/journal/issues`
- **PR3** 주제 탐색 + 트렌드(`lib/trend.ts` Gemini batch JSON) + JournalPaperList 공통 추출 + 탭 분기(`?tab=`)
- **fix (dedupe)** IssueExplorer/TopicExplorer/TrendDigest의 `lastFetchKeyRef` 가드 제거 — Strict Mode 무한 loading
- **PR4-1** 페이지네이션 + Open Access 우선 정렬 토글
- **PR4-2** 임상과별 저널 차단 (`lib/journal-blocks.ts`)
- **PR4-3** referrer 임상과 추적 (`?from=`) + 임상과별 추천 태그
- **PR4-4** 카탈로그 25개 임상과 확장 + 설정 패널 "내 임상과/차단 저널" 관리 (`MySpecialtiesEditor`/`JournalBlocksManager`)
- **PR5-1** 추천 알고리즘 group_by count desc + manualSeedJournals + over-fetch로 차단 자동 보충
- **PR5-2** 사용자 저널 직접 추가 (`JournalSearchAdder` + `lib/journal-additions.ts`)
- **PR5-3** 저널 즐겨찾기 ⭐ + 통합 그리드 상위 정렬 (`lib/journal-favorites.ts`)
- **fix (back-link)** 저널 홈 뒤로 가기를 referrer specialty 페이지로 (3단 breadcrumb)
- **fix (auto-mini)** 자동 미니요약 default OFF + 설정 토글

### M4 (2026-05-09)

- **PR1** Auth.js v5 + Drizzle + Neon adapter, schema(users 확장 + Auth.js 표준 4), AuthMenu(`FEATURE_AUTH` flag), AuthSessionProvider, `/api/auth/[...nextauth]`. env 4종 부재 시 placeholder로 빌드 통과
- **PR2** `/onboarding` 페이지 (휴대폰 normalize + 약관 4개) + `/api/account/onboarding` + AuthMenu의 "프로필 완성" 안내. 강제 redirect 안 함
- **PR3** schema 4 테이블 추가 + `lib/account-prefs.ts` 서버 helper (멱등 upsert + notInArray) + `/api/account/prefs` GET/PUT + `AccountSyncProvider` (첫 로그인 합집합 머지 + debounced 500ms PUT). localStorage 4종(specialty/blocks/additions/favorites) → DB 양방향 동기화

### Prod 배포 (2026-05-09)

- 21 commits push to origin/master + `vercel deploy --prod --yes`
- 스모크 테스트: `/`·`/journal`·`/onboarding` 200 OK + GitHub raw catalog 200 OK
- `paperis.vercel.app` v3 라이브

---

*v1·v2 마일스톤 상세는 `git log` 또는 commit message 본문 참고. 이 파일은 v3 시점 기준으로 정리됨.*
