import Link from "next/link";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions, usageMonthly, users } from "@/lib/db/schema";
import { currentYearMonthKST } from "@/lib/usage";
import { getServerLocale, getMessages, fmt } from "@/lib/i18n";

// /admin — 회원 목록. 관리자 layout이 이미 가드.
//
// MVP read-only. 검색(이메일/이름) + 페이지네이션. 액션은 다음 단계.
//
// 사용량 정보는 user 상세 페이지에서 (목록은 행 가벼움 우선).

export const dynamic = "force-dynamic"; // cookies → admin gate
export const revalidate = 0;

const PAGE_SIZE = 50;

type SortMode = "created" | "usage" | "active";

interface Props {
  searchParams: Promise<{ q?: string; page?: string; sort?: string }>;
}

function parseSort(value: string | undefined): SortMode {
  if (value === "usage" || value === "active") return value;
  return "created";
}

export default async function AdminUsersPage({ searchParams }: Props) {
  const locale = await getServerLocale();
  const m = getMessages(locale).app;
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const sort = parseSort(params.sort);
  const pageRaw = Number(params.page);
  const page =
    Number.isInteger(pageRaw) && pageRaw >= 1 ? pageRaw : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const yearMonth = currentYearMonthKST();

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

  // 정렬 — created(가입일) / usage(이번 달 합계 desc) / active(이번 달 updated desc)
  const orderBy =
    sort === "usage"
      ? sql`(COALESCE(${usageMonthly.curationCount}, 0) + COALESCE(${usageMonthly.ttsCount}, 0) + COALESCE(${usageMonthly.fulltextCount}, 0)) DESC, ${users.createdAt} DESC`
      : sort === "active"
        ? sql`${usageMonthly.updatedAt} DESC NULLS LAST, ${users.createdAt} DESC`
        : desc(users.createdAt);

  // 회원 목록 — subscriptions + usage_monthly(이번 달) LEFT JOIN
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
      curationCount: usageMonthly.curationCount,
      ttsCount: usageMonthly.ttsCount,
      fulltextCount: usageMonthly.fulltextCount,
      activityAt: usageMonthly.updatedAt,
    })
    .from(users)
    .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
    .leftJoin(
      usageMonthly,
      and(
        eq(usageMonthly.identityKey, users.id),
        eq(usageMonthly.yearMonth, yearMonth)
      )
    )
    .where(where)
    .orderBy(orderBy)
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

      {/* 검색 — sort 값을 hidden으로 보존해 검색해도 현재 정렬 유지 */}
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
        {sort !== "created" ? (
          <input type="hidden" name="sort" value={sort} />
        ) : null}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
        >
          {m.admin.searchButton}
        </button>
        {q ? (
          <Link
            href={`/admin${sort !== "created" ? `?sort=${sort}` : ""}`}
            className="inline-flex h-9 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
          >
            {m.admin.searchClear}
          </Link>
        ) : null}
      </form>

      {/* 정렬 selector — 검색·페이지 보존 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-paperis-text-3">{m.admin.sortLabel}</span>
        {(["created", "usage", "active"] as SortMode[]).map((s) => {
          const qs = new URLSearchParams();
          if (q) qs.set("q", q);
          if (s !== "created") qs.set("sort", s);
          const href = qs.toString() ? `/admin?${qs}` : "/admin";
          const active = s === sort;
          return (
            <Link
              key={s}
              href={href}
              className={[
                "rounded-full border px-3 py-0.5 transition",
                active
                  ? "border-paperis-accent bg-paperis-accent-dim/40 text-paperis-accent"
                  : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3 hover:text-paperis-text",
              ].join(" ")}
            >
              {m.admin.sortOptions[s]}
            </Link>
          );
        })}
      </div>

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
              <th className="hidden px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.06em] md:table-cell">
                {m.admin.colUsage}
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] lg:table-cell">
                {m.admin.colActivity}
              </th>
              <th className="hidden px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] lg:table-cell">
                {m.admin.colCreated}
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-sm text-paperis-text-3"
                >
                  {m.admin.noUsers}
                </td>
              </tr>
            ) : (
              visible.map((u) => {
                const total =
                  (u.curationCount ?? 0) +
                  (u.ttsCount ?? 0) +
                  (u.fulltextCount ?? 0);
                return (
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
                    <td
                      className="hidden px-3 py-2 text-right tabular-nums md:table-cell"
                      title={`trend ${u.curationCount ?? 0} · summary ${u.fulltextCount ?? 0} · tts ${u.ttsCount ?? 0}`}
                    >
                      {total > 0 ? (
                        <span className="text-paperis-text">{total}</span>
                      ) : (
                        <span className="text-paperis-text-3">—</span>
                      )}
                    </td>
                    <td className="hidden px-3 py-2 text-paperis-text-3 lg:table-cell">
                      {u.activityAt ? formatRelative(u.activityAt, locale) : "—"}
                    </td>
                    <td className="hidden px-3 py-2 text-paperis-text-3 lg:table-cell">
                      {formatDate(u.createdAt, locale)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 — q + sort 보존 */}
      <div className="mt-4 flex items-center justify-between text-xs text-paperis-text-3">
        <div>
          {fmt(m.admin.pageLabel, { page })}
        </div>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link
              href={buildPageHref({ q, sort, page: page - 1 })}
              className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 transition hover:border-paperis-text-3 hover:text-paperis-text"
            >
              {m.admin.prev}
            </Link>
          ) : null}
          {hasMore ? (
            <Link
              href={buildPageHref({ q, sort, page: page + 1 })}
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

function buildPageHref(opts: { q: string; sort: SortMode; page: number }): string {
  const qs = new URLSearchParams();
  if (opts.q) qs.set("q", opts.q);
  if (opts.sort !== "created") qs.set("sort", opts.sort);
  if (opts.page > 1) qs.set("page", String(opts.page));
  const s = qs.toString();
  return s ? `/admin?${s}` : "/admin";
}

function formatRelative(d: Date, locale: "ko" | "en"): string {
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return formatDate(d, locale);
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return locale === "en" ? "just now" : "방금";
  if (min < 60) return locale === "en" ? `${min}m ago` : `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return locale === "en" ? `${hr}h ago` : `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return locale === "en" ? `${day}d ago` : `${day}일 전`;
  return formatDate(d, locale);
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
