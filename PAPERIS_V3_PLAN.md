# Paperis v3 기획 문서

> Claude Code 작업 시작 전 이 문서를 먼저 읽고 진행할 것.
> 현재 레포: https://github.com/Rehab0x/paperis
> 배포: https://paperis.vercel.app

---

## 0. 현재 상태 (v2.0.4)

- 자연어 입력 → Gemini 2.5 Flash Lite가 PubMed 검색식 생성
- 논문 카드 목록 + 미니 요약 (4–5 bullet)
- TTS narration (Gemini → 텍스트 생성 → provider 합성)
- OA 논문: DOI → Unpaywall → Europe PMC → PMC efetch → PDF 업로드 순서로 풀텍스트
- 인증/DB 없음 — anonymous ID + IndexedDB만 사용
- TTS provider 인터페이스 추상화 완료: `gemini` / `clova` / `google-cloud` 3종 등록

---

## 1. v3를 만드는 이유

v2까지는 자연어 검색 기반이었는데, "뭘 검색해야 할지 모르겠다"는 문제가 있었음.
임상의 입장에서 최신 지견을 따라가려면 **저널 단위 큐레이션**이 필요하다는 결론.

---

## 2. 핵심 기능 — 저널 큐레이션 3가지 진입 방식

### 📅 호(Issue) 탐색
특정 월호 선택 → 해당 호 전체 분석
- 이번 호 경향성 및 특징 (Gemini가 전체 abstract 분석)
- 중요도 top 5 논문 abstract 요약
- 전체 논문 목록 (v2 PaperCard 재사용)
- 개별 논문 → OA면 풀텍스트 → 요약/TTS

### 🏷️ 주제(Topic) 탐색
해당 저널 내 특정 주제 논문 모아보기 (예: spasticity)
- 추천 태그 제공 (재활의학과: spasticity / stroke / gait / dysphagia / CIMT…)
- 자유 입력 가능 → Gemini가 MeSH 변환

### 📈 최근 트렌드
월 지정 없이 최근 6개월~1년 자동 분석
- "이 저널에서 요즘 핫한 주제" 한눈에 파악
- 처음 진입 시 "뭘 봐야 하나" 고민 즉시 해결

---

## 3. 전체 UX 흐름

```
임상과 선택
  └── 저널 선택
        ├── 📅 호 탐색 → 연도/월 선택 → 경향성 + top5 + 목록
        ├── 🏷️ 주제 탐색 → 태그 or 직접 입력 → 관련 논문 목록
        └── 📈 최근 트렌드 → 자동 분석
                          └── (공통) 개별 논문 → OA → 풀텍스트 → 요약/TTS
```

---

## 4. 저널 카탈로그 관리

### 방식: GitHub raw JSON + Next.js revalidate

재배포 없이 업데이트 가능. GitHub 웹에서 파일 직접 편집 → 최대 1시간 후 반영.

```
data/
  journals.json   ← GitHub 웹에서 직접 편집
```

```typescript
// lib/journals.ts
export async function getJournalCatalog() {
  const res = await fetch(
    'https://raw.githubusercontent.com/Rehab0x/paperis/master/data/journals.json',
    { next: { revalidate: 3600 } }
  )
  return res.json()
}
```

### journals.json 구조

저널 목록은 저장하지 않음. **임상과 메타데이터만** 저장.
저널 추천은 OpenAlex API가 런타임에 자동으로 가져옴.

```json
{
  "specialties": [
    {
      "id": "pm-r",
      "name": "재활의학과",
      "nameEn": "Physical Medicine & Rehabilitation",
      "openAlexFieldId": "fields/2734"
    },
    {
      "id": "cardiology",
      "name": "심장내과",
      "nameEn": "Cardiology",
      "openAlexFieldId": "fields/2705"
    },
    {
      "id": "neurology",
      "name": "신경과",
      "nameEn": "Neurology",
      "openAlexFieldId": "fields/2728"
    }
  ]
}
```

임상과 추가 시 OpenAlex field ID만 찾아서 추가하면 됨. 수동 저널 큐레이션 불필요.

---

## 5. 저널 개인화

### 저널 추천 방식

수동 큐레이션 없음. 모든 임상과에 대해 **OpenAlex 자동 상위 10개** 표시.

```
https://api.openalex.org/sources
  ?filter=primary_topic.field.id:{openAlexFieldId}
  &sort=cited_by_count:desc
  &per-page=10
```

IF, 출판사, ISSN을 OpenAlex가 자동으로 채워줌.

### 온보딩 플로우 (최초 1회, 프로필 완성 직후)

**1단계 — 임상과 선택** (복수 선택 가능)

**2단계 — 저널 확인**
- OpenAlex 상위 10개 자동 조회
- 전부 체크된 상태로 표시
- 원하지 않으면 빼거나 검색해서 추가 가능

```
재활의학과 주요 저널이에요.
원하지 않는 저널은 빼도 됩니다.

☑  Archives of PM&R       IF 3.7
☑  PM&R                   IF 2.8
☑  AJPM&R                 IF 2.4
...

+ 저널 직접 추가
```

