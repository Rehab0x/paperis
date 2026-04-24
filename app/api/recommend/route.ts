import type { NextRequest } from "next/server";
import { recommendPapers } from "@/lib/gemini";
import type {
  NeedFilter,
  Paper,
  RecommendResponse,
} from "@/types";

export const runtime = "nodejs";

const ALLOWED_FILTERS: NeedFilter[] = ["treatment", "diagnosis", "trend", "balanced"];

interface Body {
  papers?: unknown;
  filter?: NeedFilter;
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

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const papers = Array.isArray(body.papers) ? body.papers.filter(isPaper) : [];
  if (papers.length === 0) {
    return Response.json(
      { error: "papers 배열이 필요합니다." },
      { status: 400 }
    );
  }

  const filter: NeedFilter =
    body.filter && (ALLOWED_FILTERS as string[]).includes(body.filter)
      ? body.filter
      : "balanced";

  try {
    const recommendations = await recommendPapers(papers, filter);
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
