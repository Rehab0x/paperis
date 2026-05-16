import Link from "next/link";
import { count, eq, gte, sql } from "drizzle-orm";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions, usageMonthly, users } from "@/lib/db/schema";
import { currentYearMonthKST } from "@/lib/usage";
import { getServerLocale, getMessages, fmt } from "@/lib/i18n";

// /admin/metrics — 가입/구독/활동 요약 + 최근 30일 일별 가입 추세.
// MVP "라이트 코호트" — 진짜 retention/cohort는 first-activity timestamp가 필요.
// 현재 가능한 범위에서 운영 의사결정에 유용한 숫자만.

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TREND_DAYS = 30;

export default async function AdminMetricsPage() {
  const locale = await getServerLocale();
  const m = getMessages(locale).app;

  if (!hasDb()) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-32">
        <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {m.admin.dbMissing}
        </div>
      </main>
    );
  }

  const db = getDb();
  const yearMonth = currentYearMonthKST();
  const now = new Date();
  const week = new Date(now.getTime() - 7 * MS_PER_DAY);
  const month = new Date(now.getTime() - 30 * MS_PER_DAY);

  // 병렬 쿼리
  const [
    totalUsersRow,
    onboardedRow,
    newWeekRow,
    newMonthRow,
    planBreakdown,
    activeUsersThisMonthRow,
    usageTotalsThisMonthRow,
    signupTrend,
  ] = await Promise.all([
    db.select({ c: count() }).from(users),
    db
      .select({ c: count() })
      .from(users)
      .where(eq(users.onboardingDone, true)),
    db.select({ c: count() }).from(users).where(gte(users.createdAt, week)),
    db.select({ c: count() }).from(users).where(gte(users.createdAt, month)),
    db
      .select({
        plan: subscriptions.plan,
        status: subscriptions.status,
        c: count(),
      })
      .from(subscriptions)
      .groupBy(subscriptions.plan, subscriptions.status),
    db
      .select({ c: count() })
      .from(usageMonthly)
      .where(eq(usageMonthly.yearMonth, yearMonth)),
    db
      .select({
        curation: sql<number>`COALESCE(SUM(${usageMonthly.curationCount}), 0)::int`,
        tts: sql<number>`COALESCE(SUM(${usageMonthly.ttsCount}), 0)::int`,
        fulltext: sql<number>`COALESCE(SUM(${usageMonthly.fulltextCount}), 0)::int`,
      })
      .from(usageMonthly)
      .where(eq(usageMonthly.yearMonth, yearMonth)),
    db
      .select({
        day: sql<string>`to_char(${users.createdAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`,
        c: sql<number>`count(*)::int`,
      })
      .from(users)
      .where(gte(users.createdAt, new Date(now.getTime() - TREND_DAYS * MS_PER_DAY)))
      .groupBy(sql`to_char(${users.createdAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${users.createdAt} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') ASC`),
  ]);

  const totalUsers = totalUsersRow[0]?.c ?? 0;
  const onboarded = onboardedRow[0]?.c ?? 0;
  const newWeek = newWeekRow[0]?.c ?? 0;
  const newMonth = newMonthRow[0]?.c ?? 0;
  const activeThisMonth = activeUsersThisMonthRow[0]?.c ?? 0;
  const totalsThisMonth = usageTotalsThisMonthRow[0] ?? {
    curation: 0,
    tts: 0,
    fulltext: 0,
  };

  // Plan breakdown — active/cancelled만 유효, 나머지는 free 취급
  const planCounts = { byok: 0, pro: 0, balanced: 0 };
  let cancelledMonthly = 0;
  let suspendedMonthly = 0;
  for (const row of planBreakdown) {
    if (row.plan === "byok" && (row.status === "active" || row.status === "cancelled")) {
      planCounts.byok += row.c;
    } else if (
      (row.plan === "pro" || row.plan === "balanced") &&
      row.status === "active"
    ) {
      planCounts[row.plan as "pro" | "balanced"] += row.c;
    } else if (
      (row.plan === "pro" || row.plan === "balanced") &&
      row.status === "cancelled"
    ) {
      cancelledMonthly += row.c;
    } else if (row.status === "suspended") {
      suspendedMonthly += row.c;
    }
  }
  const paidSubscribers = planCounts.byok + planCounts.pro + planCounts.balanced;
  const conversionPct =
    totalUsers > 0 ? ((paidSubscribers / totalUsers) * 100).toFixed(1) : "0.0";
  const activePct =
    totalUsers > 0 ? ((activeThisMonth / totalUsers) * 100).toFixed(1) : "0.0";

  // 일별 signup — 30일치 dense 배열로 변환 (missing day = 0)
  const trendMap = new Map(signupTrend.map((r) => [r.day, r.c]));
  const dailyTrend: { day: string; count: number }[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * MS_PER_DAY);
    const day = ymdKst(d);
    dailyTrend.push({ day, count: trendMap.get(day) ?? 0 });
  }
  const maxDaily = Math.max(1, ...dailyTrend.map((t) => t.count));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 pb-32">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-medium tracking-tight text-paperis-text">
          {m.admin.metricsTitle}
        </h1>
        <Link
          href="/admin"
          className="inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
        >
          ← {m.admin.backToList}
        </Link>
      </div>
      <p className="mt-1 text-sm text-paperis-text-2">
        {fmt(m.admin.metricsIntro, { yearMonth })}
      </p>

      {/* 사용자 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.admin.metricsUsers}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBlock label={m.admin.metricsTotalUsers} value={totalUsers} />
          <StatBlock label={m.admin.metricsOnboarded} value={onboarded} />
          <StatBlock label={m.admin.metricsNewWeek} value={newWeek} />
          <StatBlock label={m.admin.metricsNewMonth} value={newMonth} />
        </div>
      </section>

      {/* 구독 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.admin.metricsSubs}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBlock label="BYOK" value={planCounts.byok} accent />
          <StatBlock label="Pro" value={planCounts.pro} accent />
          <StatBlock label="Balanced" value={planCounts.balanced} accent />
          <StatBlock
            label={m.admin.metricsConversion}
            value={`${paidSubscribers} (${conversionPct}%)`}
          />
        </div>
        {cancelledMonthly > 0 || suspendedMonthly > 0 ? (
          <p className="mt-2 text-xs text-paperis-text-3">
            {fmt(m.admin.metricsSubsHint, {
              cancelled: cancelledMonthly,
              suspended: suspendedMonthly,
            })}
          </p>
        ) : null}
      </section>

      {/* 활동 */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.admin.metricsActivity}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBlock
            label={m.admin.metricsActiveThisMonth}
            value={`${activeThisMonth} (${activePct}%)`}
          />
          <StatBlock label={m.admin.uTrend} value={totalsThisMonth.curation} />
          <StatBlock label={m.admin.uSummary} value={totalsThisMonth.fulltext} />
          <StatBlock label={m.admin.uTts} value={totalsThisMonth.tts} />
        </div>
        <div className="mt-2 text-xs text-paperis-text-3">
          <Link
            href="/admin?sort=usage"
            className="underline hover:text-paperis-accent"
          >
            {m.admin.metricsTopUsers}
          </Link>
          {" · "}
          <Link
            href="/admin?sort=active"
            className="underline hover:text-paperis-accent"
          >
            {m.admin.metricsActiveUsers}
          </Link>
        </div>
      </section>

      {/* 신규 가입 추세 (최근 30일) */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-paperis-text">
          {fmt(m.admin.metricsSignupTrend, { days: TREND_DAYS })}
        </h2>
        <div className="mt-3 rounded-xl border border-paperis-border bg-paperis-surface p-4">
          <div className="flex h-32 items-end gap-1">
            {dailyTrend.map((t) => {
              const heightPct = (t.count / maxDaily) * 100;
              return (
                <div
                  key={t.day}
                  className="group relative flex-1"
                  title={`${t.day}: ${t.count}`}
                >
                  <div
                    className={[
                      "w-full rounded-t transition",
                      t.count > 0
                        ? "bg-paperis-accent"
                        : "bg-paperis-surface-2",
                    ].join(" ")}
                    style={{
                      height: `${Math.max(heightPct, t.count > 0 ? 4 : 2)}%`,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-paperis-text-3">
            <span>{dailyTrend[0]?.day}</span>
            <span>
              max {maxDaily}/{m.admin.metricsDay}
            </span>
            <span>{dailyTrend[dailyTrend.length - 1]?.day}</span>
          </div>
        </div>
      </section>
    </main>
  );
}

function StatBlock({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-paperis-border bg-paperis-surface p-3">
      <div className="text-xs text-paperis-text-3">{label}</div>
      <div
        className={[
          "mt-1 text-xl font-semibold tabular-nums",
          accent ? "text-paperis-accent" : "text-paperis-text",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

/** KST YYYY-MM-DD */
function ymdKst(d: Date): string {
  const ms = d.getTime() + 9 * 60 * 60 * 1000;
  const k = new Date(ms);
  const y = k.getUTCFullYear();
  const mo = (k.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = k.getUTCDate().toString().padStart(2, "0");
  return `${y}-${mo}-${dd}`;
}
