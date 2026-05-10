# 트렌드 검색 전면 개선 작업 지시서

> Claude Code 작업 전 이 문서를 전부 읽고 시작할 것.
> 관련 파일: `lib/trend.ts`, `app/api/journal/trend/route.ts`, 트렌드 UI 컴포넌트

---

## 배경 및 문제점

현재 트렌드 검색은 3개월/6개월/12개월 rolling window 방식인데 두 가지 문제가 있다.

1. **의미 단위가 없음** — "최근 6개월"은 매번 구간이 달라 캐싱이 비효율적이고,
   사용자 입장에서도 "2025년 상반기 트렌드"처럼 명확한 의미가 없다.

2. **분석 품질이 낮음** — `lib/trend.ts`의 프롬프트가 `headline + bullets(80자 이내)` 구조로
   강제되어 있어, Gemini가 아무리 분석해도 **주제명 나열 수준**의 결과만 나온다.
   방향성(증가/신규/논쟁), 임상 함의, 대표 논문 연결이 전혀 없다.

---

## 변경 범위

1. `lib/trend.ts` — 타입, 스키마, 프롬프트 전면 교체
2. `app/api/journal/trend/route.ts` — 기간 파라미터 방식 변경
3. 트렌드 UI 컴포넌트 — 새 타입에 맞게 렌더링 수정
4. 캐시 키 구조 변경

---

## 1. 기간 단위 변경 (route.ts)

### 기존 → 변경

| 항목 | 기존 | 변경 |
|------|------|------|
| 파라미터 | `months=3\|6\|12` | `year=2025` + `quarter=1\|2\|3\|4\|all` |
| 단위 | Rolling window | 고정 연도/분기 |
| 캐시 전략 | TTL 24h 일괄 | 완료 기간 TTL 없음, 진행 중 TTL 24h |

### 새 파라미터

```
GET /api/journal/trend
  ?issn=0003-9993
  &journalName=Archives of PM&R
  &year=2025          ← 연도 (필수)
  &quarter=all        ← all | 1 | 2 | 3 | 4 (기본값: all)
  &language=ko
```

### buildPeriod 함수 교체

```typescript
function buildPeriod(year: number, quarter: number | "all"): {
  startDate: string   // "2025/01/01"
  endDate: string     // "2025/12/31"
  label: string       // "2025년 연간" | "2025년 Q1"
  isComplete: boolean // 기간이 끝났는지 (캐시 TTL 결정)
}
```

분기별 날짜 범위:
- Q1: 01/01 ~ 03/31
- Q2: 04/01 ~ 06/30
- Q3: 07/01 ~ 09/30
- Q4: 10/01 ~ 12/31
- all: 01/01 ~ 12/31

`isComplete`: 오늘 날짜가 endDate를 지났으면 true.
완료된 기간은 TTL 없이 영구 캐시. 진행 중이면 TTL 24h.

### 캐시 키 변경

```
기존: trend:{issn}:{months}m:{yyyy-mm}:{language}
변경: trend:{issn}:{year}:{quarter}:{language}

예시: trend:0003-9993:2025:all:ko
     trend:0003-9993:2025:Q2:ko
```

---

## 2. JournalTrend 타입 전면 교체 (lib/trend.ts)

### 기존 타입

```typescript
export interface JournalTrend {
  headline: string       // 한 문장
  bullets: string[]      // 5-7개, 각 80자 이내 ← 이게 문제
}
```

### 새 타입

```typescript
export interface TrendTheme {
  topic: string                                          // 주제명 (간결하게)
  direction: "↑ 증가" | "🆕 신규" | "⚡ 논쟁" | "→ 지속"  // 방향성
  insight: string        // 임상적 의미 — WHY it matters (150자 이내)
  representativePmids: string[]  // 대표 논문 PMID 1-2개
}

export interface JournalTrend {
  headline: string            // 이 시기 전체를 관통하는 핵심 한 문장
  themes: TrendTheme[]        // 3-5개 주제별 심층 분석
  methodologyShift: string    // 연구 방법론 변화 (없으면 빈 문자열)
  clinicalImplication: string // 임상의에게 의미하는 바 (2-3문장)
  narrationScript: string     // TTS용 나레이션 스크립트 (전체 흐름을 자연스러운 문장으로)
}
```

---

## 3. Gemini 스키마 교체 (lib/trend.ts)

