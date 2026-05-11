// /api/summarize — 미니 요약(batch).
// 단일/다중 모두 같은 라우트로. 호출자가 papers 배열 길이로 결정.

import { NextResponse } from "next/server";
import { friendlyErrorMessage } from "@/lib/gemini";
import { generateMiniSummaries } from "@/lib/summary";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type {
  ApiError,
  Language,
  Paper,
  SummarizeMiniRequest,
  SummarizeMiniResponse,
} from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BATCH = 5;

function isPaper(value: unknown): value is Paper {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.pmid === "string" &&
    typeof v.title === "string" &&
    typeof v.abstract === "string" &&
    Array.isArray(v.publicationTypes)
  );
}

export async function POST(req: Request) {
  await applyUserKeysToEnv(req);
  let body: Partial<SummarizeMiniRequest>;
  try {
    body = (await req.json()) as Partial<SummarizeMiniRequest>;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const incoming = Array.isArray(body.papers) ? body.papers : [];
  const papers = incoming.filter(isPaper).slice(0, MAX_BATCH);
  if (papers.length === 0) {
    return NextResponse.json<ApiError>(
      { error: "요약할 논문이 없습니다." },
      { status: 400 }
    );
  }

  const language: Language = body.language === "en" ? "en" : "ko";

  try {
    const summaries = await generateMiniSummaries(papers, language);
    const payload: SummarizeMiniResponse = { summaries };
    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json<ApiError>(
      { error: friendlyErrorMessage(err, language) },
      { status: 502 }
    );
  }
}
