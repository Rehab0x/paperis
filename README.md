# Paperis

> **From papers to practice** — 바쁜 의료인이 짬짬이 최신 PubMed 연구를 따라갈 수 있게 해주는 서비스

[![version](https://img.shields.io/badge/version-1.1.0-blue.svg)](#) 🌐 **Live**: [paperis.vercel.app](https://paperis.vercel.app)

PubMed 검색 결과를 AI가 정리해주고, 출퇴근길에 헤드폰으로 들을 수 있게 한국어 narration 오디오로 만들어주는 웹앱이다. MVP는 **재활의학과(특히 뇌졸중 재활)** 에 초점이 맞춰져 있다.

---

## 주요 기능

### 검색
- **PubMed E-utilities** 직접 호출, 가공 없이 원본 메타데이터 사용
- 니즈 필터 4종: `치료(treatment)` / `진단(diagnosis)` / `동향(trend)` / `균형(balanced)` — 각각 PubMed 검색식으로 변환
- 페이지네이션(20편/페이지). URL이 source of truth라 새로고침·공유에도 검색 상태 유지

### AI 추천 — 결정론적 스코어링 + Gemini 이유 생성
- 4축 스코어를 사용자가 슬라이더로 가중치 조정: **최신성 · 인용수 · 저널 영향력 · 니즈 적합도**
- 인용수와 저널 메트릭은 [OpenAlex](https://openalex.org)에서 일괄 enrichment(무료, API 키 불필요)
- Gemini는 픽킹이 아니라 **이미 골라진 top 3에 대한 한국어 한 문장 이유**만 생성 — 환각 PMID 위험 없음

### 읽기 (한국어/영어 요약)
- Gemini 2.5 Flash 스트리밍 요약. 재활의학 용어(`spasticity`, `FIM`, `Barthel Index`, `CIMT` 등) 영어 원어 보존
- Open Access 논문은 **PMC 전문**을 받아 full-text 요약(JATS XML 파싱, fig/table/refs 제거)
- 유료 논문은 사용자가 보유한 **PDF 업로드** 시 추출 텍스트로 full-text 요약 (서버에 저장 X)

### 듣기 — 출퇴근 재생목록
- **장바구니 패턴**: 카드에서 `+ 담기` → 헤더의 🛒 재생목록에 모음(localStorage 영속)
- 한 번에 모든 논문의 **짧은(1–2분) narration**을 병렬로 합성, 트랙 단위로 분리해 큐 제공
- 커스텀 플레이어: ⏮ ⏭ 트랙 점프, **±10초 시크**, 키보드 단축키(`←`/`→`/`Space`)
- 트랙에서 바로 **📄 이 논문 보기** → 모달로 PaperCard, 거기서 요약/연관학습/PDF 모두 사용 가능
- 한 편 단독 듣기 모드: 카드 안에서 narration(5–10분) 또는 **대화체(멀티스피커)** 합성

### 연결 학습
- 카드의 `이 주제 더 찾아보기` → Gemini가 시드 논문 + 사용자 힌트로 PubMed 검색식 생성 → 연관 5편 인라인
- 깊이 2까지 재귀 탐색, 중복 PMID 자동 제외

### UI/UX
- **마스터-디테일** 레이아웃: 데스크톱은 좌측 목록 · 우측 상세, 모바일은 스택 네비게이션
- **카드별 세션 캐시** (`pmid` 키): 다른 논문 보고 돌아와도 요약·오디오·연관학습 상태 유지
- **PWA 설치 가능**: 매니페스트 + 서비스워커. 모바일 홈 화면에 추가하면 standalone 앱처럼 동작

---

## 기술 스택

| 역할 | 도구 |
|---|---|
| 언어 / 프레임워크 | TypeScript, Next.js 16 (App Router, Turbopack) |
| 스타일 | Tailwind CSS v4 |
| AI 요약 | Gemini 2.5 Flash (`@google/genai`, streaming) |
| TTS | Gemini TTS (`gemini-2.5-flash-preview-tts`, 단일/멀티스피커) |
| 논문 데이터 | PubMed E-utilities (esearch + efetch) |
| 인용수 / 저널 메트릭 | OpenAlex Works API |
| PDF 파싱 | unpdf (pdfjs-dist serverless) |
| 인증 | Auth.js v5 (`next-auth@beta`) + Google OAuth |
| DB | Neon Postgres + Drizzle ORM (`@auth/drizzle-adapter`) |
| 배포 | Vercel |

> 요약과 TTS 모두 **Gemini 단일 스택**. Claude/OpenAI는 채택하지 않음 (의사결정 기록은 [CLAUDE.md](CLAUDE.md) 참고).

---

## API 라우트

| 경로 | 메서드 | 설명 |
|---|---|---|
| `/api/pubmed` | GET | PubMed 검색 (`q`, `filter`, `start`, `retmax`) |
| `/api/recommend` | POST | 4축 가중 스코어링 + Gemini 이유 생성 → 추천 3편 |
| `/api/related` | POST | 시드 논문 + 힌트 → 연관 논문 5편 |
| `/api/summarize` | POST | 한국어/영어 스트리밍 요약 (`mode: read`) |
| `/api/tts` | POST | 한 편 narration / dialogue 합성 (audio/wav) |
| `/api/playlist` | POST | 여러 편 짧은 narration 병렬 합성 (트랙 JSON+base64) |
| `/api/pmc` | GET | Open Access 논문의 PMC 전문 추출 |
| `/api/pdf` | POST | 사용자 업로드 PDF → 텍스트 추출(서버 저장 X) |
| `/api/auth/[...nextauth]` | GET/POST | Auth.js 핸들러 (signin/callback/signout 등) |
| `/api/account/cart` | GET/PUT/POST/DELETE | 로그인 사용자 카트 CRUD |
| `/api/account/weights` | GET/PUT | 로그인 사용자 추천 가중치 |

---

## 시작하기

### 환경변수

`.env.local` (Git 제외) 생성, [.env.example](.env.example) 참고:

```
GEMINI_API_KEY=        # 필수. https://aistudio.google.com 에서 발급
PUBMED_API_KEY=        # 선택. 없어도 동작(초당 3회 제한)

# v1.1+ 로그인/계정 동기화 사용 시 (없으면 비로그인 모드만 동작)
DATABASE_URL=          # Neon Postgres pooled connection string
AUTH_SECRET=           # openssl rand -base64 32
AUTH_GOOGLE_ID=        # Google OAuth Client ID
AUTH_GOOGLE_SECRET=    # Google OAuth Client Secret
```

### 개발 서버

```bash
npm install
npm run dev
```

http://localhost:3000

### 프로덕션 빌드

```bash
npm run build
npm run start
```

### 배포 (Vercel)

```bash
vercel --prod
```

Vercel 프로젝트 설정에 `GEMINI_API_KEY`를 Production env로 등록. `/api/tts`와 `/api/playlist`의 `maxDuration=300`을 활용하려면 Pro 플랜 권장(Hobby는 60–90초 캡).

---

## 프로젝트 구조

```
app/
  page.tsx                메인 화면 (마스터-디테일 + URL state)
  layout.tsx              루트 레이아웃 (PWA 메타, SW 등록)
  manifest.ts             Web App Manifest
  api/
    pubmed/               논문 검색
    recommend/            가중 스코어 + Gemini 이유
    related/              연관 논문
    summarize/            요약 스트리밍
    tts/                  단편 오디오 합성
    playlist/             재생목록 일괄 합성
    pmc/                  PMC 전문 가져오기
    pdf/                  PDF 텍스트 추출
components/
  SearchBar, PaperList, PaperCard, PaperModal
  Pagination, RecommendWeights
  CartButton, CartPanel, PlaylistPlayer
  AudioPlayer, PdfUpload, RegisterSW
lib/
  pubmed.ts, pmc.ts       PubMed/PMC API 클라이언트
  gemini.ts               요약·이유·연관쿼리 생성
  tts.ts                  Gemini TTS + WAV 헤더 래핑
  openalex.ts             인용수/저널 메트릭 enrichment
  scoring.ts              4축 결정론적 스코어링
  cart.ts                 장바구니 (localStorage)
  card-cache.ts           카드별 세션 캐시 (pmid 키)
  xml-utils.ts            PubMed/PMC XML 헬퍼
types/index.ts            공통 타입
public/
  sw.js                   Service Worker
  icons/                  PWA 아이콘 (192/512/maskable)
```

---

## 변경 이력

### v1.1.0 (2026-04-26)
- **Google OAuth 로그인** (Auth.js v5, `@auth/drizzle-adapter`, database session)
- **Neon Postgres** + Drizzle ORM — 4개 표준 Auth 테이블 + `user_cart`, `user_weights`
- 카트와 추천 가중치를 디바이스 간 동기화 — 첫 로그인 시 localStorage → 서버 일회 머지 후 양방향 sync
- 비로그인 사용자는 그대로 localStorage만 사용 (UX 변동 없음)
- 헤더 우측 로그인 버튼 / 로그인 후 아바타 드롭다운(이름/이메일/로그아웃)
- `setStoredWeights` 멱등화 + functional setState로 weights 무한 루프 차단
- `/api/account/cart` PUT은 race-safe 멱등 upsert (Neon HTTP는 트랜잭션 없음)

### v1.0.3 (2026-04-25)
- PMC 응답 PMID 미스매치 검증 — 다른 논문 본문이면 빨간 경고 + "그래도 사용" / 취소
- Open Access 카드에도 PDF 업로드 슬롯 노출 — PMC가 미스매치/실패해도 즉시 우회
- 장바구니 항목 클릭 → PaperCard 모달 (요약/본문/연관 학습 그대로)
- 장바구니에 "본문(full text)으로 narration" 토글 — 카드 캐시 + Open Access 자동 PMC fetch + abstract fallback
- `/api/playlist`가 paper별 `sourceLabels` 배열 수용 → 풀텍스트 기반 narration의 abstract-only disclaimer 제거

### v1.0.2 (2026-04-25)
- 페이지네이션 숫자 버튼 (`[1] [2] [3] …`)
- 출퇴근 재생목록(장바구니 + 짧은 모드 narration 병렬 합성 + 커스텀 트랙 플레이어)
- 키보드 단축키(`←`/`→` 10초 시크, `Space` 재생/일시정지)
- 트랙에서 모달로 PaperCard 점프
- 헤더 로고 클릭 → 홈, SearchBar URL 동기화

### v1.0.1
- 추천 가중치 슬라이더 (최신성/인용수/저널/니즈) + OpenAlex enrichment + 결정론적 스코어링
- PMC Open Access 논문 full-text 요약
- Gemini 503 자동 재시도 + 친절한 에러 메시지
- 마스터-디테일 레이아웃 + 카드별 세션 캐시

### v1.0.0 (MVP)
- PubMed 검색 + 니즈 필터
- Gemini 한국어/영어 스트리밍 요약
- Gemini TTS narration / dialogue (멀티스피커, audio/wav)
- 연관 학습(`이 주제 더 찾아보기`)
- PDF 업로드(unpdf)
- PWA 설치 + Vercel 배포

---

## 주의사항

- 이 앱은 **임상 의사결정 도구가 아니다**. AI 요약은 참고용이며 임상 결정은 원문과 본인 판단으로.
- 유료 논문 본문은 **사용자가 합법적으로 보유한 PDF만** 업로드 대상. 서버에 저장하지 않고 메모리에서 처리 후 폐기.
- PubMed/PMC 데이터의 PMCID 매핑이 어긋나는 드문 케이스가 있음 — 받은 본문이 검색 결과 메타데이터와 다르면 Gemini가 자동으로 알려주는 편.

---

## 문서

- [CLAUDE.md](CLAUDE.md) — 프로젝트 컨텍스트, 코딩 컨벤션, 프롬프트 가이드
- [TODO.md](TODO.md) — MVP 단계별 완료 기록 + 기술부채 목록

---

*Paperis v1.1.0 — 2026.04*
