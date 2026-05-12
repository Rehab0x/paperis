# Paperis 글로벌 확장 플랜

> v3 한국어 버전 안정화 이후 진행.
> 랜딩페이지 · 영어 서비스 · Stripe 결제 3가지를 동시에 설계.

---

## 0. 전체 로드맵

```
Phase 1 (현재)
  v3 기능 완성 — 저널 큐레이션, 트렌드, 결제(Toss), 로그인

Phase 2 (v3 안정화 후 ~1개월)
  랜딩페이지 구축
  영어 서비스 파이프라인 추가
  Stripe 결제 연동

Phase 3 (Phase 2 완료 후)
  Product Hunt 런칭
  Reddit 홍보 (r/medicine, r/medicalschool, r/Residency)
  국내 의학 커뮤니티 홍보 병행
```

---

## 1. 랜딩페이지

### 구조 변경

```
현재: paperis.vercel.app → 바로 앱
변경: paperis.vercel.app → 랜딩페이지
                         → "시작하기" 클릭 → /app (또는 /ko/app, /en/app)
```

로그인된 사용자는 랜딩페이지를 거치지 않고 바로 /app으로 리다이렉트.

### 언어 감지 및 라우팅

**Next.js i18n 내장 기능 사용**

```javascript
// next.config.js
module.exports = {
  i18n: {
    locales: ['ko', 'en'],
    defaultLocale: 'en',
    localeDetection: true,   // Accept-Language 자동 감지
  }
}
```

URL 구조:
```
paperis.vercel.app        → Accept-Language 기반 자동 리다이렉트
paperis.vercel.app/ko     → 한국어 랜딩
paperis.vercel.app/en     → 영어 랜딩
```

**감지 우선순위**

```
1. URL에 /ko 또는 /en 명시  → 해당 언어
2. 사용자 쿠키 (이전 선택)   → 저장된 언어
3. Accept-Language 헤더     → 브라우저 언어
4. GeoIP (서버 미들웨어)     → KR IP면 /ko, 그 외 /en
5. 기본값                   → /en
```

**미들웨어 구현**

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // 이미 언어 prefix 있으면 패스
  if (pathname.startsWith('/ko') || pathname.startsWith('/en')) return

  // 쿠키 우선
  const saved = req.cookies.get('lang')?.value
  if (saved === 'ko' || saved === 'en') {
    return NextResponse.redirect(new URL(`/${saved}${pathname}`, req.url))
  }

  // Accept-Language
  const acceptLang = req.headers.get('accept-language') || ''
  const isKorean = acceptLang.startsWith('ko')

  // GeoIP (Vercel은 헤더로 제공)
  const country = req.headers.get('x-vercel-ip-country') || ''
  const isKR = country === 'KR'

  const lang = (isKorean || isKR) ? 'ko' : 'en'
  return NextResponse.redirect(new URL(`/${lang}${pathname}`, req.url))
}

export const config = {
  matcher: ['/', '/pricing', '/about'],
}
```

### 랜딩페이지 섹션 구조

```
1. Hero          핵심 가치 한 문장 + CTA
2. Stats         연구 기반 3가지 통계 (신뢰도)
3. How it works  3단계 설명
4. Features      4가지 핵심 기능
5. Pricing       Free / BYOK / Pro
6. CTA           하단 최종 유도
7. Footer        약관, 개인정보, 문의
```

### 한국어 vs 영어 랜딩 카피 차이

| 섹션 | 한국어 | 영어 |
|------|--------|------|
| Hero | "읽을 시간이 없다면, 들으세요" | "Too busy to read papers? Listen instead." |
| 포지셔닝 | 출퇴근, 의국, 레지던트 | Commute, clinic, residency |
| 결제 강조 | Toss Payments · 원화 | Stripe · USD |
| 소셜 프루프 | 국내 의사 사용 후기 | "Used by clinicians in Korea" |
| CTA | 무료로 시작하기 | Start for free |

### 파일 구조

```
app/
  [locale]/
    page.tsx         ← 랜딩페이지 (locale = ko | en)
    app/
      page.tsx       ← 실제 앱 (로그인 후 진입)
  middleware.ts      ← 언어 감지 + 리다이렉트

