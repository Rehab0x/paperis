// 월별 Free 사용량 한도 — v3 M6.
//
// identityKey:
//   - 로그인: session.user.id
//   - 비로그인: "anon:{anonymousId}" — 클라가 X-Paperis-Anon-Id 헤더로 전달
//
// plan 판정 (우선순위):
//   1. subscriptions.plan === "pro" || "byok" + status active → 무제한
//   2. X-Paperis-Keys로 자기 GEMINI_API_KEY 보냈으면 "byok-effective" → 무제한
//   3. 그 외 → "free" → 한도 적용
//
// yearMonth는 KST(UTC+9) 기준 "YYYY-MM" — 매달 자연 분리되어 cron 없이 reset.

import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions, usageMonthly } from "@/lib/db/schema";
import { readUserKeys } from "@/lib/user-keys";

export type UsageKind = "curation" | "tts" | "fulltext";
export type Plan = "free" | "byok-effective" | "byok" | "pro";

/** Free 플랜 월별 한도 */
export const FREE_LIMITS: Record<UsageKind, number> = {
  curation: 3,
  tts: 5,
  fulltext: 3,
};

/**
 * 사용량 한도 활성화 flag (server-side env). 0/미설정이면 모든 호출 무제한 통과
 * (DB 카운트도 안 함). 점진 롤아웃 — 결제 단계(M7) 도입 후 prod에서 1로.
 */
const ENABLED = process.env.FEATURE_USAGE_LIMIT === "1";

export function isUsageLimitEnabled(): boolean {
  return ENABLED;
}

/** UsageKind → 컬럼 이름 (raw SQL 조립용) */
const KIND_COLUMN: Record<UsageKind, string> = {
  curation: "curation_count",
  tts: "tts_count",
  fulltext: "fulltext_count",
};

export interface UsageCheckResult {
  /** 한도 안에 들어와 increment 됐으면 true */
  allowed: boolean;
  /** increment 후 현재 값 (allowed=false면 incre 전 현재 값) */
  current: number;
  /** Free 한도 (Infinity for byok/pro) */
  limit: number;
  /** 남은 횟수 */
  remaining: number;
  /** 적용된 plan */
  plan: Plan;
}

/** KST 기준 현재 yearMonth ("2026-05") */
export function currentYearMonthKST(): string {
  const now = new Date();
  // UTC+9
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1;
  return `${y}-${m < 10 ? "0" + m : m}`;
}

/**
 * 요청에서 identityKey 추출. 로그인 user_id 우선, 없으면 X-Paperis-Anon-Id 헤더.
 * 둘 다 없으면 null — 사용량 체크 자체 스킵 (정책: 비-식별 요청은 통과).
 */
export async function getIdentityKey(req: Request): Promise<string | null> {
  const session = await auth();
  if (session?.user?.id) return session.user.id;
  const anonId = req.headers.get("x-paperis-anon-id");
  if (anonId && anonId.length > 0 && anonId.length <= 64) {
    return `anon:${anonId}`;
  }
  return null;
}

/**
 * plan 판정. DB 호출은 로그인 사용자만 (anon은 항상 free + BYOK 우회 가능).
 */
export async function getPlan(req: Request): Promise<Plan> {
  // BYOK 우회 — 사용자 자기 Gemini 키가 있으면 "byok-effective" (DB 조회 X, 비로그인도 동작)
  const userKeys = readUserKeys(req);
  if (userKeys.gemini) return "byok-effective";

  // 로그인 사용자 → subscriptions 조회
  if (!hasDb()) return "free";
  const session = await auth();
  if (!session?.user?.id) return "free";
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);
    const row = rows[0];
    if (
      row &&
      row.status === "active" &&
      (row.plan === "pro" || row.plan === "byok")
    ) {
      // expiresAt 체크 (만료됐으면 free)
      if (!row.expiresAt || row.expiresAt.getTime() > Date.now()) {
        return row.plan as Plan;
      }
    }
  } catch (err) {
    console.warn("[usage] subscription lookup failed", err);
  }
  return "free";
}

/**
 * 한도 체크 + increment 한 번에. plan이 free가 아니면 무제한 통과 (DB 변경 없음).
 *
 * 알고리즘 (free):
 *   1. SELECT 현재 usage row
 *   2. current >= limit이면 deny (DB 변경 없음)
 *   3. 미만이면 INSERT ... ON CONFLICT DO UPDATE로 카운트 +1
 *
 * race condition 가능 (단일 사용자 환경에선 무시 수준). 정확성이 중요해지면
 * UPDATE WHERE current < limit 패턴으로 atomic 보장 가능.
 */
