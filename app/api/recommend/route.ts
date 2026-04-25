import type { NextRequest } from "next/server";
import { explainRecommendations, type ExplainCandidate } from "@/lib/gemini";
import { enrichPapers } from "@/lib/openalex";
import { rankPapers } from "@/lib/scoring";
import {
  DEFAULT_RECOMMEND_WEIGHTS,
  type NeedFilter,
  type Paper,
  type Recommendation,
  type RecommendResponse,
  type RecommendWeights,
} from "@/types";

export const runtime = "nodejs";

const ALLOWED_FILTERS: NeedFilter[] = ["treatment", "diagnosis", "trend", "balanced"];
const TOP_N = 3;

interface Body {
  papers?: unknown;
  filter?: NeedFilter;
  weights?: Partial<RecommendWeights>;
}

function isPaper(obj: unknown): obj is Paper {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return (
    typeof p.pmid === "string" &&
    typeof p.title === "string" &&
    typeof p.abstract === "string"
  );
}

function clampWeight(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return 50;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function resolveWeights(raw: Partial<RecommendWeights> | undefined): RecommendWeights {
  return {
    recency: clampWeight(raw?.recency ?? DEFAULT_RECOMMEND_WEIGHTS.recency),
    citations: clampWeight(raw?.citations ?? DEFAULT_RECOMMEND_WEIGHTS.citations),
    journal: clampWeight(raw?.journal ?? DEFAULT_RECOMMEND_WEIGHTS.journal),
    niche: clampWeight(raw?.niche ?? DEFAULT_RECOMMEND_WEIGHTS.niche),
  };
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const papers = Array.isArray(body.papers) ? body.papers.filter(isPaper) : [];
  if (papers.length === 0) {
    return Response.json({ error: "papers 배열이 필요합니다." }, { status: 400 });
  }

  const filter: NeedFilter =
    body.filter && (ALLOWED_FILTERS as string[]).includes(body.filter)
      ? body.filter
      : "balanced";
  const weights = resolveWeights(body.weights);

  try {
    // 1) OpenAlex 일괄 enrichment (실패해도 빈 맵 반환 → 기본값으로 동작)
    const enrichment = await enrichPapers(papers);

    // 2) 결정론적 4축 스코어링
    const ranked = rankPapers(papers, enrichment, filter, weights);
    const top = ranked.slice(0, TOP_N);

    if (top.length === 0) {
      const res: RecommendResponse = { recommendations: [] };
      return Response.json(res);
    }

    // 3) 선택된 top 3에 대해 Gemini가 자연스러운 한국어 이유 생성
    const candidates: ExplainCandidate[] = top.map((r) => ({
      paper: r.paper,
      topFactor: r.topFactor,
      citedByCount: r.enrichment?.citedByCount,
      publicationYear: r.enrichment?.publicationYear ?? null,
      journalName: r.enrichment?.journalName ?? null,
      journalCitedness: r.enrichment?.journalCitedness ?? null,
      scoreTotal: r.score.total,
    }));

    let reasons = new Map<string, string>();
    try {
      reasons = await explainRecommendations(candidates, filter);
    } catch (err) {
      // 이유 생성 실패는 치명적이지 않음 — 기본 문구로 폴백
      console.warn("[api/recommend] reason generation failed", err);
    }

    const recommendations: Recommendation[] = top.map((r) => ({
      pmid: r.paper.pmid,
      reason:
        reasons.get(r.paper.pmid) ??
        defaultReason(r.topFactor, r.enrichment?.citedByCount, r.enrichment?.publicationYear),
      score: r.score,
      topFactor: r.topFactor,
    }));

    const res: RecommendResponse = { recommendations };
    return Response.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[api/recommend]", err);
    return Response.json(
      { error: `추천 생성 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}

function defaultReason(
  factor: "recency" | "citations" | "journal" | "niche",
  citations?: number,
  year?: number | null
): string {
  switch (factor) {
    case "recency":
      return year ? `${year}년 최신 문헌입니다.` : "최근 문헌입니다.";
    case "citations":
      return citations ? `인용 ${citations.toLocaleString()}회로 영향력이 큽니다.` : "인용수가 높은 문헌입니다.";
    case "journal":
      return "주요 저널에 게재된 문헌입니다.";
    case "niche":
      return "선택한 니즈에 잘 맞는 연구 유형입니다.";
  }
}
