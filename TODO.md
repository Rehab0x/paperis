# Paperis — TODO / 진척 기록

> 마지막 갱신: 2026-04-26 (v1.1.0 출시 — 로그인/계정 동기화)
> 외부 노출 문서는 [README.md](README.md), 컨텍스트는 [CLAUDE.md](CLAUDE.md). 이 파일은 작업 일지·기술부채 보관용.

---

## 출시 버전

| 버전 | 날짜 | 핵심 |
|---|---|---|
| **v1.1.0** | 2026-04-26 | Google OAuth 로그인 (Auth.js v5), Neon Postgres + Drizzle ORM, 카트/추천 가중치 디바이스 간 동기화, 비로그인 모드는 그대로 |
| v1.0.3 | 2026-04-25 | PMC PMID 미스매치 검증, Open Access 카드 PDF 업로드, 카트 항목 클릭 → 메인 우측 상세, 풀텍스트 기반 재생목록 narration |
| v1.0.2 | 2026-04-25 | 페이지 번호 버튼, 출퇴근 재생목록(장바구니+병렬 짧은 narration+커스텀 트랙 플레이어), 키보드 시크 ←/→/Space, 트랙→PaperCard 모달, 헤더 로고 홈 링크 |
| v1.0.1 | 2026-04-25 | 추천 가중치 슬라이더(최신성/인용수/저널/니즈) + OpenAlex enrichment + 결정론적 스코어링, PMC Open Access full-text 요약, 마스터-디테일 + 카드 캐시, Gemini 503 자동 재시도 |
| v1.0.0 (MVP) | 2026-04-24 | PubMed 검색 + 니즈 필터, Gemini 한국어/영어 스트리밍 요약, Gemini TTS narration / dialogue (멀티스피커, audio/wav), 연관 학습, PDF 업로드(unpdf), PWA 설치, Vercel 배포 |

---

## 완료된 작업

### MVP 1~8단계 (v1.0.0)
- 1단계 PubMed 연동 ([lib/pubmed.ts](lib/pubmed.ts), [app/api/pubmed/route.ts](app/api/pubmed/route.ts), [types/index.ts](types/index.ts))
- 2단계 Gemini 요약 ([lib/gemini.ts](lib/gemini.ts) `streamSummary`, [app/api/summarize/route.ts](app/api/summarize/route.ts))
- 3단계 기본 UI ([components/SearchBar.tsx](components/SearchBar.tsx) / [PaperList.tsx](components/PaperList.tsx) / [PaperCard.tsx](components/PaperCard.tsx))
- 4단계 Gemini TTS ([lib/tts.ts](lib/tts.ts) — `gemini-2.5-flash-preview-tts`, `[A]:`/`[B]:` 정규화, 24kHz mono PCM → WAV 헤더 수동 래핑)
- 5단계 추천 3편 (`recommendPapers` → 이후 v1.0.1에서 결정론적 스코어링으로 교체)
- 6단계 연관 학습 ([app/api/related/route.ts](app/api/related/route.ts) — `MAX_RELATED_DEPTH=2`, excludePmids로 중복 방지)
- 7단계 PDF 업로드 ([components/PdfUpload.tsx](components/PdfUpload.tsx), [app/api/pdf/route.ts](app/api/pdf/route.ts) — unpdf, `Promise.try` 폴리필, `next.config.ts` `serverExternalPackages`)
- 8단계 Vercel 배포 — `paperis.vercel.app`, `GEMINI_API_KEY` Production/Development 등록
- PWA 설치 — manifest.ts + sw.js + 192/512/maskable 아이콘 + RegisterSW
- 안정성 — `callWithRetry` 지수 백오프, `[요약 중단]` 마커 기반 친절한 에러 박스 + 다시 시도 버튼

