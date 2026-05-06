// /api/tts/preview — 설정 패널의 화자/속도 미리듣기.
// 짧은 예문을 narration 생성 단계 없이 곧장 provider.synthesize에 던진다.

import { friendlyErrorMessage } from "@/lib/gemini";
import { getTtsProvider } from "@/lib/tts";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { ApiError, Language } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface PreviewBody {
  text?: string;
  language?: Language;
  providerName?: string;
  voice?: string;
  speakingRate?: -1 | 0 | 1;
}

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  applyUserKeysToEnv(req);
  let body: PreviewBody;
  try {
    body = (await req.json()) as PreviewBody;
  } catch {
    return jsonError("요청 본문이 올바른 JSON이 아닙니다.");
  }
  const text = (body.text ?? "").trim();
  if (!text) return jsonError("미리듣기 텍스트가 비어 있습니다.");
  const language: Language = body.language === "en" ? "en" : "ko";
  const providerName =
    typeof body.providerName === "string" ? body.providerName : "gemini";
  const voice = typeof body.voice === "string" ? body.voice : undefined;
  const speakingRate: -1 | 0 | 1 =
    body.speakingRate === -1 || body.speakingRate === 1
      ? body.speakingRate
      : 0;

  let provider;
  try {
    provider = getTtsProvider(providerName);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "TTS provider 오류",
      400
    );
  }

  try {
    const result = await provider.synthesize({
      text,
      language,
      voice,
      speakingRate,
    });
    const arrayBuffer = result.audio.buffer.slice(
      result.audio.byteOffset,
      result.audio.byteOffset + result.audio.byteLength
    );
    return new Response(arrayBuffer as ArrayBuffer, {
      status: 200,
      headers: {
        "content-type": result.format,
        "content-length": String(result.audio.byteLength),
        "x-tts-format": result.format,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(friendlyErrorMessage(err, language), 502);
  }
}
