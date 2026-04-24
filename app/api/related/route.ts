import type { NextRequest } from "next/server";
import { generateRelatedQuery } from "@/lib/gemini";
import { searchPapers } from "@/lib/pubmed";
import type { Paper, RelatedResponse } from "@/types";

export const runtime = "nodejs";

const MAX_RESULTS = 5;
const SEARCH_POOL = 15; // 중복 제외 후에도 5편 확보하기 위해 여유롭게

interface Body {
  paper?: Partial<Paper>;
  hint?: string;
  excludePmids?: string[];
}

function isPaper(obj: unknown): obj is Paper {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return typeof p.pmid === "string" && typeof p.title === "string";
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (!isPaper(body.paper)) {
    return Response.json(
      { error: "paper 객체가 필요합니다 (pmid, title 필수)." },
      { status: 400 }
    );
  }

  const seed = body.paper as Paper;
  const hint = typeof body.hint === "string" ? body.hint.trim() : undefined;
  const excludeSet = new Set<string>([seed.pmid]);
  if (Array.isArray(body.excludePmids)) {
    for (const id of body.excludePmids) {
      if (typeof id === "string") excludeSet.add(id);
    }
  }

  try {
    const { query, note } = await generateRelatedQuery(seed, hint);
    const { papers } = await searchPapers(query, "balanced", SEARCH_POOL);

    const filtered: Paper[] = [];
    for (const p of papers) {
      if (excludeSet.has(p.pmid)) continue;
      filtered.push(p);
      if (filtered.length >= MAX_RESULTS) break;
    }

    const res: RelatedResponse = { query, note, papers: filtered };
    return Response.json(res);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[api/related]", err);
    return Response.json(
      { error: `연관 논문 검색 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