**3단계 — 완료 → 홈**

### 이후 저널 관리 (설정 페이지)

```
내 저널

재활의학과
  Archives of PM&R    ···
  PM&R                ···

+ 저널 추가
  [🔍 저널 이름으로 검색...]
  → OpenAlex 자동완성 드롭다운
  → 선택 시 ISSN, IF, 출판사 자동 입력
```

### 저장 위치

**Neon Postgres 서버 DB** (IndexedDB 아님)
- 기기 변경, 브라우저 초기화해도 설정 유지
- 병원 PC ↔ 출퇴근 폰 동기화

```sql
user_journal_prefs (
  user_id,
  journal_issn,
  specialty_label,   -- 사용자가 붙이는 라벨
  is_pinned,
  sort_order
)
```

### PubMed 쿼리는 ISSN 기반으로 통일

```
기존: "Arch Phys Med Rehabil"[TA]  ← 오타 위험
변경: "0003-9993"[ISSN]            ← 고유값, 오류 없음
```

---

## 6. 수익화 모델

```
Free   검색 무제한 + 큐레이션/TTS 월 소량 체험
BYOK   1회 결제 → 자기 API 키로 무제한
Pro    월 구독 → API 키 없이 무제한
```

### Free 티어 상세

| 기능 | Free | BYOK | Pro |
|------|------|------|-----|
| 자연어 검색 | ✅ 무제한 | ✅ | ✅ |
| 미니 요약 | ✅ 무제한 | ✅ | ✅ |
| 저널 팔로우/개인화 | ✅ | ✅ | ✅ |
| 저널 큐레이션 실행 | 월 3회 | ✅ | ✅ |
| 트렌드 분석 | 월 3회 | ✅ | ✅ |
| TTS narration | 월 5편 | ✅ | ✅ |
| 풀텍스트 요약 | 월 3편 | ✅ | ✅ |

### BYOK 모델

`applyUserKeysToEnv(req)`가 이미 `route.ts`에 구현되어 있음.
1회 결제 후 설정 페이지에서 자기 Gemini/Clova API 키 입력 → 무제한 사용.
서버 API 비용 소모 없음 → 헤비 유저 자연 유도.

### 사용량 관리 DB

```sql
usage_monthly (
  user_id,
  year_month,       -- '2026-05'
  curation_count,
  tts_count,
  fulltext_count
)
-- 매월 1일 자동 리셋 (Vercel Cron)
```

### 업그레이드 유도 메시지

막히는 순간이 짜증이 아니라 "더 쓰고 싶다"가 되도록.

```
TTS 5편 소진 시:
"이번 달 무료 narration을 모두 사용했어요.
 Pro로 업그레이드하면 무제한으로 들을 수 있어요. →"
```

---

## 7. 로그인 및 온보딩

### 인증: Google OAuth (Auth.js v5 재도입)

v1에서 제거했던 Auth.js + Google OAuth + Neon Postgres 재도입.

### Google OAuth만으로 부족한 이유

Toss Payments 자동결제(빌링) API가 `customerMobilePhone` 필수 요구.
Google OAuth는 이름, 이메일만 제공 — 휴대폰 번호 없음.

### 온보딩 순서

```
Google 로그인
  └── 신규 유저 감지
        └── 프로필 완성 페이지 (1회만)
              ① 휴대폰 번호 입력
              ② 약관 동의
                 ☑ 서비스 이용약관 (필수)
                 ☑ 개인정보 수집·이용 동의 (필수)
                 ☑ 개인정보 제3자 제공 동의 (필수, 결제사)
                 ☐ 마케팅 수신 동의 (선택)
              └── 완료 → 임상과/저널 선택 → 홈
```

### users 테이블

```sql
users (
  id,
  email,              -- Google OAuth
  name,               -- Google OAuth
  image,              -- Google OAuth
  phone,              -- 추가 입력
  terms_agreed_at,
  marketing_agreed,
  onboarding_done,
  created_at
)
```

---

## 8. 결제: Toss Payments

### 자동결제(빌링) 흐름

```
첫 결제: 카드 등록 → billing_key 발급 → DB 저장
매월:    Vercel Cron → 자동결제 → expires_at 갱신
실패:    suspended 상태 → 유저 알림
```

### subscriptions 테이블

```sql
subscriptions (
  user_id,
  status,              -- active / cancelled / suspended
  plan,                -- pro / byok
  expires_at,
  toss_customer_key,
  toss_billing_key
)
```

### 사업자 등록 필요

- 간이과세자로 시작 가능 (연 8천만원 미만)
- 통신판매업 신고 필요
- 개인정보처리방침 페이지 법적 필수
- 세무사 연결 권장

---

## 9. TTS 변경사항

### 현재 구조 (v2.0.4)

```
route.ts
  1단계: Gemini → narration 텍스트 생성
  2단계: provider.synthesize() → 오디오
         gemini / clova / google-cloud 3종 등록 완료
```

