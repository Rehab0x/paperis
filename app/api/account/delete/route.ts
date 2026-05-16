// /api/account/delete — 본인 계정 영구 삭제.
//
// 삭제 대상:
//   - users (FK cascade: accounts/sessions/userSpecialties/userJournal{Blocks,
//     Additions,Favorites}/subscriptions 자동 삭제)
//   - usage_monthly (FK 없음 — identityKey 매칭 수동 삭제)
//
// 영향:
//   - Pro/Balanced 자동결제: subscriptions row 삭제 → cron이 더 이상 안 잡음.
//     Toss 빌링키는 우리 쪽 row 없으니 dormant 상태로 남음 (별도 invalidation 없음).
//   - BYOK 평생 권한: 환불 불가 (사용자 명시 동의 필요).
//
// 인증된 사용자 본인만 자기 자신을 삭제. 호출 후 클라가 signOut + 리다이렉트.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, hasDb } from "@/lib/db";
import { usageMonthly, users } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

export async function POST() {
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
  const userId = session.user.id;

  try {
    const db = getDb();
    // usage_monthly는 FK 없으므로 수동 삭제
    await db.delete(usageMonthly).where(eq(usageMonthly.identityKey, userId));
    // user 삭제 → FK cascade로 accounts/sessions/specialties/blocks/additions/favorites/subscriptions 모두 자동 삭제
    await db.delete(users).where(eq(users.id, userId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[account/delete] failed", { userId }, err);
    return NextResponse.json<ApiError>(
      { error: "계정 삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." },
      { status: 500 }
    );
  }
}
