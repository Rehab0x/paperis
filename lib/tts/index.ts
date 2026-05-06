// TTS provider registry.
// 사용자가 클라이언트 settings에서 선호 provider를 선택 → /api/tts 호출 시 그 값을 보냄.
// 서버 default는 안전한 Gemini (모든 사용자가 GEMINI_API_KEY 보유 가정).

import { ClovaTtsProvider } from "@/lib/tts/clova";
import { GeminiTtsProvider } from "@/lib/tts/gemini";
import { GoogleCloudTtsProvider } from "@/lib/tts/google-cloud";
import type { TtsProvider } from "@/lib/tts/types";

const providers = new Map<string, TtsProvider>();
providers.set("gemini", new GeminiTtsProvider());
providers.set("clova", new ClovaTtsProvider());
providers.set("google-cloud", new GoogleCloudTtsProvider());

const DEFAULT_PROVIDER = "gemini";

export function getTtsProvider(name?: string): TtsProvider {
  const key = (name ?? DEFAULT_PROVIDER).toLowerCase();
  const provider = providers.get(key);
  if (!provider) {
    throw new Error(`알 수 없는 TTS provider: ${name}`);
  }
  return provider;
}

export function listTtsProviders(): string[] {
  return Array.from(providers.keys());
}

export { DEFAULT_PROVIDER };
