import Link from "next/link";
import { desc, ilike, or, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { getServerLocale, getMessages, fmt } from "@/lib/i18n";

// /admin — 회원 목록. 관리자 layout이 이미 가드.
//
// MVP read-only. 검색(이메일/이름) + 페이지네이션. 액션은 다음 단계.
//
// 사용량 정보는 user 상세 페이지에서 (목록은 행 가벼움 우선).

export const dynamic = "force-dynamic"; // cookies → admin gate
export const revalidate = 0;

const PAGE_SIZE = 50;

interface Props {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const locale = await getServerLocale();
  const m = getMessages(locale).app;
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const pageRaw = Number(params.page);
  const page =
    Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const offset = (page - 1) * PAGE_SIZE;

  if (!hasDb()) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32">
        <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {m.admin.dbMissing}
        </div>
      </main>
    );
  }

  const db = getDb();
  const where = q
    ? or(
        ilike(users.email, `%${q}%`),
        ilike(users.name, `%${q}%`)
      )
    : undefined;

  // 회원 목록 — subscriptions LEFT JOIN으로 plan/status 보강
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      onboardingDone: users.onboardingDone,
      phone: users.phone,
      plan: subscriptions.plan,
      status: subscriptions.status,
      expiresAt: subscriptions.expiresAt,
    })
    .from(users)
    .leftJoin(subscriptions, sql`${subscriptions.userId} = ${users.id}`)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(PAGE_SIZE + 1)
    .offset(offset);

  const hasMore = rows.length > PAGE_SIZE;
  const visible = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32">
      <h1 className="font-serif text-3xl font-medium tracking-tight text-paperis-text">
        {m.admin.usersTitle}
      </h1>
      <p className="mt-1 text-sm text-paperis-text-2">
        {fmt(m.admin.usersIntro, {
          count: visible.length,
          page,
        })}
      </p>

      {/* 검색 */}
      <form
        method="get"
        className="mt-6 flex items-center gap-2"
        action="/admin"
      >
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={m.admin.searchPlaceholder}
          className="min-w-0 flex-1 rounded-lg border border-paperis-border bg-paperis-surface px-3 py-2 text-sm text-paperis-text"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
        >
          {m.admin.searchButton}
        </button>
        {q ? (
          <Link
            href="/admin"
            className="inline-flex h-9 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
          >
            {m.admin.searchClear}
          </Link>
        ) : null}
      </form>

      {/* 목록 */}
      <div className="mt-4 overflow-hidden rounded-xl border border-paperis-border">
        <table className="w-full text-sm">
          <thead className="bg-paperis-surface-2 text-paperis-text-3">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                {m.admin.colEmail}
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] sm:table-cell">
                {m.admin.colName}
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]">
                {m.admin.colPlan}
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] md:table-cell">
                {m.admin.colCreated}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-8 text-center text-sm text-paperis-text-3"
                >
                  {m.admin.noUsers}
                </td>
              </tr>
            ) : (
              visible.map((u) => (
                <tr
                  key={u.id}
                  className="border-t border-paperis-border bg-paperis-surface hover:bg-paperis-surface-2"
                >
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="text-paperis-text underline-offset-2 hover:text-paperis-accent hover:underline"
                    >
                      {u.email ?? "(no email)"}
                    </Link>
                    {!u.onboardingDone ? (
                      <span className="ml-2 rounded-full bg-paperis-accent-dim/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paperis-accent">
                        {m.admin.tagOnboarding}
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-3 py-2 text-paperis-text-2 sm:table-cell">
                    {u.name ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <PlanBadge plan={u.plan} status={u.status} expiresAt={u.expiresAt} />
                  </td>
                  <td className="hidden px-3 py-2 text-paperis-text-3 md:table-cell">
                    {formatDate(u.createdAt, locale)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      <div className="mt-4 flex items-center justify-between text-xs text-paperis-text-3">
        <div>
          {fmt(m.admin.pageLabel, { page })}
        </div>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={`/admin?${new URLSearchParams({ q, page: String(page - 1) }).toString()}`}
              className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 transition hover:border-paperis-text-3 hover:text-paperis-text"
            >
              {m.admin.prev}
            </Link>
          ) : null}
          {hasMore ? (
            <Link
              href={`/admin?${new URLSearchParams({ q, page: String(page + 1) }).toString()}`}
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

function PlanBadge({
  plan,
  status,
  expiresAt,
}: {
  plan: string | null;
  status: string | null;
  expiresAt: Date | null;
}) {
  if (!plan) {
    return (
      <span className="rounded-full bg-paperis-surface-2 px-2 py-0.5 text-[11px] text-paperis-text-3">
        free
      </span>
    );
  }
  const expired =
    expiresAt && expiresAt.getTime() < Date.now()
      ? true
      : false;
  const effectivePlan = expired ? "free" : plan;
  const isPaid =
    !expired && (plan === "pro" || plan === "balanced" || plan === "byok");
  return (
    <span
      className={[
        "rounded-full px-2 py-0.5 text-[11px] font-medium",
        isPaid
          ? "bg-paperis-accent-dim/60 text-paperis-accent"
          : "bg-paperis-surface-2 text-paperis-text-3",
      ].join(" ")}
    >
      {effectivePlan}
      {status && status !== "active" && !expired ? ` · ${status}` : ""}
    </span>
  );
}

function formatDate(d: Date | null, locale: "ko" | "en"): string {
  if (!d) return "—";
  try {
    return d.toLocaleDateString(locale === "en" ? "en-US" : "ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}
