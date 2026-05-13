// /api/tts/text — paper 기반이 아닌 임의 text(이미 narration 형태)를 받아 합성.
// 트렌드 narrationScript처럼 *이미 spoken-word 형태*로 만들어진 텍스트를 그대로 TTS
// 처리하는 경로. /api/tts는 Gemini로 paper → narration 생성 단계가 또 들어가
// 비효율 + 이중 narration이라 안 맞음.
//
// 응답: audio binary + 메타 헤더 (provider/voice/duration). 사용자량 한도는
// /api/tts와 동일하게 "tts" 카테고리로 카운트.

import { friendlyErrorMessage } from "@/lib/gemini";
import { getRequestLanguage } from "@/lib/i18n";
import { resolveTtsProvider } from "@/lib/tts";
import {
  checkAndIncrement,
  getIdentityKey,
  getPlan,
  limitExceededMessage,
} from "@/lib/usage";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { ApiError, Language } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 300;

interface TtsTextBody {
  text?: unknown;
  language?: unknown;
  providerName?: unknown;
  voice?: unknown;
  speakingRate?: unknown;
}

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const MIN_TEXT = 20;
// Clova/Gemini TTS의 단일 합성 한도가 있어 너무 긴 텍스트는 거부 (chunk 분할은
// provider 내부에서 처리하지만 안전 마진).
const MAX_TEXT = 30000;

export async function POST(req: Request) {
  await applyUserKeysToEnv(req);

  let body: TtsTextBody;
  try {
    body = (await req.json()) as TtsTextBody;
  } catch {
    return jsonError("요청 본문이 올바른 JSON이 아닙니다.");
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length < MIN_TEXT) {
    return jsonError(`text가 너무 짧습니다 (${MIN_TEXT}자 이상).`);
  }
  if (text.length > MAX_TEXT) {
    return jsonError(`text가 너무 깁니다 (최대 ${MAX_TEXT}자).`);
  }

  const language: Language = getRequestLanguage(req, body);
  const providerName =
    typeof body.providerName === "string" ? body.providerName : undefined;
  const voice = typeof body.voice === "string" ? body.voice : undefined;
  const rawRate = body.speakingRate;
  const speakingRate: -1 | 0 | 1 =
    rawRate === -1 || rawRate === 1 ? rawRate : 0;

  let resolved;
  try {
    resolved = resolveTtsProvider(providerName, language);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "TTS provider 오류",
      400
    );
  }
  const provider = resolved.provider;
  const voiceForProvider = resolved.degraded ? undefined : voice;

  // Free 한도 (TTS 카테고리). BYOK/Pro 무제한 통과
  const identityKey = await getIdentityKey(req);
  const plan = await getPlan(req);
  const usage = await checkAndIncrement(identityKey, "tts", plan);
  if (!usage.allowed) {
    return jsonError(
      limitExceededMessage(
        "tts",
        usage,
        identityKey?.startsWith("anon:") === false
      ),
      429
    );
  }

  try {
    const result = await provider.synthesize({
      text,
      language,
      voice: voiceForProvider,
      speakingRate,
    });
    const arrayBuffer = result.audio.buffer.slice(
      result.audio.byteOffset,
      result.audio.byteOffset + result.audio.byteLength
    );
    const headers: Record<string, string> = {
      "content-type": result.format,
      "content-length": String(result.audio.byteLength),
      "x-tts-provider": result.providerName,
      "x-tts-voice": result.voice,
      "x-tts-language": language,
      "x-tts-format": result.format,
      "x-audio-duration-ms": String(result.durationMs),
      "x-audio-sample-rate": String(result.sampleRate),
      "access-control-expose-headers":
        "x-tts-provider, x-tts-voice, x-tts-language, x-tts-format, x-audio-duration-ms, x-audio-sample-rate, x-tts-degraded-from",
      "cache-control": "no-store",
    };
    if (resolved.degraded && resolved.requestedName) {
      headers["x-tts-degraded-from"] = resolved.requestedName;
    }
    return new Response(arrayBuffer as ArrayBuffer, { status: 200, headers });
  } catch (err) {
    return jsonError(friendlyErrorMessage(err, language), 502);
  }
}
