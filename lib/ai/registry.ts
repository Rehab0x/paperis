// AI provider 팩토리 — 라우트가 provider 이름만 받아 인스턴스를 얻는다.
//
// Phase A: Gemini만 구현.
// Phase B+: Claude, OpenAI, Grok 추가.
//
// 사용:
//   const ai = getAiProvider("gemini");
//   const text = await ai.generateText({ userPrompt: "...", tier: "fast" });
//
// 매 요청마다 새 인스턴스 — process.env 변경(applyUserKeysToEnv) 반영을 위해
// 캐싱하지 않음. SDK 클라이언트 생성 비용은 무시 가능 수준.

import { createClaudeProvider } from "./claude-provider";
import { createGeminiProvider } from "./gemini-provider";
import {
  createGrokProvider,
  createOpenAiProvider,
} from "./openai-provider";
import {
  AiProviderError,
  type AiProvider,
  type AiProviderName,
  type AiProviderOptions,
} from "./types";

export function getAiProvider(
  name: AiProviderName,
  opts?: AiProviderOptions
): AiProvider {
  switch (name) {
    case "gemini":
      return createGeminiProvider(opts);
    case "claude":
      return createClaudeProvider(opts);
    case "openai":
      return createOpenAiProvider(opts);
    case "grok":
      return createGrokProvider(opts);
    default: {
      const exhaustive: never = name;
      throw new AiProviderError(
        "gemini",
        `알 수 없는 provider: ${exhaustive as string}`
      );
    }
  }
}

/**
 * 사용자가 어떤 provider를 사용할 수 있는지 — UI에 노출할 때 활용.
 * Phase별로 추가됨.
 */
export const AVAILABLE_PROVIDERS: readonly AiProviderName[] = [
  "gemini",
  "claude",
  "openai",
  "grok",
];

/** 기본 provider — 사용자가 선택 안 했을 때 fallback */
export const DEFAULT_PROVIDER: AiProviderName = "gemini";

/**
 * 요청에서 사용자 선호 provider 읽고 등급별 권한 적용해 실제 인스턴스 반환.
 *
 * 등급별 동작 (service-cleanup 최종 단순화):
 *   AI provider는 모든 등급 Gemini 고정. 사용자 선택 불가.
 *   모든 등급(Free/Balanced/Pro/BYOK/Admin)이 우리 서버 GEMINI_API_KEY를 사용.
 *
 *   BYOK는 "lifetime Pro + TTS provider 자유" 라이선스 (본인 Gemini 키 사용 X).
 *   사용량 한도는 lib/usage.ts의 plan별 LIMITS로 분기 (BYOK는 모두 Infinity).
 *
 *   Admin은 본인 키 입력 시 applyUserKeysToEnv가 process.env override (테스트 편의).
 *
 * Claude/OpenAI/Grok 코드는 lib/ai/*에 dormant 상태로 보존. UI에서는 노출 X.
 */
export async function getEffectiveAiProvider(req: Request): Promise<AiProvider> {
  void req;
  return getAiProvider("gemini");
}

