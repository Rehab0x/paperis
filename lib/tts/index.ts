// TTS provider registry.
// 사용자가 클라이언트 settings에서 선호 provider를 선택 → /api/tts 호출 시 그 값을 보냄.
// v3부터 default = Clova (한국어 자연스러움 + 빠름 + Vercel timeout 회피).
// 요청한 provider의 키가 없으면 resolveTtsProvider가 Gemini로 자동 강등.

import { ClovaTtsProvider } from "@/lib/tts/clova";
import { GeminiTtsProvider } from "@/lib/tts/gemini";
import { GoogleCloudTtsProvider } from "@/lib/tts/google-cloud";
import type { TtsProvider } from "@/lib/tts/types";
import type { Language } from "@/types";

const providers = new Map<string, TtsProvider>();
providers.set("gemini", new GeminiTtsProvider());
providers.set("clova", new ClovaTtsProvider());
providers.set("google-cloud", new GoogleCloudTtsProvider());

// 언어별 default — Clova는 한국어 전용. 영어 narration이 Clova로 가면 발음 어색하거나
// 에러. 사용자가 명시 안 한 경우 언어 기반으로 합리적인 default 선택.
const DEFAULT_PROVIDER_BY_LANG: Record<Language, string> = {
  ko: "clova",
  en: "google-cloud",
};

const DEFAULT_PROVIDER = DEFAULT_PROVIDER_BY_LANG.ko;

export function defaultTtsProviderFor(language: Language | undefined): string {
  return language === "en" ? DEFAULT_PROVIDER_BY_LANG.en : DEFAULT_PROVIDER_BY_LANG.ko;
}

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

/**
 * provider별 필수 env 키가 process.env에 있는지 확인.
 * `applyUserKeysToEnv(req)` 호출 이후에 평가해야 사용자 X-Paperis-Keys 입력이 반영된다.
 */
export function hasProviderCredentials(name: string): boolean {
  switch (name.toLowerCase()) {
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY);
    case "clova":
      return Boolean(
        process.env.NCP_CLOVA_CLIENT_ID && process.env.NCP_CLOVA_CLIENT_SECRET
      );
    case "google-cloud":
      return Boolean(process.env.GOOGLE_CLOUD_TTS_API_KEY);
    default:
      return false;
  }
}

export interface ResolvedTtsProvider {
  provider: TtsProvider;
  /** 요청 provider가 키 부재로 다른 provider로 강등되었는가 */
  degraded: boolean;
  /** 강등 시 원래 요청한 provider 이름 (UI/로그용) */
  requestedName?: string;
}

/**
 * 요청 provider 키가 없으면 Gemini로 자동 강등. Gemini도 키가 없으면 원래 provider를
 * 그대로 반환 — synthesize 시점에 친절 에러가 나오도록 한다.
 *
 * language 인자 — 사용자가 provider를 명시 안 했을 때(name=undefined) 언어별 default
 * 결정 (ko=Clova, en=Google Cloud). 명시했으면 그대로 존중.
 *
 * Why: v3 default가 Clova라 Vercel prod env에 Clova 키 없는 상태에서 즉시 깨질 위험.
 *      X-Paperis-Keys 미사용 + Clova 키 부재 사용자가 라이브에 있어도 Gemini fallback.
 *      Phase 2-B에서 영어 narration이 Clova로 가는 미스매치도 방지.
 */
export function resolveTtsProvider(
  name?: string,
  language?: Language
): ResolvedTtsProvider {
  const requested = (name ?? defaultTtsProviderFor(language)).toLowerCase();
  const provider = providers.get(requested);
  if (!provider) {
    throw new Error(`알 수 없는 TTS provider: ${name}`);
  }
  if (hasProviderCredentials(requested)) {
    return { provider, degraded: false };
  }
  if (requested !== "gemini" && hasProviderCredentials("gemini")) {
    return {
      provider: providers.get("gemini") as TtsProvider,
      degraded: true,
      requestedName: requested,
    };
  }
  return { provider, degraded: false };
}

export { DEFAULT_PROVIDER };
