// /api/admin/users/[id]/cancel — 관리자가 사용자 구독을 강제 해지.
//
// POST: status='cancelled', tossBillingKey=null. expiresAt은 그대로 둬 잔여 권한 보호.
// 단순 사용자 본인 해지(/api/account/subscription DELETE)와 동일 효과 — 관리자가 본인 대신.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json<ApiError>(
      { error: "관리자만 접근할 수 있습니다." },
      { status: 404 }
    );
  }
  if (!hasDb()) {
    return NextResponse.json<ApiError>(
      { error: "DB가 설정되지 않았습니다." },
      { status: 503 }
    );
  }
  const { id } = await ctx.params;

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, id))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return NextResponse.json<ApiError>(
        { error: "구독 정보가 없습니다." },
        { status: 404 }
      );
    }
    if (row.plan !== "pro" && row.plan !== "balanced") {
      return NextResponse.json<ApiError>(
        { error: "월 구독(Balanced/Pro)만 해지할 수 있습니다." },
        { status: 400 }
      );
    }
    await db
      .update(subscriptions)
      .set({
        status: "cancelled",
        tossBillingKey: null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, id));
    return NextResponse.json({
      ok: true,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[admin/users/cancel] failed", { id }, err);
    return NextResponse.json<ApiError>(
      { error: "구독 해지에 실패했습니다." },
      { status: 500 }
    );
  }
}
