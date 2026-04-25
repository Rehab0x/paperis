// 결정론적 4축 스코어링: 최신성·인용수·저널 영향력·니즈 적합도
// 모든 축은 0..1로 정규화 후 사용자 가중치를 곱해 합산.

import type {
  EnrichmentData,
  NeedFilter,
  Paper,
  RecommendWeights,
  ScoreBreakdown,
} from "@/types";

const CURRENT_YEAR = new Date().getFullYear();

// 니즈별 PublicationType 가중치. 매칭된 것 중 최댓값을 niche 점수로 사용.
const NICHE_TYPE_WEIGHTS: Record<NeedFilter, Record<string, number>> = {
  treatment: {
    "Randomized Controlled Trial": 1.0,
    "Clinical Trial": 0.9,
    "Multicenter Study": 0.8,
    "Comparative Study": 0.7,
    "Pragmatic Clinical Trial": 0.95,
    "Cohort Study": 0.55,
    "Meta-Analysis": 0.7,
    "Systematic Review": 0.65,
    "Review": 0.35,
    "Case Reports": 0.1,
  },
  diagnosis: {
    "Validation Study": 1.0,
    "Evaluation Study": 0.9,
    "Diagnostic Accuracy Study": 1.0,
    "Cohort Study": 0.7,
    "Cross-Sectional Study": 0.65,
    "Comparative Study": 0.55,
    "Observational Study": 0.55,
    "Review": 0.3,
  },
  trend: {
    "Systematic Review": 1.0,
    "Meta-Analysis": 1.0,
    "Review": 0.7,
    "Practice Guideline": 0.85,
    "Guideline": 0.8,
    "Consensus Development Conference": 0.8,
  },
  balanced: {
    "Randomized Controlled Trial": 0.85,
    "Systematic Review": 0.85,
    "Meta-Analysis": 0.85,
    "Clinical Trial": 0.75,
    "Cohort Study": 0.7,
    "Validation Study": 0.7,
    "Review": 0.55,
    "Observational Study": 0.55,
  },
};

const NICHE_DEFAULT = 0.3;

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function paperYear(paper: Paper, enrichment?: EnrichmentData): number | null {
  if (enrichment?.publicationYear) return enrichment.publicationYear;
  const m = /\b(19|20)\d{2}\b/.exec(paper.year);
  return m ? Number(m[0]) : null;
}

// 최신성: 최근 2년=1.0, 20년 전 이상=0.0, 그 사이 선형
function recencyScore(year: number | null): number {
  if (year === null) return 0;
  const age = CURRENT_YEAR - year;
  if (age <= 2) return 1;
  if (age >= 20) return 0;
  return 1 - (age - 2) / 18;
}

// 인용수: log(1+x) / log(1+max). 배치 내 최댓값으로 정규화하되 최소 분모 보장.
function citationScore(count: number, batchMax: number): number {
  if (count <= 0) return 0;
  const denom = Math.log(1 + Math.max(batchMax, 50));
  return clamp01(Math.log(1 + count) / denom);
}

// 저널 영향력: 2yr_mean_citedness raw / 20 캡(NEJM 급이 ~30, 일반 임상 저널 5-10)
function journalScore(citedness: number | null): number {
  if (citedness === null || citedness <= 0) return 0;
  return clamp01(citedness / 20);
}

// 니즈 적합도: 매칭된 PubType 중 최댓값
function nicheScore(paper: Paper, filter: NeedFilter): number {
  const table = NICHE_TYPE_WEIGHTS[filter];
  if (!table) return NICHE_DEFAULT;
  let max = 0;
  for (const t of paper.publicationTypes) {
    const w = table[t];
    if (typeof w === "number" && w > max) max = w;
  }
  return max > 0 ? max : NICHE_DEFAULT;
}

export interface RankedPaper {
  paper: Paper;
  enrichment: EnrichmentData | undefined;
  score: ScoreBreakdown;
  topFactor: "recency" | "citations" | "journal" | "niche";
}

export function rankPapers(
  papers: Paper[],
  enrichment: Map<string, EnrichmentData>,
  filter: NeedFilter,
  weights: RecommendWeights
): RankedPaper[] {
  if (papers.length === 0) return [];

  // 배치 내 최대 인용수 (정규화용)
  let batchMaxCitations = 0;
  for (const p of papers) {
    const c = enrichment.get(p.pmid)?.citedByCount ?? 0;
    if (c > batchMaxCitations) batchMaxCitations = c;
  }

  const totalWeight =
    Math.max(0, weights.recency) +
    Math.max(0, weights.citations) +
    Math.max(0, weights.journal) +
    Math.max(0, weights.niche);
  const wSum = totalWeight > 0 ? totalWeight : 1;

  const ranked: RankedPaper[] = papers.map((paper) => {
    const enr = enrichment.get(paper.pmid);
    const year = paperYear(paper, enr);
    const r = recencyScore(year);
    const c = citationScore(enr?.citedByCount ?? 0, batchMaxCitations);
    const j = journalScore(enr?.journalCitedness ?? null);
    const n = nicheScore(paper, filter);

    const total =
      (Math.max(0, weights.recency) * r +
        Math.max(0, weights.citations) * c +
        Math.max(0, weights.journal) * j +
        Math.max(0, weights.niche) * n) /
      wSum;

    // 사용자가 가중치를 0으로 둔 축은 "지배 축" 판정에서 제외
    const candidates: [RankedPaper["topFactor"], number, number][] = [
      ["recency", r, weights.recency],
      ["citations", c, weights.citations],
      ["journal", j, weights.journal],
      ["niche", n, weights.niche],
    ];
    const consideredOnly = candidates.filter(([, , w]) => w > 0);
    const topFactor =
      (consideredOnly.length > 0 ? consideredOnly : candidates).reduce(
        (best, cur) => (cur[1] > best[1] ? cur : best)
      )[0];

    return {
      paper,
      enrichment: enr,
      score: { total, recency: r, citations: c, journal: j, niche: n },
      topFactor,
    };
  });

  ranked.sort((a, b) => b.score.total - a.score.total);
  return ranked;
}