```typescript
const trendSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    themes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic:    { type: Type.STRING },
          direction: {
            type: Type.STRING,
            enum: ["↑ 증가", "🆕 신규", "⚡ 논쟁", "→ 지속"],
          },
          insight:  { type: Type.STRING },
          representativePmids: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["topic", "direction", "insight", "representativePmids"],
      },
    },
    methodologyShift:    { type: Type.STRING },
    clinicalImplication: { type: Type.STRING },
    narrationScript:     { type: Type.STRING },
  },
  required: [
    "headline", "themes", "methodologyShift",
    "clinicalImplication", "narrationScript"
  ],
  propertyOrdering: [
    "headline", "themes", "methodologyShift",
    "clinicalImplication", "narrationScript"
  ],
}
```

---

## 4. 시스템 프롬프트 교체 (lib/trend.ts)

```typescript
function trendSystemInstruction(
  language: Language,
  journalName: string,
  periodLabel: string,
  paperCount: number
): string {
  return [
    `You are a senior clinical research analyst with deep expertise in rehabilitation medicine.`,
    `Output strictly in ${langLabel(language)}, preserving English medical terms inline`,
    `(e.g. spasticity, FIM, NIHSS, CIMT, FES, PRISMA, RCT, MCID).`,

    `You will analyze ${paperCount} abstracts from "${journalName}" (${periodLabel}) as a single corpus.`,

    `Your task: identify what this journal has been EMPHASIZING during this period —`,
    `NOT a list of individual papers, but THEMATIC TRENDS with clinical meaning.`,

    `For each theme, you MUST specify:`,
    `- direction: is this topic newly emerging (🆕 신규), increasing in volume (↑ 증가),`,
    `  actively debated with conflicting evidence (⚡ 논쟁), or consistently ongoing (→ 지속)?`,
    `- insight: WHY does this matter clinically? What should a busy physiatrist take away?`,
    `  Do NOT just restate the topic. State the implication.`,
    `- representativePmids: 1-2 PMIDs from the corpus that best exemplify this theme.`,
    `  Only use PMIDs that actually appear in the provided abstracts.`,

    `methodologyShift: Note if a new outcome measure, study design, or assessment tool`,
    `is appearing repeatedly (e.g. "여러 연구에서 MCID 기반 반응자 분석 도입 증가").`,
    `Leave empty string if no notable shift.`,

    `clinicalImplication: 2-3 sentences on what a busy clinician should take away`,
    `from this period's literature as a whole.`,

    `narrationScript: Write a natural spoken-word script (NOT bullet points) for TTS narration.`,
    `Structure: brief intro → each theme explained conversationally → closing implication.`,
    `Target length: ${paperCount > 60 ? "7-10분" : "3-5분"} when read aloud at normal pace.`,
    `Tone: senior colleague briefing a busy clinician, not an academic lecture.`,
    `Use Korean sentence flow naturally, embed English terms where standard.`,

    `RULES:`,
    `- 3 to 5 themes only.`,
    `- Be specific. Bad: "뇌졸중 재활 연구 증가". Good: "상지 CIMT 60시간 임계값 검증(↑ 증가)`,
    `  — 5편의 RCT가 반복 검증하며 Modified CIMT 프로토콜 재설계 근거 강화."`,
    `- Do NOT invent themes or PMIDs not in the abstracts.`,
    `- Output valid JSON only, no markdown fences.`,
  ].join(" ")
}
```

---

## 5. userPrompt 개선 (lib/trend.ts)

논문을 시간순으로 정렬해서 입력. 논문 유형 정보도 포함.

```typescript
function userPrompt(papers: Paper[]): string {
  // 최신순 → 시간순으로 뒤집어서 입력 (오래된 것부터 최신 순)
  const sorted = [...papers].reverse()

  const blocks = sorted.slice(0, 80).map((p, i) => {
    const abstract = (p.abstract || "").replace(/\s+/g, " ").trim().slice(0, 800)
    const types = p.publicationTypes.slice(0, 3).join(", ") || "Unknown"
    const pubDate = p.pubDate || ""

    return [
      `[${i + 1}] pmid:${p.pmid}`,
      `date: ${pubDate}`,
      `type: ${types}`,
      `title: ${p.title || "(no title)"}`,
      `abstract: ${abstract || "(empty)"}`,
    ].filter(Boolean).join(" | ")
  })

  return [
    `Analyze these ${sorted.length} abstracts as a corpus. Identify dominant themes and trends.`,
    `Papers are ordered chronologically (oldest first) — note if topics shift over time.`,
    `Return JSON matching the schema exactly.`,
    "",
    blocks.join("\n"),
  ].join("\n")
}
```

---

## 6. TTS 연동

트렌드 분석 시 `narrationScript`가 함께 생성되므로,
별도 Gemini 호출 없이 기존 `/api/tts` 라우트에 바로 넘기면 된다.

### TTS API 호출

```typescript
// 트렌드 TTS 버튼 클릭 시
const response = await fetch("/api/tts", {
  method: "POST",
  body: JSON.stringify({
    text: trend.narrationScript,
    providerName: "clova",   // DEFAULT_PROVIDER
    mode: "narration",
  }),
})
```

### 재생목록 통합

트렌드 narration을 재생목록에 추가할 때 트랙 타입 구분:

```typescript
type PlaylistTrack =
  | { type: "paper"; pmid: string; title: string; audioUrl: string }
  | { type: "trend"; label: string; audioUrl: string }  // 신규
