// /api/admin/users/[id]/plan — 관리자가 사용자 plan을 강제 변경.
//
// PATCH body: { plan: "free" | "balanced" | "pro" | "byok", durationDays?: number }
//   - free: subscriptions row 삭제 (clean slate)
//   - balanced/pro: status='active', expiresAt = now + durationDays(default 30)
//   - byok: status='active', expiresAt=null (평생)
//
// Toss 빌링키는 건드리지 않음 — 단순 권한 기록 변경. 실제 결제 없이 comp/grant 용도.
// expiresAt 도래 시 cron이 billingKey 없으면 skip → 자동 만료.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface PatchBody {
  plan?: unknown;
  durationDays?: unknown;
}

export async function PATCH(
  req: Request,
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
  if (!id) {
    return NextResponse.json<ApiError>(
      { error: "사용자 ID가 필요합니다." },
      { status: 400 }
    );
  }

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const plan = body.plan;
  if (
    plan !== "free" &&
    plan !== "balanced" &&
    plan !== "pro" &&
    plan !== "byok"
  ) {
    return NextResponse.json<ApiError>(
      { error: "plan은 free / balanced / pro / byok 중 하나여야 합니다." },
      { status: 400 }
    );
  }
  const durationDaysRaw = Number(body.durationDays);
  const durationDays =
    Number.isFinite(durationDaysRaw) && durationDaysRaw > 0
      ? Math.floor(durationDaysRaw)
      : 30;

  try {
    const db = getDb();
    if (plan === "free") {
      // free = subscriptions row 삭제 (없으면 noop)
      await db.delete(subscriptions).where(eq(subscriptions.userId, id));
      return NextResponse.json({ ok: true, plan: "free" });
    }

    const expiresAt =
      plan === "byok"
        ? null
        : new Date(Date.now() + durationDays * MS_PER_DAY);
    const now = new Date();

    // upsert — 기존 row 있으면 update, 없으면 insert
    await db
      .insert(subscriptions)
      .values({
        userId: id,
        plan,
        status: "active",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          plan,
          status: "active",
          expiresAt,
          updatedAt: now,
        },
      });
    return NextResponse.json({
      ok: true,
      plan,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[admin/users/plan] failed", { id, plan }, err);
    return NextResponse.json<ApiError>(
      { error: "Plan 변경에 실패했습니다." },
      { status: 500 }
    );
  }
}
