// TTS provider registry.
// 새 provider 추가 시 여기 등록만 하면 /api/tts에서 ?providerName=... 으로 라우팅된다.

import { GeminiTtsProvider } from "@/lib/tts/gemini";
import type { TtsProvider } from "@/lib/tts/types";

const providers = new Map<string, TtsProvider>();
providers.set("gemini", new GeminiTtsProvider());

export function getTtsProvider(name?: string): TtsProvider {
  const key = (name ?? "gemini").toLowerCase();
  const provider = providers.get(key);
  if (!provider) {
    throw new Error(`알 수 없는 TTS provider: ${name}`);
  }
  return provider;
}

export function listTtsProviders(): string[] {
  return Array.from(providers.keys());
}
