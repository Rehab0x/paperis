import type { NextRequest } from "next/server";
import { streamSummary } from "@/lib/gemini";
import { synthesizeNarration } from "@/lib/tts";
import type { Language, Paper } from "@/types";

export const runtime = "nodejs";
// 5편 × ~30-60초/트랙 합성 = 짧으면 60-90초, 길면 5분. Hobby 플랜은 잘릴 수 있음.
export const maxDuration = 300;

const ALLOWED_LANGS: Language[] = ["ko", "en"];
const MAX_PAPERS = 10;

interface RequestBody {
  papers?: unknown;
  language?: Language;
  /** 짧은 1-2분 요약(true, 기본) vs 풀 5-10분(false). */
  brief?: boolean;
  /** papers와 같은 길이의 배열. 각 paper의 abstract 출처 라벨(예: "PMC full text"). null이면 abstract만으로 간주. */
  sourceLabels?: (string | null)[];
}

interface TrackOut {
  pmid: string;
  title: string;
  script: string;
  audioBase64: string;
  contentType: string;
  bytes: number;
  error?: string;
}

function isPaper(obj: unknown): obj is Paper {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return typeof p.pmid === "string" && typeof p.abstract === "string";
}

async function collectScript(
  paper: Paper,
  language: Language,
  brief: boolean,
  sourceLabel?: string
): Promise<string> {
  let acc = "";
  for await (const chunk of streamSummary({
    paper,
    mode: "narration",
    language,
    brief,
    sourceLabel,
  })) {
    acc += chunk;
  }
  return acc.trim();
}

export async function POST(request: NextRequest) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "잘못된 요청 본문입니다." }, { status: 400 });
  }

  const papers = (Array.isArray(body.papers) ? body.papers : []).filter(
    isPaper
  ) as Paper[];
  if (papers.length === 0) {
    return Response.json({ error: "papers 배열이 필요합니다." }, { status: 400 });
  }
  if (papers.length > MAX_PAPERS) {
    return Response.json(
      { error: `한 번에 최대 ${MAX_PAPERS}편까지 처리할 수 있습니다.` },
      { status: 400 }
    );
  }

  const language: Language =
    body.language && (ALLOWED_LANGS as string[]).includes(body.language)
      ? body.language
      : "ko";
  const brief = body.brief !== false; // 기본 true
  const sourceLabels = Array.isArray(body.sourceLabels) ? body.sourceLabels : [];

  // 각 paper에 대해 [script 생성 → TTS] 를 병렬 실행
  const tasks = papers.map(async (paper, idx): Promise<TrackOut> => {
    const base: TrackOut = {
      pmid: paper.pmid,
      title: paper.title || `(논문 ${idx + 1})`,
      script: "",
      audioBase64: "",
      contentType: "audio/wav",
      bytes: 0,
    };
    try {
      const rawLabel = sourceLabels[idx];
      const sourceLabel =
        typeof rawLabel === "string" && rawLabel.trim().length > 0
          ? rawLabel
          : undefined;
      const script = await collectScript(paper, language, brief, sourceLabel);
      if (!script) throw new Error("스크립트 생성 결과가 비어 있습니다.");
      base.script = script;

      const audio = await synthesizeNarration(script, "Charon", language);
      if (audio.length === 0) throw new Error("오디오가 비어 있습니다.");

      base.audioBase64 = Buffer.from(audio).toString("base64");
      base.bytes = audio.length;
      return base;
    } catch (err) {
      console.error(`[api/playlist] track ${paper.pmid}`, err);
      return {
        ...base,
        error: err instanceof Error ? err.message : "트랙 생성 실패",
      };
    }
  });

  const tracks = await Promise.all(tasks);
  const okCount = tracks.filter((t) => !t.error && t.audioBase64).length;

  if (okCount === 0) {
    return Response.json(
      {
        error: "모든 트랙 생성에 실패했습니다.",
        tracks,
      },
      { status: 502 }
    );
  }

  return Response.json({
    language,
    brief,
    tracks,
    okCount,
    requested: papers.length,
  });
}
