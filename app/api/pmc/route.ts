import type { NextRequest } from "next/server";
import { fetchPmcFullText, trimPmcText } from "@/lib/pmc";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const pmcId = request.nextUrl.searchParams.get("pmcId")?.trim();
  if (!pmcId) {
    return Response.json(
      { error: "pmcId 쿼리 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  try {
    const result = await fetchPmcFullText(pmcId);
    const trimmed = trimPmcText(result.text);
    return Response.json({
      pmcId: result.pmcId,
      text: trimmed,
      chars: trimmed.length,
      originalChars: result.chars,
      articlePmid: result.articlePmid,
      articleTitle: result.articleTitle,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[api/pmc]", err);
    return Response.json(
      { error: `PMC 본문을 가져오지 못했습니다: ${message}` },
      { status: 502 }
    );
  }
}
