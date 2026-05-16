// /api/admin/audit/export — admin audit log를 CSV로 다운로드.
//
// /admin/audit과 같은 필터(action/target) 지원. 최대 10000건 일괄 (메모리 안전).
// CSV 형식: createdAt, action, adminEmail, adminUserId, targetEmail, targetUserId, details(JSON)

import { and, desc, eq, type SQL } from "drizzle-orm";
import { isCurrentUserAdmin } from "@/lib/admin";
import { getDb, hasDb } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";

export const runtime = "nodejs";

const MAX_ROWS = 10000;
const VALID_ACTIONS = [
  "plan_change",
  "subscription_cancel",
  "user_delete",
] as const;

export async function GET(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return new Response("관리자만 접근할 수 있습니다.", { status: 404 });
  }
  if (!hasDb()) {
    return new Response("DB가 설정되지 않았습니다.", { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const actionRaw = searchParams.get("action");
  const action =
    actionRaw && (VALID_ACTIONS as readonly string[]).includes(actionRaw)
      ? actionRaw
      : null;
  const target = (searchParams.get("target") ?? "").trim() || null;

  const conds: SQL[] = [];
  if (action) conds.push(eq(adminAuditLog.action, action));
  if (target) conds.push(eq(adminAuditLog.targetUserId, target));
  const where = conds.length > 0 ? and(...conds) : undefined;

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(adminAuditLog)
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(MAX_ROWS);

    const header = [
      "createdAt",
      "action",
      "adminEmail",
      "adminUserId",
      "targetEmail",
      "targetUserId",
      "details",
    ];
    const csv =
      header.join(",") +
      "\n" +
      rows
        .map((r) =>
          [
            r.createdAt?.toISOString() ?? "",
            r.action,
            r.adminEmail ?? "",
            r.adminUserId,
            r.targetEmail ?? "",
            r.targetUserId,
            JSON.stringify(r.details ?? {}),
          ]
            .map(csvCell)
            .join(",")
        )
        .join("\n");

    const filenameSuffix = [
      action ? `action-${action}` : null,
      target ? `target-${target.slice(0, 8)}` : null,
    ]
      .filter(Boolean)
      .join("-");
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `paperis-audit${filenameSuffix ? "-" + filenameSuffix : ""}-${ts}.csv`;

    // UTF-8 BOM 추가 — Excel이 CSV 열 때 한글 깨짐 회피
    const bom = "﻿";
    return new Response(bom + csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("[admin/audit/export] failed", err);
    return new Response("Export 실패", { status: 500 });
  }
}

/** CSV 셀 escape — 콤마/따옴표/개행 포함 시 따옴표로 감싸고 내부 따옴표는 이중화. */
function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
