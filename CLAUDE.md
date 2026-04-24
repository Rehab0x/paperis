# Paperis — CLAUDE.md

## 프로젝트 개요

**Paperis**는 바쁜 의료인이 짬짬이 최신 연구 지견을 따라갈 수 있게 해주는 서비스다.
PubMed 논문을 자동 검색·가공해서 읽기(요약) 또는 듣기(TTS) 형태로 제공한다.

- 슬로건: "From papers to practice"
- MVP 타겟: 재활의학과 의사 (뇌졸중 재활 특화)
- 향후 확장: 의학 전 분야 → 전 과학 분야

---

## 기술 스택

| 역할 | 기술 |
|------|------|
| 언어 | TypeScript |
| 프레임워크 | Next.js 14 (App Router) |
| 스타일링 | Tailwind CSS |
| AI 요약/가공 | Gemini API (Google, `gemini-2.5-flash`) |
| TTS | Gemini TTS (Google, `gemini-2.5-flash-preview-tts`, 멀티스피커) |
| PDF 파싱 | pdf-parse |
| 논문 데이터 | PubMed E-utilities API (무료) |
| 배포 | Vercel |

---

## 프로젝트 구조

```
paperis/
├── app/
│   ├── page.tsx                  # 메인 홈 화면
│   ├── layout.tsx                # 전체 레이아웃
│   └── api/
│       ├── pubmed/route.ts       # PubMed 검색 API
│       ├── summarize/route.ts    # Gemini 요약 API
│       └── tts/route.ts          # Gemini TTS API
├── components/
│   ├── SearchBar.tsx             # 검색창 + 니즈 필터
│   ├── PaperList.tsx             # 논문 목록
│   ├── PaperCard.tsx             # 논문 카드
│   └── AudioPlayer.tsx           # 오디오 플레이어
├── lib/
│   ├── pubmed.ts                 # PubMed API 함수 모음
│   ├── gemini.ts                 # Gemini API 함수 모음
│   └── tts.ts                    # TTS 함수 모음
├── types/
│   └── index.ts                  # 공통 TypeScript 타입 정의
├── CLAUDE.md                     # 이 파일
└── .env.local                    # API 키 (Git 제외)
```

---

## 환경변수 (.env.local)

```
GEMINI_API_KEY=        # 요약 + TTS 모두 사용
PUBMED_API_KEY=        # 선택사항, 없어도 동작
```

---

## 핵심 기능 명세

### 1. 논문 검색 (PubMed API)
- 자연어 키워드 + 재활의학 특화 필터로 검색
- 인용수 · 저널 임팩트 · 최신성 · 논문유형 기준으로 정렬
- 상위 20개 반환, 그 중 AI 추천 3개 미리 선택

### 2. 니즈 필터 (검색 시 선택)
- `treatment` : 치료·중재 위주
- `diagnosis` : 진단·평가 위주
- `trend` : 최신 연구 동향
- `balanced` : 전체 균형있게

### 3. 논문 접근 레벨
- **Open Access** → Abstract + Full text 전체 요약 가능
- **유료 논문** → Abstract 기반 요약만 제공 + PDF 업로드 유도

### 4. 결과물 생성 (Gemini API)
- **읽기**: 상세 요약 (프로토콜·수치·임상 포인트 포함)
- **듣기 - 내레이션**: 강의 스타일 스크립트 → TTS
- **듣기 - 대화체**: 두 의사의 토론 스타일 스크립트 → TTS
- 언어: 한국어 / 영어 선택

### 5. 연결 학습
- 논문 소비 후 "이 주제 더 찾아보기" 버튼
- 자연어 입력 → AI가 연관 논문 자동 추천

---

## Gemini API 프롬프트 방향

> 모델 기본값: `gemini-2.5-flash` · SDK: `@google/genai` · 스트리밍(`generateContentStream`) 사용

### 읽기용 요약
```
재활의학과 전문의를 위한 임상 중심 요약.
핵심 결과 수치, 프로토콜 세부사항, 임상 적용 포인트, 주의사항 포함.
재활의학 전문 용어 정확히 유지 (spasticity, FIM, Barthel Index, CIMT 등).
```

### 듣기용 - 내레이션
```
의대 교수가 레지던트에게 강의하듯 설명하는 스타일.
흥미로운 포인트와 임상적 의미 중심.
전문 용어는 쉽게 풀어서 설명.
5~10분 분량의 자연스러운 구어체 스크립트.
```

### 듣기용 - 대화체
```
두 명의 재활의학과 의사가 이 논문에 대해 토론하는 스타일.
한 명은 설명하고 한 명은 질문하는 구조.
[A]: / [B]: 형식으로 구분.
5~10분 분량.
```

---

## 코딩 컨벤션

- TypeScript strict 모드 사용
- 컴포넌트: PascalCase (예: `PaperCard.tsx`)
- 함수/변수: camelCase (예: `fetchPapers`)
- API 라우트: Next.js App Router 방식 (`route.ts`)
- 에러 처리: try/catch 필수, 사용자에게 친절한 에러 메시지
- 주석: 한국어로 작성 가능

---

## 개발 우선순위 (MVP)

```
1단계  PubMed API 연동 → 논문 검색 + Abstract 가져오기
2단계  Gemini API 연동 → 한국어 요약 생성
3단계  기본 UI → 검색 + 논문 카드 + 요약 표시
4단계  Gemini TTS 연동 → 음성 생성 + 재생 (내레이션 단일/대화체 멀티스피커)
5단계  니즈 필터 + AI 추천 3개
6단계  연관 주제 연결 학습
7단계  PDF 업로드 처리
8단계  Vercel 배포
```

---

## 주의사항

- `.env.local` 절대 Git에 커밋 금지
- PubMed API 호출 시 초당 3회 이하로 제한 (API 키 없을 때)
- Gemini API 응답은 스트리밍 방식(`generateContentStream`) 사용 (긴 요약문 체감 속도 개선)
- 유료 논문 full text를 무단으로 수집하지 않음 (Abstract만 사용)
- PDF 업로드는 사용자가 합법적으로 보유한 논문만 대상

---

*Paperis CLAUDE.md v0.1 — 2026.04*
