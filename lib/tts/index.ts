// TTS provider registry.
// 새 provider 추가 시 여기 등록만 하면 /api/tts에서 ?providerName=... 으로 라우팅된다.
// (TtsSynthesizeResult.format이 union이라 wav/mp3 둘 다 지원 — 새 provider가 다른
//  포맷을 반환해도 클라/다운로드가 mime에 맞춰 처리.)

import { GeminiTtsProvider } from "@/lib/tts/gemini";
import type { TtsProvider } from "@/lib/tts/types";

const providers = new Map<string, TtsProvider>();
providers.set("gemini", new GeminiTtsProvider());

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
