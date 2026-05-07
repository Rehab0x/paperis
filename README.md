# Paperis v2

> **From papers to practice** — 바쁜 의료인이 짬짬이 최신 PubMed 연구를 따라갈 수 있게 해주는 서비스. v2는 검색-청취 흐름을 한 번 더 단순화한 새 시작 라인이다.

자연어로 물어보면 PubMed 검색식을 만들어 결과를 가져오고, 카드별 미니 요약과 풀텍스트 자동 추출, 그리고 narration TTS를 붙여 출퇴근 시간에 들을 수 있게 만든다. v2는 로그인·서버 동기화 없이 **로컬 IndexedDB 라이브러리** 한 곳에 트랙을 쌓는다.

---

## v2의 핵심 변경

- **자연어 검색**: 입력을 그대로 Gemini 2.5 Flash Lite에 보내 PubMed 검색식 + 검색 각도 한 줄 설명을 생성. 같은 입력은 서버 LRU + 클라 localStorage 양쪽에서 캐시.
- **정렬 3종**: 최신순 / 인용수순 / 적합도순 라디오. (v1의 4축 가중치 슬라이더는 제거.)
- **미니 요약**: 논문 타입(연구 / 리뷰)별로 강조점이 다른 4–5 bullet. 상위 3개는 자동, 그 외는 클릭.
- **풀텍스트 체인**: DOI → Unpaywall → Europe PMC → PMC efetch → (실패 시) PDF 업로드 슬롯.
- **TTS = narration only**: dialogue 모드 제거. provider 인터페이스로 추상화 — 현재는 Gemini, 나중에 OpenAI/Naver 추가 가능.
- **오디오 라이브러리**: TTS 변환 결과를 IndexedDB에 append만. **자동 재생 X.** 라이브러리에서 트랙을 누르면 그때부터 CD처럼 큐 재생.
- **로그인/DB 제거**: Auth.js / Neon / Drizzle 의존성 모두 제거. 비로그인 anonymous ID만 localStorage에 보관.

---

## 환경변수 (`.env.local`)

```
GEMINI_API_KEY=                  # 필수 (검색·요약 + TTS fallback)
PUBMED_API_KEY=                  # 권장 (없으면 초당 3회 제한)
UNPAYWALL_EMAIL=                 # 권장 (없으면 풀텍스트 체인 1단계 스킵)
NCP_CLOVA_CLIENT_ID=             # 권장 (v3 default TTS — 한국어 자연스러움 우수)
NCP_CLOVA_CLIENT_SECRET=
GOOGLE_CLOUD_TTS_API_KEY=        # 선택 (Neural2/WaveNet, 월 1M자 무료)
```

TTS provider 우선순위: 사용자가 설정 패널에서 선택(또는 default = Clova) → 키 없으면 서버가 자동으로 Gemini TTS로 강등. `.env.example` 참고. `.env.local`은 `.gitignore`로 제외됨.

---

## 실행

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 타입 체크 + 빌드 + 라우트 출력
```

---

## 기술 스택

| 역할 | 도구 |
|---|---|
| 언어 / 프레임워크 | TypeScript (strict), Next.js 16 (App Router, Turbopack) |
| 스타일 | Tailwind CSS v4 (CSS-first, config 파일 없음) |
| 자연어 → 검색식 | Gemini 2.5 Flash Lite + responseSchema |
| 요약 / Narration | Gemini 2.5 Flash (`@google/genai`, streaming) |
| TTS | Naver Clova Voice Premium (default) · Google Cloud TTS Neural2/WaveNet · Gemini TTS (fallback). narration only |
| 논문 데이터 | PubMed E-utilities (esearch + efetch) |
| 인용수 / 저널 메트릭 | OpenAlex Works API |
| 풀텍스트 | Unpaywall · Europe PMC · PMC efetch · unpdf |
| 오디오 저장 | IndexedDB (`idb`) — 라이브러리 = 트랙 store |
| 배포 | Vercel |

---

## 프로젝트 구조

```
app/
  page.tsx              메인: 자연어 검색 + 결과 + 디테일 패널
  library/page.tsx      오디오 라이브러리 (CD 트랙)
  api/
    search/route.ts     자연어 → 검색식 → PubMed → OpenAlex enrichment → 정렬
    summarize/route.ts  미니 요약(JSON, batch)
    summarize/read/...  긴 요약 (스트리밍)
    fulltext/route.ts   체인 오케스트레이션
    pdf/route.ts        업로드 PDF → 텍스트 (서버 저장 X)
    tts/route.ts        narration 생성 + provider.synthesize → audio/wav
components/             SearchBar / SortControl / PaperCard / MiniSummary
                        FullTextView / PdfUpload / TtsButton
                        PaperDetailPanel / PlayerProvider / PlayerBar
                        AudioLibrary / LibraryLink / RegisterSW
lib/
  pubmed.ts openalex.ts xml-utils.ts
  gemini.ts             callWithRetry / friendlyErrorMessage / streamSummary
  query-translator.ts   gemini-2.5-flash-lite, responseSchema
  query-cache.ts        서버 LRU + TTL
  client-cache.ts       localStorage TTL
  paper-type.ts summary.ts
  fulltext/             unpaywall · europe-pmc · pmc · html-extract · index
  tts/                  types · gemini · index (registry)
  audio-library.ts      idb 기반 트랙 CRUD + BroadcastChannel
  anonymous-id.ts
types/index.ts
public/sw.js public/icons/
```

---

## 주의사항

- 임상 의사결정 도구가 아님 — 출판된 논문 검색·요약·청취 도구.
- 유료 논문 풀텍스트는 무단 수집하지 않음. 사용자가 합법적으로 보유한 PDF만 업로드 슬롯에서 추출.
- PubMed E-utilities는 API 키 없이 초당 3회 제한.
- IndexedDB 라이브러리는 브라우저 로컬 저장. 다른 기기와 자동 동기화되지 않음 (v2 의도).
