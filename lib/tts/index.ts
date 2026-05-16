// TTS provider registry.
// 사용자가 클라이언트 settings에서 선호 provider를 선택 → /api/tts 호출 시 그 값을 보냄.
//
// Default (2026-05-16 변경) = Google Cloud TTS Neural2.
// 이전 default는 Clova였으나 Clova Premium은 월 기본료 9만원 + 1000자당 100원으로
// 운영 비용 부담이 커 BYOK 전용으로 격하. GC TTS Neural2는 월 1M자 무료(이후 $16/1M자)라
// 구독자(Free/Balanced/Pro) 단위 비용이 압도적으로 낮음. Phase C에서 구독자는 provider
// 선택 자체가 GC로 강제됨 (UI 잠금 + 서버 게이트).
//
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

// 언어별 default — 한/영 모두 Google Cloud TTS Neural2.
// 한국어: ko-KR-Neural2-A (여성, 차분, 의학 낭독 톤 양호).
// 영어: en-US-Neural2-F.
// Clova는 BYOK 사용자가 명시 선택 시만 사용.
const DEFAULT_PROVIDER_BY_LANG: Record<Language, string> = {
  ko: "google-cloud",
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
 * 결정. 현재 ko/en 모두 Google Cloud TTS.
 *
 * plan 인자 (Phase C-4 추가) — Free/Balanced/Pro 구독자는 무조건 google-cloud 강제.
 * BYOK/Admin만 사용자가 명시한 provider 존중. UI 잠금(Phase C-1)과 별개로 서버에서
 * 한 번 더 게이트 — 클라가 헤더 위조해도 서버에서 차단.
 *
 * Why: default가 GC TTS여도 GOOGLE_CLOUD_TTS_API_KEY 부재 시 Gemini fallback으로 라우트가
 *      깨지지 않도록. Clova(BYOK 전용)를 선택했는데 NCP 키 부재인 경우도 동일하게 보호.
 */
export function resolveTtsProvider(
  name?: string,
  language?: Language,
  plan?: "free" | "balanced" | "pro" | "byok"
): ResolvedTtsProvider {
  // 비-BYOK은 사용자 명시 provider 무시 — 항상 google-cloud
  const isSubscriber =
    plan === "free" || plan === "balanced" || plan === "pro";
  const effectiveName = isSubscriber ? "google-cloud" : name;
  const requested = (
    effectiveName ?? defaultTtsProviderFor(language)
  ).toLowerCase();
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
