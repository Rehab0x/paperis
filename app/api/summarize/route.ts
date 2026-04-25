import type { NextRequest } from "next/server";
import { streamSummary, type SummaryMode } from "@/lib/gemini";
import type { Language, Paper } from "@/types";

export const runtime = "nodejs";

const ALLOWED_MODES: SummaryMode[] = ["read", "narration", "dialogue"];
const ALLOWED_LANGS: Language[] = ["ko", "en"];

interface RequestBody {
  paper?: Partial<Paper>;
  mode?: SummaryMode;
  language?: Language;
  sourceLabel?: string;
}

function isPaper(obj: unknown): obj is Paper {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return typeof p.pmid === "string" && typeof p.abstract === "string";
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  if (!isPaper(body.paper)) {
    return Response.json(
      { error: "paper 객체가 필요합니다 (pmid, abstract 필수)." },
      { status: 400 }
    );
  }

  const mode: SummaryMode =
    body.mode && (ALLOWED_MODES as string[]).includes(body.mode) ? body.mode : "read";
  const language: Language =
    body.language && (ALLOWED_LANGS as string[]).includes(body.language)
      ? body.language
      : "ko";

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamSummary({
          paper: body.paper as Paper,
          mode,
          language,
          sourceLabel: typeof body.sourceLabel === "string" ? body.sourceLabel : undefined,
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : "알 수 없는 오류";
        console.error("[api/summarize]", err);
        // 스트림 중간 에러는 텍스트로 표시하고 종료
        controller.enqueue(encoder.encode(`\n\n[요약 중단] ${message}`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