messages/
  ko.json            ← 한국어 카피
  en.json            ← 영어 카피
```

**라이브러리**: `next-intl` 추천 (Next.js App Router 공식 지원)

---

## 2. 영어 서비스

### 파이프라인 비교

영어 버전은 번역 단계가 없어서 **한국어보다 단순하고 빠르고 저렴**하다.

```
한국어: abstract → 요약 → 번역(KO) → narration(KO) → Clova TTS
영어:   abstract → 요약(EN) → narration(EN) → Google Cloud TTS
```

번역 토큰 비용 없음. API 응답 속도도 더 빠름.

### 변경 필요한 항목

**이미 구현된 것** (추가 작업 없음)
- `language` 파라미터: API 전반에 이미 있음
- Google Cloud TTS: `lib/tts/google-cloud.ts` 이미 등록됨
- OpenAlex 저널 검색: 언어 무관, 그대로 사용

**추가 구현 필요한 것**

```
1. DEFAULT TTS PROVIDER 분기
   language === 'en' → google-cloud
   language === 'ko' → clova

2. 번역 단계 조건부 제거
   generateSummary(text, language)
   → language === 'en'이면 번역 프롬프트 skip

3. 영어 Gemini 프롬프트 튜닝
   한국어 의학 용어 유지 지침 제거
   영어 narration 톤 조정 (conversational, not academic)

4. 영어 온보딩 카피
   UI 텍스트 전체 i18n 처리

5. 영어 저널 카탈로그 기본값
   journals.json에 영어권 사용자 기본 specialties 추가
   (General Practice, Neurology, Cardiology, Orthopedics 등)
```

### 영어 기본 specialties (journals.json 추가)

```json
{
  "specialties": [
    {
      "id": "pm-r",
      "name": "재활의학과",
      "nameEn": "Physical Medicine & Rehabilitation",
      "openAlexFieldId": "fields/2734",
      "defaultLocale": "ko"
    },
    {
      "id": "neurology",
      "name": "신경과",
      "nameEn": "Neurology",
      "openAlexFieldId": "fields/2728",
      "defaultLocale": "both"
    },
    {
      "id": "general-practice",
      "name": "일반의학",
      "nameEn": "General Practice & Family Medicine",
      "openAlexFieldId": "fields/2719",
      "defaultLocale": "en"
    },
    {
      "id": "cardiology",
      "name": "심장내과",
      "nameEn": "Cardiology",
      "openAlexFieldId": "fields/2705",
      "defaultLocale": "both"
    }
  ]
}
```

`defaultLocale` 필드로 온보딩 시 언어에 따라 노출 specialties 필터링.

### 영어 TTS — ElevenLabs 고려

Google Cloud TTS는 품질이 무난하나, 더 자연스러운 narration을 원한다면 ElevenLabs 추가 고려.

| Provider | 한국어 | 영어 | 특징 |
|---------|--------|------|------|
| Clova | ✅ 최상 | ❌ | 한국어 전용 |
| Google Cloud | 보통 | 좋음 | 이미 구현됨 |
| ElevenLabs | ❌ | ✅ 최상 | 가장 자연스러운 영어 |
| Gemini TTS | 보통 | 보통 | 타임아웃 위험 |

v1으로는 Google Cloud로 시작, 반응 보고 ElevenLabs 추가.

---

## 3. Stripe 결제 연동

### 결제 라우팅 전략

```
한국 사용자 (KR)     → Toss Payments (원화, 한국 카드 최적)
해외 사용자 (그 외)  → Stripe (달러, 국제 카드)
```

미들웨어에서 감지한 국가 정보를 클라이언트에 전달 → 결제 버튼 분기.

```typescript
// 국가 기반 결제 provider 결정
function getPaymentProvider(country: string): 'toss' | 'stripe' {
  return country === 'KR' ? 'toss' : 'stripe'
}
```

### Stripe 설정 (한국 사업자)

미국 법인 불필요. 한국 사업자 등록증으로 직접 가입 가능.

```
Stripe 계정 생성
  → 사업자 정보 입력 (한국 사업자등록번호)
  → 결제 수단: USD, EUR, GBP 등 외화 수령
  → 정산: USD → KRW 환전 후 한국 계좌로
