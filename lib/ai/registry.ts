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
import { readAiPreference } from "@/lib/ai-preference";
import { readUserKeys, type UserApiKeys } from "@/lib/user-keys";
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
 * 등급별 동작 (service-cleanup Phase B 단순화):
 *   - Free / Balanced / Pro: provider 선택권 없음 — 항상 default(Gemini) 강제.
 *     구독 등급은 우리 서버 키만 사용하고 provider 선택 UI도 잠긴다 (Phase C UI).
 *   - BYOK: 요청 provider + 본인 키 필수. applyUserKeysToEnv가 process.env에 반영.
 *           env fallback 없음 (createXxxProvider가 에러 throw).
 *   - Admin: 요청 provider + 본인 키 또는 서버 env 둘 다 OK (테스트/관리 편의).
 *
 * applyUserKeysToEnv가 이 함수보다 먼저 호출되어야 함.
 */
export async function getEffectiveAiProvider(req: Request): Promise<AiProvider> {
  const requested = readAiPreference(req);

  // 등급 판정
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
        // Pro/Balanced는 subscriber 그대로 — default provider 강제
      }
    }
  } catch {
    // graceful: 실패 시 subscriber 처리
  }

  // Free / Balanced / Pro / Logout → default 강제 (Gemini 우리 서버 키)
  if (tier === "subscriber") return getAiProvider(DEFAULT_PROVIDER);

  // BYOK — 본인 키 필수. env fallback 없음.
  if (tier === "byok") {
    const userKeys = readUserKeys(req);
    const userKey = userKeys[providerToUserKeyField(requested)];
    if (!userKey) {
      throw new AiProviderError(
        requested,
        `BYOK 결제자는 본인 ${requested.toUpperCase()} API 키 입력이 필요합니다. 설정 → API 키 (BYOK)에서 입력해 주세요.`
      );
    }
    return getAiProvider(requested, { apiKey: userKey });
  }

  // Admin — 본인 키 + env 합집합. applyUserKeysToEnv가 이미 본인 키를 process.env에 반영
  return getAiProvider(requested);
}

/** AiProviderName → UserApiKeys 필드 매핑 (BYOK 키 검증용) */
function providerToUserKeyField(name: AiProviderName): keyof UserApiKeys {
  switch (name) {
    case "gemini":
      return "gemini";
    case "claude":
      return "anthropic";
    case "openai":
      return "openai";
    case "grok":
      return "grok";
  }
}
