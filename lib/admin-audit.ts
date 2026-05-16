// 관리자 액션 감사 로그 헬퍼.
//
// admin action 라우트에서 호출 — 인증/권한은 호출자가 이미 검증한 상태 가정.
// graceful: DB 쓰기 실패해도 throw하지 않음 (액션 자체는 성공시키되 로그만 누락).
// 테이블이 아직 push 안 됐을 가능성도 흡수.

import { auth } from "@/auth";
import { getDb, hasDb } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";

export type AdminAuditAction =
  | "plan_change"
  | "subscription_cancel"
  | "user_delete";

export interface AdminAuditDetails {
  /** plan_change에서 사용 */
  fromPlan?: string | null;
  /** plan_change에서 사용 */
  toPlan?: string;
  /** plan_change에서 사용 (balanced/pro) */
  durationDays?: number;
  /** plan_change·cancel에서 사용 */
  expiresAt?: string | null;
  /** 추가 메모 */
  note?: string;
}

interface LogInput {
  action: AdminAuditAction;
  targetUserId: string;
  targetEmail?: string | null;
  details?: AdminAuditDetails;
}

export async function logAdminAction(input: LogInput): Promise<void> {
  if (!hasDb()) return;
  try {
    const session = await auth();
    if (!session?.user?.id) return; // 관리자 검증은 호출자가 했지만 세션 없으면 로그 누락
    const db = getDb();
    await db.insert(adminAuditLog).values({
      adminUserId: session.user.id,
      adminEmail: session.user.email ?? null,
      action: input.action,
      targetUserId: input.targetUserId,
      targetEmail: input.targetEmail ?? null,
      details: input.details ?? {},
    });
  } catch (err) {
    // graceful — 로그 실패가 admin 액션을 막으면 안 됨 (예: 테이블 미존재 시점)
    console.warn("[admin-audit] log failed", err);
  }
}