### v1.0.1 — 추천 시스템 재설계 + Full-text 요약 + 레이아웃
- **추천 시스템 재설계**: Gemini가 픽킹하던 구조를 **결정론적 스코어링**으로 분리
  - [lib/openalex.ts](lib/openalex.ts) — PMID 일괄 enrichment(인용수, `2yr_mean_citedness`)
  - [lib/scoring.ts](lib/scoring.ts) — 4축 점수(최신성/인용수/저널/니즈), 가중치별 정렬
  - [lib/gemini.ts](lib/gemini.ts) `explainRecommendations` — 픽킹 결과에 한국어 한 문장 이유만 생성
  - [components/RecommendWeights.tsx](components/RecommendWeights.tsx) — 4 슬라이더 + localStorage(`paperis.recommend.weights.v1`)
  - 결과: 환각 PMID 위험 사라짐 + 사용자가 "최신/인용/저널/필터" 4축으로 추천을 직접 조절
- **PMC Open Access full-text 요약**:
  - [lib/pmc.ts](lib/pmc.ts) — JATS XML 파싱(fig/table/refs 제거, 30k자 캡, head 70%+tail 25% 트림)
  - [app/api/pmc/route.ts](app/api/pmc/route.ts), [lib/xml-utils.ts](lib/xml-utils.ts) — `pubmed.ts`와 공용
  - `SummarizeInput.sourceLabel` 추가 → 시스템 인스트럭션이 "abstract-only" disclaimer 자동 생략
  - PaperCard 첨부 슬롯 통합: PDF 업로드(closed) / PMC 가져오기(open) 모두 `fullText` 단일 필드
- **마스터-디테일 레이아웃**:
  - URL이 source of truth(`?q&filter&page&pmid`) — 새로고침/공유에도 유지
  - 데스크톱 좌목록 우상세, 모바일은 스택 네비
  - [lib/card-cache.ts](lib/card-cache.ts) — pmid 키 세션 캐시(요약/오디오/연관/첨부 상태 보존)

### v1.1.0 — 로그인 + 디바이스 동기화
- **인증**: Auth.js v5 + Google OAuth + database session ([auth.ts](auth.ts), [app/api/auth/[...nextauth]/route.ts](app/api/auth/%5B...nextauth%5D/route.ts))
  - `session` 콜백에서 `user.id` 명시 매핑 — Drizzle adapter + database session 조합에서 클라이언트로 user.id 전달 보장
- **DB**: Neon Postgres + Drizzle ORM ([lib/db/schema.ts](lib/db/schema.ts), [lib/db/index.ts](lib/db/index.ts), [drizzle.config.ts](drizzle.config.ts))
  - Auth.js 표준 4개 + `user_cart` (unique on user_id+pmid) + `user_weights` (PK user_id)
- **계정 API** ([app/api/account/cart/route.ts](app/api/account/cart/route.ts), [app/api/account/weights/route.ts](app/api/account/weights/route.ts))
  - 카트 PUT은 race-safe **멱등 upsert** (`onConflictDoUpdate` + `notInArray` delete) — Neon HTTP는 statement-level이라 진짜 트랜잭션 X
- **클라이언트 동기화** ([components/AccountSyncProvider.tsx](components/AccountSyncProvider.tsx), [lib/cart.ts](lib/cart.ts), [lib/weights-store.ts](lib/weights-store.ts))
  - 첫 로그인: server↔local 머지 후 한 번 PUT
  - 평상시: subscribeCart/subscribeWeights → 350ms debounce → 서버 PUT
  - `setStoredWeights`는 같은 값이면 dispatch 생략, page subscribe 콜백은 functional update + equality 체크 → 무한 루프 방지
- **헤더 UI** ([components/AuthMenu.tsx](components/AuthMenu.tsx)): 로그인 버튼 / 로그인 후 아바타 드롭다운(이름/이메일/로그아웃)
- 비로그인 모드는 기존 localStorage만 사용해 그대로 동작 — 서버 동기화는 부가 기능

### v1.0.3 — PMC 미스매치 + 풀텍스트 재생목록
- PMC 응답에 `articlePmid`, `articleTitle` 동봉 → 시드 PMID와 다른 본문 감지 + 빨간 경고 + "그래도 사용" / 취소 + PDF 업로드 fallback ([lib/pmc.ts](lib/pmc.ts), [components/PaperCard.tsx](components/PaperCard.tsx))
- Open Access 카드도 PDF 업로드 슬롯 노출
- 장바구니 항목 클릭 → 메인 페이지 우측 상세 (PaperModal 대신 마스터-디테일 통합)
- 재생목록 "본문(full text)으로 narration" 토글 — 카드 캐시 + Open Access 자동 PMC fetch + abstract fallback ([components/CartPanel.tsx](components/CartPanel.tsx))
- `/api/playlist` paper별 `sourceLabels` 배열 수용 → abstract-only disclaimer 자동 제거