```

**환경변수 추가**

```bash
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

### Stripe 구독 플로우

```
해외 사용자 결제 흐름

1. Plan 선택 → /api/billing/stripe/checkout
2. Stripe Checkout Session 생성
3. Stripe 호스팅 결제 페이지로 리다이렉트
4. 결제 완료 → webhook → /api/billing/stripe/webhook
5. DB subscriptions 업데이트
6. /app으로 리다이렉트
```

**BYOK 1회 결제 (Stripe Payment Intent)**

```typescript
// app/api/billing/stripe/checkout/route.ts
const session = await stripe.checkout.sessions.create({
  mode: plan === 'byok' ? 'payment' : 'subscription',
  line_items: [{
    price: plan === 'byok'
      ? process.env.STRIPE_BYOK_PRICE_ID   // $19.99 one-time
      : process.env.STRIPE_PRO_PRICE_ID,   // $7.99/month
    quantity: 1,
  }],
  customer_email: user.email,
  success_url: `${baseUrl}/app?payment=success`,
  cancel_url: `${baseUrl}/pricing`,
  metadata: { userId: user.id, plan },
})
```

**Webhook 처리**

```typescript
// app/api/billing/stripe/webhook/route.ts
switch (event.type) {
  case 'checkout.session.completed':
    // 구독 or BYOK 활성화
    await activateSubscription(userId, plan, stripeCustomerId)
    break
  case 'invoice.payment_failed':
    // 구독 suspended
    await suspendSubscription(userId)
    break
  case 'customer.subscription.deleted':
    // 구독 취소
    await cancelSubscription(userId)
    break
}
```

### DB subscriptions 테이블 확장

```sql
subscriptions (
  user_id,
  status,              -- active / cancelled / suspended
  plan,                -- pro / byok
  expires_at,

  -- Toss (한국)
  toss_customer_key,
  toss_billing_key,

  -- Stripe (해외)
  stripe_customer_id,
  stripe_subscription_id,
  stripe_price_id,

  payment_provider,    -- 'toss' | 'stripe'
  currency,            -- 'KRW' | 'USD'
  created_at,
  updated_at
)
```

### 가격 설정

| 플랜 | 한국 (Toss) | 해외 (Stripe) |
|------|-----------|-------------|
| Free | 무료 | Free |
| BYOK | ₩29,900 1회 | $19.99 one-time |
| Pro | ₩9,900/월 | $7.99/month |

### 영수증 및 세금계산서

- 한국 사용자 (Toss): 사업자 등록 후 세금계산서 발행
- 해외 사용자 (Stripe): Stripe 자동 영수증, 부가세 처리 자동화 (Stripe Tax 활용 가능)

---

## 4. 마케팅 플랜

### 한국 채널

```
의학 커뮤니티
  메디게이트 뉴스, 청년의사 등 의학 미디어
  레지던트 카카오톡 오픈채팅
  의대/의전원 커뮤니티 (에브리타임 등)

학회
  대한재활의학회 소식지/SNS
  학술대회 부스 or 포스터
```

### 영어 채널

**Reddit (가장 중요)**

```
타이밍: Phase 3 시작 시점에 동시 런칭
글 형식: "I'm a physiatrist who couldn't keep up with papers, so I built this"
서브레딧:
  r/medicalschool  (60만+) — 학습 툴 친화적
  r/medicine       (50만+) — 실제 임상의
  r/Residency      (20만+) — 시간 부족 공감
  r/SideProject            — 개발 커뮤니티 소개 (먼저)
```

**Product Hunt**

