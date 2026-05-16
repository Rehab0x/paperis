// /api/cron/audit-cleanup — admin_audit_log에서 1년 이상 된 row 삭제.
//
// 보존 정책: 1년. 그 이전 row는 자동 삭제 (사용자 수 늘면 cold storage로 대체 검토).
// 매월 1일 KST 자정에 실행 (vercel.json cron).
//
// 보안: CRON_SECRET Bearer 인증 — recurring-billing과 동일.

import { NextResponse } from "next/server";
import { lt } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RETENTION_DAYS = 365;

export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET 미설정" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hasDb()) {
    return NextResponse.json({ error: "DB 미설정" }, { status: 503 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * MS_PER_DAY);

  try {
    const db = getDb();
    const result = await db
      .delete(adminAuditLog)
      .where(lt(adminAuditLog.createdAt, cutoff))
      .returning({ id: adminAuditLog.id });

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      retentionDays: RETENTION_DAYS,
      cutoff: cutoff.toISOString(),
      deleted: result.length,
    });
  } catch (err) {
    console.error("[cron/audit-cleanup] failed", err);
    return NextResponse.json(
      { error: "audit log 정리 실패" },
      { status: 500 }
    );
  }
}