### v1.0.2 — 페이지네이션 UX + 출퇴근 재생목록
- 숫자형 페이지네이션 ([components/Pagination.tsx](components/Pagination.tsx)) — `← 1 … 11 [12] 13 … 50 →`
- **출퇴근 재생목록(장바구니 패턴)**:
  - [lib/cart.ts](lib/cart.ts) — localStorage + custom event(같은 탭 컴포넌트 동기화), 최대 10편
  - [components/CartButton.tsx](components/CartButton.tsx) — 카드 헤더 토글
  - [components/CartPanel.tsx](components/CartPanel.tsx) — 슬라이드 오버 + 짧은 모드 체크박스 + 한 번에 생성
  - [app/api/playlist/route.ts](app/api/playlist/route.ts) — `Promise.all` 병렬 narration + TTS, 트랙별 base64 JSON
  - [lib/gemini.ts](lib/gemini.ts) `SummarizeInput.brief` — 1-2분 출퇴근 다이제스트 모드
- **커스텀 플레이어**:
  - [components/PlaylistPlayer.tsx](components/PlaylistPlayer.tsx) — ⏮ ⏭ 트랙 점프, ±10초 시크, 진행바, 트랙 리스트
  - 키보드: ← / → 10초 시크, Space 재생/일시정지 (입력창 포커스 시 무시)
  - "📄 이 논문 보기" → [components/PaperModal.tsx](components/PaperModal.tsx) 풀 PaperCard, ESC로 닫힘
  - 카드 캐시 덕에 모달에서 본 요약이 검색 결과에서도 그대로 보임
- **헤더 UX**: 로고/이름 클릭 → 홈(`/`), SearchBar가 URL prop 변화에 동기화

---

## 다음 후보 (v1.2 ~)

- [ ] **이메일 magic link 로그인**: Resend/SES 등 메일 발신 셋업 후 Auth.js EmailProvider 추가 — Google 외 옵션
- [ ] **청취 진행률 / 들은 트랙 표시**: 같은 큐를 며칠에 나눠 듣기 + 트랙별 lastPosition 서버 저장
- [ ] **트랙 IndexedDB 영속화**: 한 번 만든 재생목록을 새로고침 후에도 유지
- [ ] **백그라운드 청취**: CartPanel 닫아도 audio 유지되는 persistent mini-player
- [ ] **검색/탐색 히스토리** 서버 저장
- [ ] **카드 캐시 서버 저장**: 요약/오디오는 비싸니 디바이스 간 공유

## 기술부채 / 개선 후보 (우선순위 낮음)

