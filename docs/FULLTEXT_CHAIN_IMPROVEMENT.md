# 풀텍스트 체인 개선 계획

> 현재 OA 논문 접근 커버리지를 높이기 위한 풀텍스트 체인 강화 방안.

---

## 배경 — OA 정책 이해

### OA 유형 4가지

| 유형 | 설명 | 예시 |
|------|------|------|
| **Gold OA** | 저널 자체가 완전 OA. 처음부터 전부 무료. | Annals of Rehabilitation Medicine, JRM |
| **Hybrid OA** | 유료 저널인데 저자가 APC 납부 시 해당 논문만 OA. 같은 호에도 OA/유료 혼재. | Archives of PM&R, PM&R |
| **Embargo OA** | 출판 후 일정 기간(6~12개월) 후 자동 무료 공개. PMC 접근 가능. | 다수 임상 저널 |
| **Green OA** | 저자가 accepted manuscript를 PMC/기관 레포에 직접 업로드. 최종본은 유료여도 이 버전은 무료. | NIH 지원 연구 다수 |

### 최근 중요한 변화 — NIH 정책 강화 (2025년 1월)

NIH 지원 연구의 PMC 등록 의무 기간이 **12개월 → 6개월로 단축**.
재활의학 연구의 상당수가 NIH 지원이므로, 앞으로 PMC 접근 가능 논문이 빠르게 늘어날 예정.

---

## 현재 풀텍스트 체인

```
DOI
  → Unpaywall
  → Europe PMC
  → PMC efetch
  → PDF 직접 업로드
```

---

## 강화된 풀텍스트 체인

```
DOI
  → Unpaywall                (현재)
  → OpenAlex OA URL          (신규 ★ 최우선)
  → Europe PMC               (현재)
  → PMC efetch               (현재)
  → Semantic Scholar         (신규)
  → medRxiv 프리프린트        (신규 — 최종본 아님 UI에 명시 필요)
  → PDF 직접 업로드           (현재)
```

---

## 추가할 소스 상세

### 1. OpenAlex OA URL ★ 가장 빠른 개선

**추가 난이도**: 쉬움 — 추가 API 호출 없음.

OpenAlex를 인용수/메트릭 가져올 때 이미 사용 중인데,
응답에 `open_access.oa_url` 필드가 **이미 포함**되어 있음.
기존 파싱 코드에 해당 필드만 추가하면 즉시 커버리지 향상.

```typescript
// lib/openalex.ts — 기존 응답에서 추가 파싱만 하면 됨
const oaUrl = work.open_access?.oa_url ?? null
const oaStatus = work.open_access?.oa_status ?? null
// oa_status: 'gold' | 'hybrid' | 'bronze' | 'green' | 'closed'
```

### 2. Semantic Scholar

**추가 난이도**: 보통.
무료 API, PDF 직링크 보유.

```
GET https://api.semanticscholar.org/graph/v1/paper/{paperId}
  ?fields=openAccessPdf,externalIds
```

PMID로 조회 가능: `PMID:{pmid}`

```typescript
const res = await fetch(
  `https://api.semanticscholar.org/graph/v1/paper/PMID:${pmid}?fields=openAccessPdf`,
  { headers: { 'x-api-key': process.env.S2_API_KEY ?? '' } }
)
const data = await res.json()
const pdfUrl = data.openAccessPdf?.url ?? null
```

API 키 없이도 동작하나 rate limit 낮음. 무료 API 키 발급 권장.

### 3. medRxiv 프리프린트

**추가 난이도**: 보통.
최종 출판본이 아닌 프리프린트 버전. 내용은 거의 동일하나 UI에 명시 필요.

```
GET https://api.biorxiv.org/details/medrxiv/{doi}/na/json
```

```typescript
const res = await fetch(
  `https://api.biorxiv.org/details/medrxiv/${encodeURIComponent(doi)}/na/json`
)
const data = await res.json()
const pdfUrl = data.collection?.[0]
  ? `https://www.medrxiv.org/content/${data.collection[0].doi}.full.pdf`
  : null
```

⚠️ 풀텍스트 표시 시 "프리프린트 버전 — 최종 출판본과 다를 수 있습니다" 안내 문구 필요.

### 4. CORE.ac.uk

**추가 난이도**: 보통.
OA 레포지토리 통합 검색. DOI 또는 제목으로 조회.

```
GET https://api.core.ac.uk/v3/search/works?q=doi:{doi}
Authorization: Bearer {CORE_API_KEY}
```

무료 API 키 발급 필요: https://core.ac.uk/services/api

---

## 구현 우선순위

```
1순위  OpenAlex OA URL 파싱 추가     — 추가 API 없음, 즉시 효과
2순위  Semantic Scholar             — API 키 발급 후 구현
3순위  medRxiv                      — UI 안내 문구 함께 구현
4순위  CORE.ac.uk                   — 위 세 가지 후 여유될 때
```

---

## 환경변수 추가

```bash
# 신규
S2_API_KEY=          # Semantic Scholar (선택, 없으면 rate limit 낮음)
CORE_API_KEY=        # CORE.ac.uk (선택)
```

---

## 참고 — 시간이 지날수록 자연히 개선되는 것들

- Embargo 만료: 6~12개월 지난 논문들이 순차적으로 PMC에 공개
- NIH 정책 강화: 2025년 1월부터 6개월 의무 등록으로 PMC 논문 빠르게 증가
- 저자 자발적 OA: preprint 업로드, 기관 레포 등록 증가 추세
