// /api/fulltext — 풀텍스트 체인을 오케스트레이션.
// 입력: { pmid, doi?, pmcId? }
// 출력: FullTextResponse (성공: text+source, 실패: attempted[])
//
// Phase C-2에서 requireLogin gate 추가했으나 fulltext 자체는 Unpaywall/EPMC/PMC 등
// 외부 무료 API 호출만 하고 Gemini 비용 없음. 로그인 사용자라도 모바일 Safari에서
// 세션 쿠키 인식 못 하는 케이스가 있어 가드 제거 (2026-05-16). 비용 부담 큰 summarize/
// summarize/read는 여전히 logged-in 전용이라 logout 사용자가 fulltext만 받아도
// 의미 있는 가공은 못 함 — 비용/UX 양쪽 안전.

import { NextResponse } from "next/server";
import { fetchFullText } from "@/lib/fulltext";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { ApiError, FullTextRequest, FullTextResponse } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  await applyUserKeysToEnv(req);
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
