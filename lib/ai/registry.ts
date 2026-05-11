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
      throw new AiProviderError(
        "openai",
        "OpenAI provider는 Phase E에서 추가 예정입니다."
      );
    case "grok":
      throw new AiProviderError(
        "grok",
        "Grok provider는 Phase E에서 추가 예정입니다."
      );
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
];

/** 기본 provider — 사용자가 선택 안 했을 때 fallback */
export const DEFAULT_PROVIDER: AiProviderName = "gemini";