export async function checkAndIncrement(
  identityKey: string | null,
  kind: UsageKind,
  plan: Plan
): Promise<UsageCheckResult> {
  // FEATURE flag 미설정 시 모든 호출 무제한 통과 (점진 롤아웃)
  if (!ENABLED) {
    return {
      allowed: true,
      current: 0,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      plan,
    };
  }
  // plan free 외엔 모두 무제한
  if (plan !== "free") {
    return {
      allowed: true,
      current: 0,
      limit: Number.POSITIVE_INFINITY,
      remaining: Number.POSITIVE_INFINITY,
      plan,
    };
  }
  // identityKey 없으면 사용량 추적 못 함 — 통과 (정책)
  if (!identityKey) {
    return {
      allowed: true,
      current: 0,
      limit: FREE_LIMITS[kind],
      remaining: FREE_LIMITS[kind],
      plan,
    };
  }
  // DB 미설정 시 통과 (graceful pass-through — usage 시스템 다운 시 라우트 깨지지 않게)
  if (!hasDb()) {
    return {
      allowed: true,
      current: 0,
      limit: FREE_LIMITS[kind],
      remaining: FREE_LIMITS[kind],
      plan,
    };
  }

  const yearMonth = currentYearMonthKST();
  const limit = FREE_LIMITS[kind];
  const column = KIND_COLUMN[kind];

  try {
    const db = getDb();
    // 현재 행 조회
    const existing = await db
      .select()
      .from(usageMonthly)
      .where(
        and(
          eq(usageMonthly.identityKey, identityKey),
          eq(usageMonthly.yearMonth, yearMonth)
        )
      )
      .limit(1);
    const current = existing[0]
      ? readKindCount(existing[0], kind)
      : 0;

    if (current >= limit) {
      return { allowed: false, current, limit, remaining: 0, plan };
    }

    // increment via INSERT ON CONFLICT
    // Drizzle은 set 안에 raw SQL을 받음 — 컬럼 +1 표현
    await db
      .insert(usageMonthly)
      .values({
        identityKey,
        yearMonth,
        curationCount: kind === "curation" ? 1 : 0,
        ttsCount: kind === "tts" ? 1 : 0,
        fulltextCount: kind === "fulltext" ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: [usageMonthly.identityKey, usageMonthly.yearMonth],
        set: {
          // raw SQL — usage_monthly.{column} + 1
          [snakeToDrizzleSetKey(column)]: sql.raw(
            `${quoteIdent("usage_monthly")}.${quoteIdent(column)} + 1`
          ),
          updatedAt: new Date(),
        },
      });

    const next = current + 1;
    return {
      allowed: true,
      current: next,
      limit,
      remaining: Math.max(0, limit - next),
      plan,
    };
  } catch (err) {
    console.warn("[usage] checkAndIncrement failed — graceful pass-through", err);
    // graceful: usage 시스템 다운이라도 라우트 자체는 동작
    return {
      allowed: true,
      current: 0,
      limit,
      remaining: limit,
      plan,
    };
  }
}

/** 사용자 현재 사용량 (UI 잔여 횟수 표시용) */
export interface UsageSnapshot {
  yearMonth: string;
  plan: Plan;
  identityKey: string | null;
  curation: { current: number; limit: number; remaining: number };
  tts: { current: number; limit: number; remaining: number };
  fulltext: { current: number; limit: number; remaining: number };
}

export async function getUsageSnapshot(
  req: Request
): Promise<UsageSnapshot> {
  const identityKey = await getIdentityKey(req);
  const plan = await getPlan(req);
  const yearMonth = currentYearMonthKST();

  const empty = (kind: UsageKind) => ({
    current: 0,
    limit: plan === "free" ? FREE_LIMITS[kind] : Number.POSITIVE_INFINITY,
    remaining:
      plan === "free" ? FREE_LIMITS[kind] : Number.POSITIVE_INFINITY,
  });

  if (plan !== "free" || !identityKey || !hasDb()) {
    return {
      yearMonth,
      plan,
      identityKey,
      curation: empty("curation"),
      tts: empty("tts"),
      fulltext: empty("fulltext"),
    };
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(usageMonthly)
      .where(
        and(
          eq(usageMonthly.identityKey, identityKey),
          eq(usageMonthly.yearMonth, yearMonth)
        )
      )
      .limit(1);
    const row = rows[0];
    const make = (kind: UsageKind) => {
      const cur = row ? readKindCount(row, kind) : 0;
      const lim = FREE_LIMITS[kind];
      return { current: cur, limit: lim, remaining: Math.max(0, lim - cur) };
    };
    return {
      yearMonth,
      plan,
      identityKey,
      curation: make("curation"),
      tts: make("tts"),
      fulltext: make("fulltext"),
    };
  } catch (err) {
    console.warn("[usage] getUsageSnapshot failed", err);
    return {
      yearMonth,
      plan,
      identityKey,
      curation: empty("curation"),
      tts: empty("tts"),
      fulltext: empty("fulltext"),
    };
  }
}

// ── 헬퍼 ─────────────────────────────────────────────────────────

function readKindCount(
  row: { curationCount: number; ttsCount: number; fulltextCount: number },
  kind: UsageKind
): number {
  switch (kind) {
    case "curation":
      return row.curationCount;
    case "tts":
      return row.ttsCount;
    case "fulltext":
      return row.fulltextCount;
  }
}

/** snake_case 컬럼 → Drizzle set 키(camelCase) 매핑 */
function snakeToDrizzleSetKey(column: string): string {
  switch (column) {
    case "curation_count":
      return "curationCount";
    case "tts_count":
      return "ttsCount";
    case "fulltext_count":
      return "fulltextCount";
    default:
      return column;
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * 한도 초과 응답 메시지. 친절 + CTA.
 */
export function limitExceededMessage(
  kind: UsageKind,
  result: UsageCheckResult,
  isLoggedIn: boolean
): string {
  const kindLabel: Record<UsageKind, string> = {
    curation: "저널 큐레이션 분석",
    tts: "TTS 변환",
    fulltext: "풀텍스트 요약",
  };
  const cta = isLoggedIn
    ? "Pro 업그레이드(준비 중) 또는 본인 Gemini API 키를 설정 → API 키에 입력하면 무제한입니다."
    : "로그인하면 사용자 단위로 카운트되고, 본인 Gemini API 키를 설정 → API 키에 입력하면 무제한입니다.";
  return `이번 달 ${kindLabel[kind]} 무료 한도(${result.limit}회)를 모두 사용했습니다. ${cta}`;
}
