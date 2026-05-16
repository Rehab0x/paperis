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
import { isAdminEmail } from "@/lib/admin";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import { readUserKeys } from "@/lib/user-keys";
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
 * 등급별 동작 (service-cleanup post-Phase D 단순화):
 *   AI provider는 모든 등급 Gemini 고정. 사용자 선택 불가.
 *   - Free / Balanced / Pro: 우리 서버 GEMINI_API_KEY 사용
 *   - BYOK: 본인 Gemini 키 필수 (없으면 에러 — 19,900 결제 의의 = 본인 키)
 *   - Admin: 본인 키 입력 시 그걸로, 없으면 서버 env (테스트 편의)
 *
 * Claude/OpenAI/Grok 코드는 lib/ai/*에 dormant 상태로 보존 (재활용 여지). UI에서는 노출 X.
 *
 * applyUserKeysToEnv가 이 함수보다 먼저 호출되어야 함 — BYOK 본인 키가 process.env에
 * 반영되어야 createGeminiProvider가 그 키로 인스턴스 생성.
 */
export async function getEffectiveAiProvider(req: Request): Promise<AiProvider> {
  // 등급 판정 — BYOK은 본인 키 입력 강제 (admin은 env fallback 허용)
  type Tier = "subscriber" | "byok" | "admin";
  let tier: Tier = "subscriber";
  try {
    const session = await auth();
    if (session?.user?.id) {
      if (isAdminEmail(session.user.email)) {
        tier = "admin";
      } else if (hasDb()) {
        const db = getDb();
        const rows = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, session.user.id))
          .limit(1);
        const row = rows[0];
        if (
          row &&
          (row.status === "active" || row.status === "cancelled") &&
          row.plan === "byok"
        ) {
          if (!row.expiresAt || row.expiresAt.getTime() > Date.now()) {
            tier = "byok";
          }
        }
      }
    }
  } catch {
    // graceful
  }

  if (tier === "byok") {
    const userKeys = readUserKeys(req);
    if (!userKeys.gemini) {
      throw new AiProviderError(
        "gemini",
        "BYOK 결제자는 본인 Gemini API 키 입력이 필요합니다. 설정 → API 키 (BYOK)에서 입력해 주세요."
      );
    }
    return getAiProvider("gemini", { apiKey: userKeys.gemini });
  }

  // subscriber / admin → process.env.GEMINI_API_KEY (admin은 본인 키가 있으면
  // applyUserKeysToEnv가 이미 override해 둠)
  return getAiProvider("gemini");
}

