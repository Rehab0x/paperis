// /api/tts — paper + (선택) full text를 받아 narration 텍스트를 만들고 provider로 합성.
// 응답: audio/wav 바이너리 + 트랙 메타는 헤더로 동봉.

import {
  friendlyErrorMessage,
  generateNarrationText,
} from "@/lib/gemini";
import { getTtsProvider } from "@/lib/tts";
import type { ApiError, Language, Paper, TtsRequestBody } from "@/types";

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

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  let body: Partial<TtsRequestBody> & { fullText?: unknown };
  try {
    body = (await req.json()) as Partial<TtsRequestBody> & {
      fullText?: unknown;
    };
  } catch {
    return jsonError("요청 본문이 올바른 JSON이 아닙니다.");
  }
  if (!isPaper(body.paper)) {
    return jsonError("paper 필드가 필요합니다.");
  }
  const language: Language = body.language === "en" ? "en" : "ko";
  const providerName =
    typeof body.providerName === "string" ? body.providerName : "gemini";
  const voice = typeof body.voice === "string" ? body.voice : undefined;
  const sourceLabel =
    typeof body.sourceLabel === "string" ? body.sourceLabel : undefined;
  const fullText =
    typeof body.fullText === "string" ? body.fullText : null;

  // narration 생성에 사용할 paper (full text가 있으면 abstract 자리에 주입)
  const sourcePaper: Paper = fullText
    ? { ...body.paper, abstract: fullText }
    : body.paper;

  let provider;
  try {
    provider = getTtsProvider(providerName);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "TTS provider 오류",
      400
    );
  }

  // 1) Gemini로 narration 텍스트 생성
  let narration: string;
  try {
    narration = await generateNarrationText(sourcePaper, language, sourceLabel);
  } catch (err) {
    return jsonError(friendlyErrorMessage(err, language), 502);
  }
  if (!narration) {
    return jsonError("narration 생성 결과가 비어 있습니다.", 502);
  }

  // 2) provider로 합성
  try {
    const result = await provider.synthesize({
      text: narration,
      language,
      voice,
    });
    const arrayBuffer = result.audio.buffer.slice(
      result.audio.byteOffset,
      result.audio.byteOffset + result.audio.byteLength
    );
    // narration 원문을 응답 헤더에 base64로 동봉 → 클라가 트랙에 함께 저장.
    // 재생 중 "스크립트 보기"에서 사용. 한국어 narration ~1500자면 base64 ~6KB로
    // Vercel/Node 헤더 제한(보통 32KB+) 안에 충분히 들어간다.
    const narrationB64 = Buffer.from(narration, "utf-8").toString("base64");

    return new Response(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "content-type": result.format,
        "content-length": String(result.audio.byteLength),
        "x-tts-provider": result.providerName,
        "x-tts-voice": result.voice,
        "x-tts-language": language,
        "x-tts-format": result.format,
        "x-audio-duration-ms": String(result.durationMs),
        "x-audio-sample-rate": String(result.sampleRate),
        "x-tts-narration-b64": narrationB64,
        "access-control-expose-headers":
          "x-tts-provider, x-tts-voice, x-tts-language, x-tts-format, x-audio-duration-ms, x-audio-sample-rate, x-tts-narration-b64",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(friendlyErrorMessage(err, language), 502);
  }
}
