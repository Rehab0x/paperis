import type { NextRequest } from "next/server";
import { searchPapers } from "@/lib/pubmed";
import type { NeedFilter, PubmedSearchResponse } from "@/types";

export const runtime = "nodejs";

const ALLOWED_FILTERS: NeedFilter[] = ["treatment", "diagnosis", "trend", "balanced"];

function parseFilter(raw: string | null): NeedFilter {
  if (raw && (ALLOWED_FILTERS as string[]).includes(raw)) {
    return raw as NeedFilter;
  }
  return "balanced";
}

function parseRetmax(raw: string | null): number {
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n)) return 20;
  return Math.min(Math.max(Math.trunc(n), 1), 50);
}

function parseStart(raw: string | null): number {
  const n = raw ? Number(raw) : 0;
  if (!Number.isFinite(n)) return 0;
  // PubMed esearch retstart 상한이 9999. 너무 깊은 페이지는 의미 없음.
  return Math.min(Math.max(Math.trunc(n), 0), 9999);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const query = searchParams.get("q")?.trim() ?? "";
  const filter = parseFilter(searchParams.get("filter"));
  const retmax = parseRetmax(searchParams.get("retmax"));
  const start = parseStart(searchParams.get("start"));

  if (!query) {
    return Response.json(
      { error: "검색어(q)가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const { count, total, papers } = await searchPapers(query, filter, retmax, start);
    const body: PubmedSearchResponse = { count, total, papers };
    return Response.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[api/pubmed]", err);
    return Response.json(
      { error: `논문 검색 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
