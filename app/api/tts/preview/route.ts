// /api/tts/preview — 설정 패널의 화자/속도 미리듣기.
// 짧은 예문을 narration 생성 단계 없이 곧장 provider.synthesize에 던진다.

import { friendlyErrorMessage } from "@/lib/gemini";
import { getRequestLanguage } from "@/lib/i18n";
import { resolveTtsProvider } from "@/lib/tts";
import { requireLogin } from "@/lib/auth-gate";
import { getPlan } from "@/lib/usage";
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
  const gate = await requireLogin();
  if (!gate.ok) return gate.response;
  await applyUserKeysToEnv(req);
  let body: PreviewBody;
  try {
    body = (await req.json()) as PreviewBody;
  } catch {
    return jsonError("요청 본문이 올바른 JSON이 아닙니다.");
  }
  const text = (body.text ?? "").trim();
  if (!text) return jsonError("미리듣기 텍스트가 비어 있습니다.");
  const language: Language = getRequestLanguage(req, body);
  // providerName 미지정 시 lib/tts의 DEFAULT_PROVIDER(v3=clova) 사용. 키 부재면 Gemini fallback.
  const providerName =
    typeof body.providerName === "string" ? body.providerName : undefined;
  const voice = typeof body.voice === "string" ? body.voice : undefined;
  const speakingRate: -1 | 0 | 1 =
    body.speakingRate === -1 || body.speakingRate === 1
      ? body.speakingRate
      : 0;

  // 구독자는 google-cloud 강제 — preview도 동일하게 (UI 잠금과 일관)
  const plan = await getPlan(req);
  let resolved;
  try {
    resolved = resolveTtsProvider(providerName, language, plan);
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "TTS provider 오류",
      400
    );
  }
  const provider = resolved.provider;
  // fallback이면 사용자가 고른 voice는 다른 provider라인업이라 무시
  const voiceForProvider = resolved.degraded ? undefined : voice;

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
      "x-tts-format": result.format,
      "cache-control": "no-store",
      "access-control-expose-headers": "x-tts-format, x-tts-degraded-from",
    };
    if (resolved.degraded && resolved.requestedName) {
      headers["x-tts-degraded-from"] = resolved.requestedName;
    }
    return new Response(arrayBuffer as ArrayBuffer, { status: 200, headers });
  } catch (err) {
    return jsonError(friendlyErrorMessage(err, language), 502);
  }
}
