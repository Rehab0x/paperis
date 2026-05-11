// 라우트가 요청 헤더 X-Paperis-Keys (base64 JSON)에서 사용자 입력 키를 추출.
//
// 정책 (2026-05-11 변경):
//   - 헤더 키 적용은 BYOK 결제자(subscriptions.plan='byok')에 한해 허용
//   - Free/Pro/익명은 헤더가 와도 무시 → 우리 env 키 사용 + Free 한도 적용
//   - "BYOK = 본인 API 키 입력 권한" 정책에 따른 강제 게이트

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";

export interface UserApiKeys {
  gemini?: string;
  googleCloud?: string;
  clovaId?: string;
  clovaSecret?: string;
  pubmed?: string;
  unpaywall?: string;
}

const HEADER_NAME = "x-paperis-keys";

function decodeBase64Utf8(b64: string): string {
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(b64, "base64").toString("utf-8");
    }
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

export function readUserKeys(req: Request): UserApiKeys {
  const raw = req.headers.get(HEADER_NAME);
  if (!raw) return {};
  const json = decodeBase64Utf8(raw);
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || !parsed) return {};
    const out: UserApiKeys = {};
    const map = parsed as Record<string, unknown>;
    if (typeof map.gemini === "string") out.gemini = map.gemini;
    if (typeof map.googleCloud === "string") out.googleCloud = map.googleCloud;
    if (typeof map.clovaId === "string") out.clovaId = map.clovaId;
    if (typeof map.clovaSecret === "string") out.clovaSecret = map.clovaSecret;
    if (typeof map.pubmed === "string") out.pubmed = map.pubmed;
    if (typeof map.unpaywall === "string") out.unpaywall = map.unpaywall;
    return out;
  } catch {
    return {};
  }
}

/**
 * 현재 요청 사용자가 BYOK 결제자인지 확인.
 * - 익명/Free/Pro: false
 * - subscriptions.plan='byok' + status active/cancelled: true (cancelled도 expiresAt 만료 전까지는 유지)
 */
async function userHasByokPlan(): Promise<boolean> {
  if (!hasDb()) return false;
  const session = await auth();
  if (!session?.user?.id) return false;
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);
    const row = rows[0];
    if (!row) return false;
    if (row.plan !== "byok") return false;
    // BYOK는 expiresAt=null = 평생. cancelled는 의미 없지만 일관성 위해 같이 허용.
    if (row.status === "active" || row.status === "cancelled") return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * 라우트 시작에 await로 호출. 사용자가 BYOK 결제자면 헤더 키를 process.env에 반영.
 * 비-BYOK 사용자의 헤더는 무시 (우리 env 키로 진행 + Free 한도 적용).
 *
 * Node.js 모듈은 단일 프로세스라 process.env 변경이 동시 요청에 영향 줄 수 있으나
 * 단일 사용자 dev 환경에선 실용상 문제 없음. prod에선 BYOK 사용자 본인 키이므로
 * 다른 사용자에게 잘못 새지 않도록 라우트가 await로 순차 처리.
 */
export async function applyUserKeysToEnv(req: Request): Promise<void> {
  const keys = readUserKeys(req);
  const hasAny =
    keys.gemini ||
    keys.googleCloud ||
    keys.clovaId ||
    keys.clovaSecret ||
    keys.pubmed ||
    keys.unpaywall;
  if (!hasAny) return;

  const allowed = await userHasByokPlan();
  if (!allowed) return; // 비-BYOK 사용자 헤더는 무시

  if (keys.gemini) process.env.GEMINI_API_KEY = keys.gemini;
  if (keys.googleCloud)
    process.env.GOOGLE_CLOUD_TTS_API_KEY = keys.googleCloud;
  if (keys.clovaId) process.env.NCP_CLOVA_CLIENT_ID = keys.clovaId;
  if (keys.clovaSecret) process.env.NCP_CLOVA_CLIENT_SECRET = keys.clovaSecret;
  if (keys.pubmed) process.env.PUBMED_API_KEY = keys.pubmed;
  if (keys.unpaywall) process.env.UNPAYWALL_EMAIL = keys.unpaywall;
}

export const USER_KEYS_HEADER = HEADER_NAME;
