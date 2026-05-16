import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { adminAuditLog } from "@/lib/db/schema";
import { getServerLocale, getMessages, fmt } from "@/lib/i18n";

// /admin/audit — 관리자 액션 감사 로그 (read-only).
// adminAuditLog 테이블 desc(createdAt) 최근 100건.
// 테이블이 아직 push 안 됐을 가능성 — try/catch graceful.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 100;

interface Props {
  searchParams: Promise<{ page?: string }>;
}

export default async function AdminAuditPage({ searchParams }: Props) {
  const locale = await getServerLocale();
  const m = getMessages(locale).app;
  const params = await searchParams;
  const pageRaw = Number(params.page);
  const page =
    Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const offset = (page - 1) * PAGE_SIZE;

  if (!hasDb()) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-32">
        <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {m.admin.dbMissing}
        </div>
      </main>
    );
  }

  // 그레이스풀 — 테이블 미존재 시 빈 목록 fallback
  let rows: (typeof adminAuditLog.$inferSelect)[] = [];
  let tableMissing = false;
  try {
    const db = getDb();
    rows = await db
      .select()
      .from(adminAuditLog)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(PAGE_SIZE + 1)
      .offset(offset);
  } catch (err) {
    console.warn("[admin/audit] query failed", err);
    tableMissing = true;
  }

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-32">
      <Link
        href="/admin"
        className="inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
      >
        ← {m.admin.backToList}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-medium tracking-tight text-paperis-text">
        {m.admin.auditTitle}
      </h1>
      <p className="mt-1 text-sm text-paperis-text-2">
        {m.admin.auditIntro}
      </p>

      {tableMissing ? (
        <div className="mt-6 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {m.admin.auditTableMissing}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-paperis-border">
        <table className="w-full text-sm">
          <thead className="bg-paperis-surface-2 text-paperis-text-3">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                {m.admin.auditAt}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                {m.admin.auditAction}
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] sm:table-cell">
                {m.admin.auditAdmin}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                {m.admin.auditTarget}
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] md:table-cell">
                {m.admin.auditDetails}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-8 text-center text-sm text-paperis-text-3"
                >
                  {m.admin.auditEmpty}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-paperis-border bg-paperis-surface hover:bg-paperis-surface-2"
                >
                  <td className="px-3 py-2 text-paperis-text-3">
                    {formatDateTime(r.createdAt, locale)}
                  </td>
                  <td className="px-3 py-2">
                    <ActionBadge action={r.action} m={m} />
                  </td>
                  <td className="hidden px-3 py-2 text-paperis-text-2 sm:table-cell">
                    {r.adminEmail ?? r.adminUserId.slice(0, 8) + "…"}
                  </td>
                  <td className="px-3 py-2 text-paperis-text">
                    <Link
                      href={`/admin/users/${r.targetUserId}`}
                      className="underline-offset-2 hover:text-paperis-accent hover:underline"
                    >
                      {r.targetEmail ?? r.targetUserId.slice(0, 8) + "…"}
                    </Link>
                  </td>
                  <td className="hidden px-3 py-2 text-xs text-paperis-text-3 md:table-cell">
                    <DetailsCell details={r.details} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="mt-4 flex items-center justify-between text-xs text-paperis-text-3">
        <div>{fmt(m.admin.pageLabel, { page })}</div>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/admin/audit?page=${page - 1}`}
              className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 transition hover:border-paperis-text-3 hover:text-paperis-text"
            >
              {m.admin.prev}
            </Link>
          ) : null}
          {hasMore ? (
            <Link
              href={`/admin/audit?page=${page + 1}`}
              className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 transition hover:border-paperis-text-3 hover:text-paperis-text"
            >
              {m.admin.next}
            </Link>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function ActionBadge({
  action,
  m,
}: {
  action: string;
  m: { admin: { auditActions: Record<string, string> } };
}) {
  const label = m.admin.auditActions[action] ?? action;
  const tone =
    action === "user_delete"
      ? "bg-paperis-accent-dim/60 text-paperis-accent"
      : action === "plan_change"
        ? "bg-paperis-accent-dim/40 text-paperis-accent"
        : "bg-paperis-surface-2 text-paperis-text-2";
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}
    >
      {label}
    </span>
  );
}

function DetailsCell({ details }: { details: unknown }) {
  if (!details || typeof details !== "object") return <span>—</span>;
  const obj = details as Record<string, unknown>;
  const parts: string[] = [];
  if (obj.fromPlan !== undefined && obj.toPlan !== undefined) {
    parts.push(`${obj.fromPlan ?? "free"} → ${obj.toPlan}`);
  } else if (obj.fromPlan !== undefined) {
    parts.push(`from ${obj.fromPlan}`);
  }
  if (obj.durationDays) parts.push(`${obj.durationDays}일`);
  if (obj.note) parts.push(String(obj.note));
  return <span>{parts.length > 0 ? parts.join(" · ") : "—"}</span>;
}

function formatDateTime(d: Date | null, locale: "ko" | "en"): string {
  if (!d) return "—";
  try {
    return d.toLocaleString(locale === "en" ? "en-US" : "ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}
