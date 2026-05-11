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

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { readAiPreference } from "@/lib/ai-preference";
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
 * 요청에서 사용자 선호 provider 읽고 BYOK 게이트 적용해 실제 인스턴스 반환.
 *
 * - 비-BYOK 사용자가 비-default provider를 헤더에 동봉해도 무시 (default로 강제)
 * - BYOK 사용자는 요청한 provider 인스턴스 (단, 키 미설정이면 createXxx에서 에러)
 *
 * applyUserKeysToEnv가 이 함수보다 먼저 호출되어야 함 — user 키가 process.env에
 * 반영된 후 provider 생성.
 */
export async function getEffectiveAiProvider(req: Request): Promise<AiProvider> {
  const requested = readAiPreference(req);
  if (requested === DEFAULT_PROVIDER) return getAiProvider(requested);

  // BYOK 게이트
  let isByok = false;
  if (hasDb()) {
    try {
      const session = await auth();
      if (session?.user?.id) {
        const db = getDb();
        const rows = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, session.user.id))
          .limit(1);
        const row = rows[0];
        if (
          row &&
          row.plan === "byok" &&
          (row.status === "active" || row.status === "cancelled")
        ) {
          isByok = true;
        }
      }
    } catch {
      // graceful: DB 실패 시 default
    }
  }
  if (!isByok) return getAiProvider(DEFAULT_PROVIDER);
  return getAiProvider(requested);
}
