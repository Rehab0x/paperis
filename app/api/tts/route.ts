import type { NextRequest } from "next/server";
import { streamSummary } from "@/lib/gemini";
import {
  synthesizeDialogue,
  synthesizeNarration,
  type DialogueVoices,
  type TtsVoice,
} from "@/lib/tts";
import type { Language, ListenStyle, Paper } from "@/types";

export const runtime = "nodejs";
// 대화체 장문의 경우 수십 초 걸릴 수 있음
export const maxDuration = 300;

const ALLOWED_STYLES: ListenStyle[] = ["narration", "dialogue"];
const ALLOWED_LANGS: Language[] = ["ko", "en"];

interface RequestBody {
  paper?: Partial<Paper>;
  style?: ListenStyle;
  language?: Language;
  sourceLabel?: string;
  /** true면 오디오 없이 스크립트만 JSON으로 반환 (디버깅용). */
  scriptOnly?: boolean;
}

const NARRATION_VOICE: TtsVoice = "Charon";
const DIALOGUE_VOICES: DialogueVoices = { A: "Kore", B: "Puck" };

function isPaper(obj: unknown): obj is Paper {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return typeof p.pmid === "string" && typeof p.abstract === "string";
}

async function collectScript(
  paper: Paper,
  style: ListenStyle,
  language: Language,
  sourceLabel?: string
): Promise<string> {
  let acc = "";
  for await (const chunk of streamSummary({
    paper,
    mode: style,
    language,
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

  if (!isPaper(body.paper)) {
    return Response.json(
      { error: "paper 객체가 필요합니다 (pmid, abstract 필수)." },
      { status: 400 }
    );
  }

  const style: ListenStyle =
    body.style && (ALLOWED_STYLES as string[]).includes(body.style)
      ? body.style
      : "narration";
  const language: Language =
    body.language && (ALLOWED_LANGS as string[]).includes(body.language)
      ? body.language
      : "ko";

  try {
    const sourceLabel =
      typeof body.sourceLabel === "string" ? body.sourceLabel : undefined;
    const script = await collectScript(
      body.paper as Paper,
      style,
      language,
      sourceLabel
    );
    if (!script) {
      return Response.json(
        { error: "스크립트 생성 결과가 비어 있습니다." },
        { status: 502 }
      );
    }

    if (body.scriptOnly) {
      return Response.json({ style, language, script });
    }

    const audio =
      style === "dialogue"
        ? await synthesizeDialogue(script, DIALOGUE_VOICES, language)
        : await synthesizeNarration(script, NARRATION_VOICE, language);

    if (audio.length === 0) {
      return Response.json(
        { error: "오디오 생성 결과가 비어 있습니다." },
        { status: 502 }
      );
    }

    const scriptHeader = encodeURIComponent(script.slice(0, 2000));

    return new Response(audio as BodyInit, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audio.length),
        "Cache-Control": "no-store",
        "X-Paperis-Style": style,
        "X-Paperis-Language": language,
        "X-Paperis-Script-Preview": scriptHeader,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[api/tts]", err);
    return Response.json(
      { error: `음성 생성 중 오류가 발생했습니다: ${message}` },
      { status: 502 }
    );
  }
}
