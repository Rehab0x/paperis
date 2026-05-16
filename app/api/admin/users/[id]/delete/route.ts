// /api/admin/users/[id]/delete — 관리자가 사용자 계정을 강제 삭제.
//
// 본인 삭제(/api/account/delete)와 동일 로직 — 단 관리자가 다른 사용자 ID 지정.
// FK cascade로 accounts/sessions/userSpecialties/userJournal{Blocks,Additions,
// Favorites}/subscriptions 자동 삭제. usage_monthly는 수동.
//
// 안전장치: ADMIN_EMAILS에 들어 있는 본인 계정 삭제는 거부 (관리자 lockout 방지).
// 다른 관리자 계정 삭제는 허용 (의도된 권한 회수일 수 있음).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { isAdminEmail, isCurrentUserAdmin } from "@/lib/admin";
import { getDb, hasDb } from "@/lib/db";
import { usageMonthly, users } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

export async function DELETE(
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
    // 본인 lockout 방지 — 관리자가 자기 자신을 admin 페이지에서 삭제 시도하면 거부
    const session = await auth();
    if (session?.user?.id === id) {
      return NextResponse.json<ApiError>(
        {
          error:
            "본인 계정은 admin 페이지에서 삭제할 수 없습니다. 일반 /account 페이지의 계정 해지를 이용해 주세요.",
        },
        { status: 400 }
      );
    }

    // 대상 사용자 존재 확인 + 이메일 로깅용
    const target = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!target[0]) {
      return NextResponse.json<ApiError>(
        { error: "사용자가 없습니다." },
        { status: 404 }
      );
    }

    await db.delete(usageMonthly).where(eq(usageMonthly.identityKey, id));
    await db.delete(users).where(eq(users.id, id));

    console.warn("[admin/users/delete] deleted", {
      deletedId: id,
      deletedEmail: target[0].email,
      byAdminEmail: session?.user?.email,
      wasAdmin: isAdminEmail(target[0].email),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/users/delete] failed", { id }, err);
    return NextResponse.json<ApiError>(
      { error: "계정 삭제에 실패했습니다." },
      { status: 500 }
    );
  }
}