### v3 변경

`lib/tts/index.ts`에서:
```typescript
// 변경 전
const DEFAULT_PROVIDER = "gemini";

// 변경 후
const DEFAULT_PROVIDER = "clova";
```

이유:
- Gemini TTS: 느리고 Vercel 함수 타임아웃 빈발
- Clova: 한국어 품질 최상, 빠름, 타임아웃 없음
- Gemini TTS는 API 키 없는 경우의 fallback으로만 유지
- 트렌드 narration처럼 긴 텍스트도 문제없이 처리

---

## 10. 인프라

### 스토리지 역할 분리

| 저장소 | 용도 |
|--------|------|
| **Neon Postgres** | users, user_journal_prefs, subscriptions, usage_monthly |
| **Upstash Redis** | 트렌드/호 분석 결과 캐시 |
| **IndexedDB** | TTS 오디오 캐시 (v2 그대로 유지) |

Vercel KV는 sunset됨 → Upstash Redis로 대체 (Vercel Marketplace 연결).
Neon도 Vercel Marketplace에서 연결 가능.

### 캐싱 전략 (Upstash Redis)

```
캐시 키: trend:{issn}:{yyyy-mm}

과거 호: TTL 없음 (결과 불변)
당월:    TTL 24시간
```

첫 유저가 생성 → 이후 요청은 API 호출 0건.

### API 비용 구조

| API | 비용 |
|-----|------|
| PubMed E-utilities | 무료 |
| OpenAlex | 무료 |
| Gemini 트렌드 분석 | ~$0.01/회 |
| TTS | 가장 비쌈 — 사용자 요청 시에만 생성 |

---

## 11. PubMed 쿼리 패턴

```
호 탐색:   "0003-9993"[ISSN] AND ("2026/04/01"[PDAT] : "2026/04/30"[PDAT])
주제 탐색: "0003-9993"[ISSN] AND spasticity[MeSH Terms]
트렌드:    "0003-9993"[ISSN] AND ("2025/11/01"[PDAT] : "2026/04/30"[PDAT])
```

---

## 12. v3 신규 파일 구조

```
data/
  journals.json               임상과 카탈로그 (GitHub 웹 직접 편집)

app/
  journal/page.tsx            임상과/저널 선택 화면
  journal/[issn]/
    page.tsx                  저널 홈 (트렌드 + 호탐색 + 주제탐색)
    issue/[yyyymm]/page.tsx   호 큐레이션 화면
  onboarding/page.tsx         프로필 완성 + 임상과/저널 선택
  api/
    journal/search/           OpenAlex 저널 검색 (자동완성)
    journal/issues/           호별 논문 목록 + 경향성
    journal/trend/            최근 트렌드 분석
    journal/topic/            주제별 논문 목록
    account/prefs/            저널 개인화 CRUD
    billing/                  Toss Payments 웹훅 + 결제

lib/
  journals.ts                 카탈로그 fetch + 타입
  journal-cache.ts            Upstash Redis 캐시 레이어
  usage.ts                    월별 사용량 체크/증가
  billing.ts                  Toss Payments 유틸
  openalex.ts                 저널 검색 함수 추가 (기존 파일 확장)
```

---

## 13. 환경변수

```bash
# 기존 유지
GEMINI_API_KEY
PUBMED_API_KEY
UNPAYWALL_EMAIL
CLOVA_API_KEY
CLOVA_INVOKE_URL
GOOGLE_CLOUD_TTS_KEY

# v3 신규
DATABASE_URL                   # Neon Postgres
AUTH_SECRET
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
TOSS_SECRET_KEY
TOSS_CLIENT_KEY
```

---

## 14. 구현 순서

```
1단계  lib/tts/index.ts DEFAULT_PROVIDER → "clova" 변경
2단계  data/journals.json 생성 (임상과 메타데이터, ISSN 기반)
3단계  저널 큐레이션 기능 구현
         - OpenAlex 저널 자동 추천 API
         - 호 탐색 (issue)
         - 주제 탐색 (topic)
         - 최근 트렌드 (trend)
4단계  Auth.js + Neon 재도입
         - Google OAuth
         - 온보딩 (전화번호 + 약관)
         - 저널 개인화 (user_journal_prefs)
5단계  Upstash Redis 캐싱 레이어 추가
6단계  Free 사용량 제한 (usage_monthly)
7단계  Toss Payments 빌링 연동
         - BYOK 1회 결제
         - Pro 월 구독
8단계  사업자 등록 완료 후 실결제 오픈
```

---

## 15. 시작 전 체크리스트

- [ ] `DEFAULT_PROVIDER` → `"clova"` 변경
- [ ] Upstash Redis Vercel Marketplace 연결
- [ ] Neon Postgres Vercel Marketplace 확인
- [ ] `data/journals.json` 생성 (임상과 목록 + OpenAlex field ID)
- [ ] CLAUDE.md 업데이트
- [ ] 사업자 등록 + 통신판매업 신고 준비 (별도 진행)