```
런칭 타이밍: Reddit 반응 본 후 1~2주 후
준비물:
  - 60초 데모 영상
  - 스크린샷 5장
  - tagline: "PubMed briefings you can listen to on your commute"
  - hunter 섭외 (PH 경험자)
```

**Twitter/X 의학 커뮤니티**

```
해시태그: #MedTwitter #MedEd #FOAMed #PointOfCare
계정 운영: 주 2-3회 의학 논문 트렌드 요약 포스팅
           → Paperis 결과물로 콘텐츠 생산 → 자연스러운 홍보
```

### 소셜 프루프 확보 전략

영어 런칭 전에 한국 사용자 testimonial 확보.

```
"Already used by 100+ clinicians in Korea"
의사 사용 후기 2-3개 (익명 가능)
사용 통계 (요약된 논문 수, 생성된 TTS 분량)
```

---

## 5. 신규 파일 구조

```
app/
  [locale]/
    page.tsx               랜딩페이지 (ko/en 자동 분기)
    pricing/page.tsx       요금제 페이지
    app/
      page.tsx             실제 앱 홈
  api/
    billing/
      toss/                (기존) 한국 결제
      stripe/
        checkout/route.ts  Stripe 체크아웃 세션 생성
        webhook/route.ts   Stripe 웹훅 처리
  middleware.ts            언어 감지 + 리다이렉트

messages/
  ko.json                  한국어 카피
  en.json                  영어 카피

lib/
  stripe.ts                Stripe 클라이언트 초기화
  billing.ts               Toss + Stripe 통합 유틸 (확장)
  i18n.ts                  next-intl 설정
```

---

## 6. 환경변수 추가

```bash
# 기존 (Toss)
TOSS_SECRET_KEY=
TOSS_CLIENT_KEY=

# 신규 (Stripe)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_BYOK_PRICE_ID=           # $19.99 one-time product ID
STRIPE_PRO_PRICE_ID=            # $7.99/month price ID

# 신규 (TTS)
ELEVENLABS_API_KEY=             # 영어 narration 고품질 (선택)
```

---

## 7. 구현 순서

```
1단계  next-intl 설치 + i18n 라우팅 설정
2단계  messages/ko.json + messages/en.json 작성
3단계  미들웨어 언어 감지 구현
4단계  랜딩페이지 컴포넌트 구현 (프로토타입 HTML 참고)
5단계  영어 서비스 파이프라인
         - DEFAULT_PROVIDER 분기 (language 기반)
         - 번역 단계 조건부 제거
         - 영어 Gemini 프롬프트 튜닝
6단계  Stripe 결제 연동
         - checkout + webhook 라우트
         - subscriptions 테이블 확장
         - 결제 provider 분기 (KR → Toss, 그 외 → Stripe)
7단계  통합 테스트
         - 한국어 결제 플로우 (Toss)
         - 영어 결제 플로우 (Stripe)
         - 언어 전환 전체 흐름
8단계  Product Hunt + Reddit 런칭 준비
         - 데모 영상 녹화
         - 스크린샷 정리
         - 런칭 글 작성
```

---

## 8. 주의사항

### Stripe 테스트 모드
실서비스 전 반드시 테스트 키로 전체 결제 플로우 검증.
```
테스트 카드: 4242 4242 4242 4242
```

### Webhook 보안
Stripe webhook은 반드시 `stripe.webhooks.constructEvent()`로 서명 검증.
서명 없이 처리하면 위조 이벤트 공격에 취약.

### 환율 리스크
Stripe USD → KRW 정산 시 환율 변동 감안.
월정액 USD 7.99 = 약 10,500~11,500원 (환율에 따라).

### Reddit 자기 홍보 규칙
각 서브레딧의 self-promotion 규칙 사전 확인 필수.
r/medicine은 직접 홍보 글 제한 있음 → "I built" 형식 + 가치 중심 글 작성.

### 개인정보 처리방침 영문판
해외 사용자 대상 서비스 시 GDPR 고려 필요.
영문 Privacy Policy 페이지 필수.
