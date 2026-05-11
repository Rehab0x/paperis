// /api/account/subscription — 본인 구독 상태 조회 + 해지.
//
// GET: { plan, status, expiresAt, cardNumber, customerKey } — /account 페이지 표시용
// DELETE: 구독 해지 — Pro만. 즉시 권한 회수 X (이미 결제된 당월 끝까지 사용),
//         tossBillingKey만 NULL → cron이 다음 결제일에 자동결제 시도하지 않음.
//
// 카드 변경은 별도 흐름 — /billing에서 다시 requestBillingAuth → /api/billing/issue-billing-key
// 호출하면 billingKey가 새 값으로 upsert. 즉, "카드 변경 = 새 카드로 재인증".

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

export interface SubscriptionDto {
  plan: "byok" | "pro" | null;
  status: "active" | "inactive" | "suspended" | "cancelled" | string;
  expiresAt: string | null;
  hasBillingKey: boolean;
  /** 다음 결제 예정일이 있는 경우. Pro에 해지되지 않은 경우만 표시 */
  nextBillingAt: string | null;
  /** 관리자 권한 (ADMIN_EMAILS env). DB 구독과 별개로 BYOK 효과 */
  admin?: boolean;
}

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json<ApiError>(
      { error: "DB가 설정되지 않았습니다." },
      { status: 503 }
    );
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiError>(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  // 관리자는 DB 구독과 무관하게 BYOK 응답 (실제 구독이 있어도 admin marker 동봉)
  const isAdmin = isAdminEmail(session.user.email);

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      // 구독 없어도 admin이면 BYOK 효과
      const empty: SubscriptionDto = isAdmin
        ? {
            plan: "byok",
            status: "active",
            expiresAt: null,
            hasBillingKey: false,
            nextBillingAt: null,
            admin: true,
          }
        : {
            plan: null,
            status: "inactive",
            expiresAt: null,
            hasBillingKey: false,
            nextBillingAt: null,
          };
      return NextResponse.json(empty);
    }
    // 실제 구독이 있더라도 admin이면 plan을 byok로 끌어올림 (admin은 항상 BYOK 효과)
    const effectivePlan: "byok" | "pro" | null = isAdmin
      ? "byok"
      : ((row.plan as "byok" | "pro" | null) ?? null);
    const dto: SubscriptionDto = {
      plan: effectivePlan,
      status: isAdmin ? "active" : row.status,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      hasBillingKey: Boolean(row.tossBillingKey),
      nextBillingAt:
        row.plan === "pro" && row.status === "active" && row.tossBillingKey
          ? (row.expiresAt?.toISOString() ?? null)
          : null,
      ...(isAdmin ? { admin: true } : {}),
    };
    return NextResponse.json(dto);
  } catch (err) {
    console.error("[account/subscription GET] failed", err);
    return NextResponse.json<ApiError>(
      { error: "구독 정보 조회에 실패했습니다." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  if (!hasDb()) {
    return NextResponse.json<ApiError>(
      { error: "DB가 설정되지 않았습니다." },
      { status: 503 }
    );
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiError>(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json<ApiError>(
        { error: "구독 정보가 없습니다." },
        { status: 404 }
      );
    }
    if (row.plan !== "pro") {
      return NextResponse.json<ApiError>(
        {
          error:
            "Pro 구독만 해지할 수 있습니다. BYOK는 평생 이용권이라 해지가 의미 없습니다.",
        },
        { status: 400 }
      );
    }
    if (row.status === "cancelled") {
      // idempotent — 이미 해지됨
      return NextResponse.json({
        ok: true,
        message: "이미 해지된 구독입니다.",
        expiresAt: row.expiresAt?.toISOString() ?? null,
      });
    }

    // 해지: status='cancelled', billingKey null. expiresAt은 그대로 둬서 그날까지 사용 가능.
    await db
      .update(subscriptions)
      .set({
        status: "cancelled",
        tossBillingKey: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, session.user.id));

    return NextResponse.json({
      ok: true,
      message: row.expiresAt
        ? `${row.expiresAt.toLocaleDateString("ko-KR")}까지 이용 가능합니다.`
        : "구독이 해지되었습니다.",
      expiresAt: row.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[account/subscription DELETE] failed", err);
    return NextResponse.json<ApiError>(
      { error: "구독 해지에 실패했습니다." },
      { status: 500 }
    );
  }
}
