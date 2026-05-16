// 월별 Free 사용량 한도 — v3 M6.
//
// identityKey:
//   - 로그인: session.user.id
//   - 비로그인: "anon:{anonymousId}" — 클라가 X-Paperis-Anon-Id 헤더로 전달
//
// plan 판정 (2026-05-11 단순화):
//   1. subscriptions.plan === "pro" || "byok" + status active/cancelled → 무제한
//   2. 그 외 → "free" → 한도 적용
//
// X-Paperis-Keys 헤더는 더 이상 plan 판정에 영향 X — 키 입력은 BYOK 결제자에
// 한해 applyUserKeysToEnv가 process.env override (lib/user-keys.ts)
//
// yearMonth는 KST(UTC+9) 기준 "YYYY-MM" — 매달 자연 분리되어 cron 없이 reset.

import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions, usageMonthly } from "@/lib/db/schema";

export type UsageKind = "curation" | "tts" | "fulltext";
export type Plan = "free" | "balanced" | "pro" | "byok";

/**
 * 등급별 월 한도. Infinity = 무제한 (DB 카운트 자체 안 함).
 *
 * UsageKind 의미 (service-cleanup Phase B 재해석):
 *   curation = 저널 트렌드 풀 분석 (issues/topic/headline은 카운트 안 함 — 검색 동급)
 *   fulltext = 긴 요약 (/api/summarize/read 호출 — 풀텍스트/abstract source 모두 통합)
 *   tts      = TTS narration 변환
 *
 * Free 한도(2026-05-16~): trend 3 / summary 10 / tts 5
 * Balanced(4,900/월): trend ∞ / summary ∞ / tts 50
 * Pro(9,900/월): trend ∞ / summary ∞ / tts 150
 * BYOK(19,900 1회): 모두 ∞
 */
export const LIMITS: Record<Plan, Record<UsageKind, number>> = {
  free: {
    curation: 3,
    fulltext: 10,
    tts: 5,
  },
  balanced: {
    curation: Number.POSITIVE_INFINITY,
    fulltext: Number.POSITIVE_INFINITY,
    tts: 50,
  },
  pro: {
    curation: Number.POSITIVE_INFINITY,
    fulltext: Number.POSITIVE_INFINITY,
    tts: 150,
  },
  byok: {
    curation: Number.POSITIVE_INFINITY,
    fulltext: Number.POSITIVE_INFINITY,
    tts: Number.POSITIVE_INFINITY,
  },
};

/** @deprecated Phase B에서 LIMITS.free로 일원화. UI 호환을 위해 유지. */
export const FREE_LIMITS = LIMITS.free;

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
 * plan 판정 — 순수 DB 기반 (2026-05-11 변경).
 * 헤더 키 우회 ("byok-effective")는 제거 — 키 입력은 BYOK 결제자만 가능 정책 반영.
 * 관리자(ADMIN_EMAILS)는 자동 BYOK plan으로 — 한도 우회 + BYOK UI 활성.
 */