```

재생목록 UI에서 트렌드 트랙은 📊 아이콘으로 구분 표시.

---

## 7. API 응답 타입 변경 (route.ts)

```typescript
interface TrendResponse {
  query: string
  papers: Paper[]
  total: number
  trend: JournalTrend    // 새 타입으로 자동 변경됨
  issn: string
  year: number           // months → year
  quarter: string        // 신규: "all" | "Q1" | "Q2" | "Q3" | "Q4"
  periodLabel: string
  isComplete: boolean    // 신규: 완료 기간 여부 (캐시 TTL 결정)
}
```

---

## 8. 프론트엔드 UI 변경

### 기간 선택 UI

```
기존: [3개월▼] 드롭다운

변경:
  연도: [2023] [2024] [2025]  ← 탭 or 버튼 그룹
  분기: [연간 전체] [Q1] [Q2] [Q3] [Q4]
```

현재 연도 기본 선택. 진행 중인 분기는 활성화, 미래 분기는 비활성화.

### 트렌드 결과 렌더링

```
━━ 2025년 Archives of PM&R 연간 트렌드 ━━

[headline 한 문장]

[▶ 트렌드 브리핑 듣기  약 8분]   ← TTS 버튼
[+ 재생목록에 추가]

themes 목록:
  방향성 아이콘 + topic
  └── insight (임상 의미)
      └── 대표 논문 링크 (representativePmids → 논문 카드 점프)

[methodologyShift] — 있을 때만 표시

[clinicalImplication] — "이번 시기 임상 시사점"
```

### 기존 bullets 렌더링 코드 제거

`trend.bullets.map(...)` 형태의 코드를 찾아서 새 `trend.themes` 구조로 전면 교체.

---

## 9. 작업 순서

```
1. lib/trend.ts
   - JournalTrend, TrendTheme 타입 교체
   - trendSchema 교체
   - trendSystemInstruction 교체
   - userPrompt 개선 (시간순 정렬, 논문 유형 포함)

2. app/api/journal/trend/route.ts
   - 파라미터: months → year + quarter
   - buildPeriod 함수 교체
   - 캐시 키 변경
   - isComplete 기반 TTL 분기 처리
   - TrendResponse 타입 업데이트

3. 트렌드 UI 컴포넌트
   - 기간 선택 UI: 연도 탭 + 분기 버튼
   - 결과 렌더링: bullets → themes 구조로 교체
   - TTS 버튼 추가 (narrationScript 사용)
   - 재생목록 추가 버튼

4. 재생목록 관련
   - PlaylistTrack 타입에 trend 타입 추가
   - 재생목록 UI에 📊 트렌드 트랙 표시
```

---

## 10. 주의사항

- `representativePmids`는 반드시 실제 입력된 abstract의 PMID만 사용.
  Gemini가 없는 PMID를 만들어낼 수 있으므로, 파싱 후 실제 papers 목록과 교차 검증할 것.

```typescript
// 환각 PMID 필터링
const validPmids = new Set(papers.map(p => p.pmid))
for (const theme of parsed.themes) {
  theme.representativePmids = theme.representativePmids.filter(
    pmid => validPmids.has(pmid)
  )
}
```

- `narrationScript` 생성 실패 시 (`""` 반환) TTS 버튼 비활성화 처리.
- 기간이 너무 짧아 논문이 10편 미만이면 트렌드 분석 실행하지 않고 안내 메시지 표시.