- [ ] **키 회전**: 이 대화 로그에 `GEMINI_API_KEY`/Vercel 토큰 노출됨 → 발급처에서 revoke 후 재발급 권장
- [ ] **백그라운드 청취**: CartPanel 닫으면 `<audio>`가 unmount → 재생 정지. 패널 외부에 persistent 플레이어 영역을 두고 패널 닫아도 음악 유지
- [ ] **트랙 길이 제어**: brief=true도 모델 변동에 따라 1.5–3분 범위. 글자수 기반 컷오프 또는 더 강한 프롬프트 제약
- [ ] **PWA 오프라인 지원**: 지금 SW는 설치 가능성만 보장. 홈 shell/정적 페이지 precache 추가 시 오프라인 첫 화면 가능
- [ ] **에러 바운더리**: React error boundary 없음. 런타임 에러 시 화면이 깨짐
- [ ] **모바일 반응형 점검**: 카드 내부 버튼 그룹이 좁은 폭에서 좀 빡빡함
- [ ] **테스트**: 단위 테스트 0개. `lib/pubmed.ts` XML 파서, `lib/scoring.ts` 점수 계산, `lib/pmc.ts` 본문 추출, `[A]:` 정규화 같은 순수 함수부터 추가 가치 높음
- [ ] **OpenAlex enrichment 캐싱**: 가중치 슬라이더 움직일 때마다 매번 OpenAlex 재호출 — 같은 PMID 셋이면 메모리 캐시 또는 Vercel KV
- [ ] **Hobby 플랜 maxDuration 실측**: 대화체 장문 / 5편 이상 playlist에서 timeout 발생 케이스 정리
- [ ] **CSP / 보안 헤더**: `Content-Security-Policy` / `X-Frame-Options`
- [ ] **PubMed rate limit**: 초당 3회 제한 대응 (API 키 없을 때 다중 사용자 대응)
- [ ] **장기 캐시**: 같은 PMID + 같은 옵션으로 요약/오디오 재요청 시 Vercel KV / Blob 등
- [ ] **Gemini TTS 안정판 전환**: `preview` 꼬리표 떨어지면 모델명 업데이트
- [ ] **트랙 IndexedDB 영속화**: 현재는 새로고침하면 트랙 사라짐. 출퇴근에 한 번 만들고 며칠 듣게 하려면 영속화 필요
- [ ] **(선택) GitHub ↔ Vercel 자동 배포**: 현재는 로컬 `vercel deploy --prod` 수동. push 자동 트리거로 전환 + Preview env 추가

---

## 의사결정 기록 (변경 금지 항목)

- **인증 = Auth.js v5 + Google OAuth + Neon Postgres + Drizzle**: 다른 provider/DB 도입은 사용자 재합의 후. session strategy `database`(JWT 아님), session 콜백에서 `user.id` 명시 매핑 필수.
- **카트 PUT 멱등 upsert**: Neon HTTP는 statement-level이라 진짜 트랜잭션 X. delete + insert 패턴 race condition으로 unique 충돌 발생함. `onConflictDoUpdate` + `notInArray` delete만 사용.
- **로그인 무관 동작 보존**: 비로그인 사용자도 모든 기능 그대로 동작. 서버 동기화는 부가 기능.
- **단일 AI 스택**: 요약+TTS 모두 Gemini. Claude / OpenAI SDK 도입 금지. 필요 시 사용자와 재합의 후에만.
- **추천 = 결정론적 + 설명**: 픽킹은 [lib/scoring.ts](lib/scoring.ts) 4축 가중 점수가 담당, Gemini는 [lib/gemini.ts](lib/gemini.ts) `explainRecommendations`로 한 줄 이유만 생성. 환각 PMID 방지 + 사용자가 직접 컨트롤 가능.
- **대화체 태그 포맷**: `[A]:` / `[B]:` 고정. 프롬프트(`lib/gemini.ts`)와 TTS(`lib/tts.ts`) 양쪽이 이 포맷에 묶여 있음 — 바꾸려면 동시에 수정.
- **WAV 헤더 수동 래핑**: Gemini TTS가 24kHz mono PCM을 주고 브라우저는 WAV를 바로 재생. 이 경로 유지.
- **한국어 우선 UI**: 영어 토글은 있지만 기본 UI 문구·에러 메시지는 한국어.
- **PDF 파서는 `unpdf` 사용**: `pdf-parse`는 Turbopack에서 worker 경로 문제로 실패. `pdfjs-dist`는 번들러 개입 시 `Promise.try` 폴리필이 필요. `next.config.ts`의 `serverExternalPackages`에서 제거하지 말 것.
- **재생목록 패턴 = 트랙 분리 (한 파일 X)**: 한 WAV로 합쳐 받으면 트랙 점프·"이 논문 보기"가 어려움. 항상 트랙별 base64로 응답하고 클라이언트가 큐로 다룬다.
- **카드 상태 캐시는 pmid 키**: 검색 결과·추천·연관·playlist 모달 — 어디서 같은 논문을 열어도 동일 캐시 인스턴스. `lib/card-cache.ts` 모듈 단위 Map.
- **URL이 검색 source of truth**: `?q&filter&page&pmid`. SearchBar는 controlled가 아니라 prop 변경 시 useEffect로 동기화.