export async function getPlan(req: Request): Promise<Plan> {
  void req;
  if (!hasDb()) return "free";
  const session = await auth();
  if (!session?.user?.id) return "free";
  // 관리자 우선 체크 — DB 조회보다 빠르고, subscriptions 없어도 BYOK 효과
  if (isAdminEmail(session.user.email)) return "byok";
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);
    const row = rows[0];
    // status='active' (정상) 또는 'cancelled' (해지됐지만 expiresAt까지는 사용 가능)
    if (
      row &&
      (row.status === "active" || row.status === "cancelled") &&
      (row.plan === "pro" || row.plan === "balanced" || row.plan === "byok")
    ) {
      // expiresAt 체크 (만료됐으면 free). BYOK는 expiresAt=null이라 평생 통과.
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
  const planLimit = LIMITS[plan][kind];
  // 무제한(Infinity) tier — DB 카운트도 안 함. balanced/pro의 검색·요약, 모든 BYOK 등.
  if (!Number.isFinite(planLimit)) {
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
      limit: planLimit,
      remaining: planLimit,
      plan,
    };
  }
  // DB 미설정 시 통과 (graceful pass-through — usage 시스템 다운 시 라우트 깨지지 않게)
  if (!hasDb()) {
    return {
      allowed: true,
      current: 0,
      limit: planLimit,
      remaining: planLimit,
      plan,
    };
  }

  const yearMonth = currentYearMonthKST();
  const limit = planLimit;
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

    // 임계 도달 알림 — 80% 첫 진입 시 사용자에게 이메일 1통.
    // current < T && next >= T → "방금 80% 넘어옴". fire-and-forget (await 안 함).
    const threshold = Math.ceil(limit * 0.8);
    if (Number.isFinite(limit) && current < threshold && next >= threshold) {
      void maybeSendQuotaEmail(identityKey, kind, limit - next, limit);
    }

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

  const empty = (kind: UsageKind) => {
    const lim = LIMITS[plan][kind];
    return {
      current: 0,
      limit: lim,
      remaining: lim,
    };
  };

  // tts 한도가 finite인 plan(balanced/pro)도 카운트해야 — Free만 카운트하던 이전과 다름.
  // 모든 finite 한도가 있는 plan은 DB 조회. byok/admin 등 모두 ∞면 빈 snapshot.
  const hasFiniteLimit =
    Number.isFinite(LIMITS[plan].curation) ||
    Number.isFinite(LIMITS[plan].fulltext) ||
    Number.isFinite(LIMITS[plan].tts);

  if (!hasFiniteLimit || !identityKey || !hasDb()) {
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
      const lim = LIMITS[plan][kind];
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
 * 임계 도달 시 사용자에게 이메일 알림. fire-and-forget.
 * identityKey가 user_id(로그인, prefix 없음)일 때만 작동 — anon: prefix면 이메일 없음.
 * email/template import는 lazy (cold start 영향 최소화).
 */
async function maybeSendQuotaEmail(
  identityKey: string,
  kind: UsageKind,
  remaining: number,
  limit: number
): Promise<void> {
  if (identityKey.startsWith("anon:")) return; // 비로그인 사용자는 이메일 없음
  try {
    if (!hasDb()) return;
    const db = getDb();
    const { users } = await import("@/lib/db/schema");
    const row = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, identityKey))
      .limit(1);
    const email = row[0]?.email;
    if (!email) return;

    const { sendEmail } = await import("@/lib/email");
    const { quotaThresholdTemplate } = await import("@/lib/email-templates");
    const tplKind: "summary" | "tts" | "trend" =
      kind === "fulltext"
        ? "summary"
        : kind === "tts"
          ? "tts"
          : "trend";
    const tpl = quotaThresholdTemplate({
      kind: tplKind,
      remaining,
      limit,
      locale: "ko",
    });
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.warn("[usage] quota email failed", err);
  }
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
    curation: "저널 트렌드 분석",
    tts: "TTS 변환",
    fulltext: "요약",
  };
  // tier별 차등 CTA — TTS는 Balanced/Pro로 등급 차이 있음, 그 외는 Balanced 한 번에 무제한.
  const cta = isLoggedIn
    ? kind === "tts"
      ? "Balanced(4,900원/월·TTS 50회) 또는 Pro(9,900원/월·TTS 150회), BYOK(19,900원·평생 + 본인 키 무제한) 중 선택해 업그레이드하세요."
      : "Balanced(4,900원/월) 또는 Pro(9,900원/월)로 업그레이드하면 무제한입니다."
    : "로그인 후 Balanced/Pro 구독 또는 BYOK 결제로 한도를 해제할 수 있습니다.";
  return `이번 달 ${kindLabel[kind]} 한도(${result.limit}회)를 모두 사용했습니다. ${cta}`;
}
