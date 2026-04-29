// /api/fulltext — 풀텍스트 체인을 오케스트레이션.
// 입력: { pmid, doi?, pmcId? }
// 출력: FullTextResponse (성공: text+source, 실패: attempted[])

import { NextResponse } from "next/server";
import { fetchFullText } from "@/lib/fulltext";
import type { ApiError, FullTextRequest, FullTextResponse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: Partial<FullTextRequest>;
  try {
    body = (await req.json()) as Partial<FullTextRequest>;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const pmid = typeof body.pmid === "string" ? body.pmid.trim() : "";
  if (!pmid) {
    return NextResponse.json<ApiError>(
      { error: "pmid가 필요합니다." },
      { status: 400 }
    );
  }
  const doi = typeof body.doi === "string" ? body.doi.trim() : null;
  const pmcId = typeof body.pmcId === "string" ? body.pmcId.trim() : null;

  const result: FullTextResponse = await fetchFullText({ pmid, doi, pmcId });
  return NextResponse.json(result);
}
