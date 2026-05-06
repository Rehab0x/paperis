// /api/summarize/read — 디테일 패널용 긴 요약을 SSE 형식으로 스트리밍.
// 클라이언트는 chunk 단위로 받아 Markdown처럼 점진 렌더.

import { friendlyErrorMessage, streamSummary } from "@/lib/gemini";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { Language, Paper, SummarizeReadRequest } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

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
  applyUserKeysToEnv(req);
  let body: Partial<SummarizeReadRequest> & { paper?: unknown };
  try {
    body = (await req.json()) as Partial<SummarizeReadRequest> & {
      paper?: unknown;
    };
  } catch {
    return new Response("요청 본문이 올바른 JSON이 아닙니다.", { status: 400 });
  }
  if (!isPaper(body.paper)) {
    return new Response("paper 필드가 필요합니다.", { status: 400 });
  }
  const language: Language = body.language === "en" ? "en" : "ko";
  const sourceLabel =
    typeof body.sourceLabel === "string" ? body.sourceLabel : undefined;
  // 풀텍스트가 같이 들어오는 경우 abstract 자리에 본문을 주입
  const fullText =
    typeof (body as { fullText?: unknown }).fullText === "string"
      ? ((body as { fullText: string }).fullText as string)
      : null;
  const paper: Paper = fullText
    ? { ...body.paper, abstract: fullText }
    : body.paper;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamSummary({
          paper,
          mode: "read",
          language,
          sourceLabel,
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        const msg = friendlyErrorMessage(err, language);
        controller.enqueue(encoder.encode(`\n\n[요약 오류] ${msg}\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
