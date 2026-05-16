import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/auth";
import AdminUserActions from "@/components/AdminUserActions";
import { getDb, hasDb } from "@/lib/db";
import {
  adminAuditLog,
  subscriptions,
  usageMonthly,
  userJournalAdditions,
  userJournalBlocks,
  userJournalFavorites,
  userSpecialties,
  users,
} from "@/lib/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { currentYearMonthKST, LIMITS, type UsageKind } from "@/lib/usage";
import { getServerLocale, getMessages } from "@/lib/i18n";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminUserDetailPage({ params }: Props) {
  const { id } = await params;
  const locale = await getServerLocale();
  const m = getMessages(locale).app;

  if (!hasDb()) notFound();
  const db = getDb();
  const yearMonth = currentYearMonthKST();

  // 사용자 + 구독 한 번에
  const userRow = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      image: users.image,
      phone: users.phone,
      onboardingDone: users.onboardingDone,
      termsAgreedAt: users.termsAgreedAt,
      marketingAgreed: users.marketingAgreed,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  const user = userRow[0];
  if (!user) notFound();

  const subRow = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, id))
    .limit(1);
  const sub = subRow[0] ?? null;

  // 이번 달 사용량
  const usageRow = await db
    .select()
    .from(usageMonthly)
    .where(
      and(
        eq(usageMonthly.identityKey, id),
        eq(usageMonthly.yearMonth, yearMonth)
      )
    )
    .limit(1);
  const usage = usageRow[0] ?? null;

  // 이 사용자에 대한 최근 audit 기록 (최대 10건) — graceful (테이블 미존재 시 빈 배열)
  let auditRows: (typeof adminAuditLog.$inferSelect)[] = [];
  try {
    auditRows = await db
      .select()
      .from(adminAuditLog)
      .where(eq(adminAuditLog.targetUserId, id))
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(10);
  } catch {
    // 테이블 없음 — 섹션 자체 숨김
  }

  // 임상과·저널 prefs 개수
  const [specCount, blockCount, addCount, favCount] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(userSpecialties)
      .where(eq(userSpecialties.userId, id)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(userJournalBlocks)
      .where(eq(userJournalBlocks.userId, id)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(userJournalAdditions)
      .where(eq(userJournalAdditions.userId, id)),
    db
      .select({ c: sql<number>`count(*)::int` })
      .from(userJournalFavorites)
      .where(eq(userJournalFavorites.userId, id)),
  ]);

  const adminEffect = isAdminEmail(user.email);

  // 등급 판정 — admin 우선 (subscriptions row와 무관)
  type Plan = "free" | "balanced" | "pro" | "byok";
  const effectivePlan: Plan = adminEffect
    ? "byok"
    : sub &&
        (sub.status === "active" || sub.status === "cancelled") &&
        (sub.plan === "byok" || sub.plan === "balanced" || sub.plan === "pro") &&
        (!sub.expiresAt || sub.expiresAt.getTime() > Date.now())
      ? (sub.plan as Plan)
      : "free";

  const planLimits = LIMITS[effectivePlan];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 pb-32">
      <Link
        href="/admin"
        className="inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
      >
        ← {m.admin.backToList}
      </Link>
      <h1 className="mt-2 font-serif text-2xl font-medium tracking-tight text-paperis-text">
        {user.email ?? "(no email)"}
      </h1>
      {adminEffect ? (
        <span className="mt-2 inline-block rounded-full bg-paperis-accent-dim/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paperis-accent">
          Admin (ADMIN_EMAILS)
        </span>
      ) : null}

      {/* Profile */}
      <section className="mt-6 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">{m.admin.profile}</h2>
        <dl className="mt-3 grid gap-2 text-sm text-paperis-text-2 sm:grid-cols-2">
          <Row label={m.admin.fId} value={<code className="text-xs">{user.id}</code>} />
          <Row label={m.admin.fName} value={user.name ?? "—"} />
          <Row label={m.admin.fPhone} value={user.phone ?? "—"} />
          <Row
            label={m.admin.fOnboarding}
            value={user.onboardingDone ? "✓" : "✗"}
          />
          <Row
            label={m.admin.fTerms}
            value={user.termsAgreedAt ? formatDate(user.termsAgreedAt, locale) : "—"}
          />
          <Row label={m.admin.fMarketing} value={user.marketingAgreed ? "✓" : "✗"} />
          <Row label={m.admin.fCreated} value={formatDate(user.createdAt, locale)} />
        </dl>
      </section>

      {/* Subscription */}
      <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">{m.admin.subscription}</h2>
        <dl className="mt-3 grid gap-2 text-sm text-paperis-text-2 sm:grid-cols-2">
          <Row label={m.admin.sEffectivePlan} value={effectivePlan} />
          <Row label={m.admin.sDbPlan} value={sub?.plan ?? "—"} />
          <Row label={m.admin.sStatus} value={sub?.status ?? "—"} />
          <Row
            label={m.admin.sExpires}
            value={sub?.expiresAt ? formatDate(sub.expiresAt, locale) : "—"}
          />
          <Row
            label={m.admin.sBillingKey}
            value={sub?.tossBillingKey ? "✓" : "✗"}
          />
          <Row
            label={m.admin.sCustomerKey}
            value={sub?.tossCustomerKey ? <code className="text-xs">{sub.tossCustomerKey.slice(0, 12)}…</code> : "—"}
          />
        </dl>
      </section>

      {/* Usage this month */}
      <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.admin.usageThisMonth}
          <span className="ml-2 text-xs font-normal text-paperis-text-3">
            ({yearMonth} KST)
          </span>
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <UsageBlock kind="curation" label={m.admin.uTrend} usage={usage} limits={planLimits} />
          <UsageBlock kind="fulltext" label={m.admin.uSummary} usage={usage} limits={planLimits} />
          <UsageBlock kind="tts" label={m.admin.uTts} usage={usage} limits={planLimits} />
        </div>
      </section>

      {/* Personalization */}
      <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">{m.admin.personalization}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBlock label={m.admin.pSpecialties} value={specCount[0]?.c ?? 0} />
          <StatBlock label={m.admin.pFavorites} value={favCount[0]?.c ?? 0} />
          <StatBlock label={m.admin.pAdditions} value={addCount[0]?.c ?? 0} />
          <StatBlock label={m.admin.pBlocks} value={blockCount[0]?.c ?? 0} />
        </div>
      </section>

      {/* 이 사용자에 대한 audit 기록 (최근 10건) — 0건이면 섹션 자체 표시하되 빈 상태 */}
      {auditRows.length > 0 ? (
        <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-paperis-text">
              {m.admin.userAuditTitle}
            </h2>
            <Link
              href={`/admin/audit?target=${encodeURIComponent(id)}`}
              className="text-xs text-paperis-text-3 transition hover:text-paperis-accent"
            >
              {m.admin.userAuditViewAll}
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-xs">
            {auditRows.map((r) => {
              const obj =
                r.details && typeof r.details === "object"
                  ? (r.details as Record<string, unknown>)
                  : {};
              const detailParts: string[] = [];
              if (obj.fromPlan !== undefined && obj.toPlan !== undefined) {
                detailParts.push(`${obj.fromPlan ?? "free"} → ${obj.toPlan}`);
              }
              if (obj.durationDays)
                detailParts.push(`${obj.durationDays}일`);
              if (obj.note) detailParts.push(String(obj.note));
              return (
                <li
                  key={r.id}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-l-2 border-paperis-border pl-3"
                >
                  <span className="text-paperis-text-3 tabular-nums">
                    {formatDate(r.createdAt, locale)}
                  </span>
                  <span className="font-medium text-paperis-text">
                    {(m.admin.auditActions as Record<string, string>)[r.action] ?? r.action}
                  </span>
                  <span className="text-paperis-text-3">
                    by {r.adminEmail ?? r.adminUserId.slice(0, 8) + "…"}
                  </span>
                  {detailParts.length > 0 ? (
                    <span className="text-paperis-text-2">
                      · {detailParts.join(" · ")}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* 관리자 액션 — Plan 변경 / 해지 / 삭제 */}
      <AdminActionsWrapper
        userId={user.id}
        userEmail={user.email}
        effectivePlan={effectivePlan}
        hasActiveSub={
          sub?.plan === "pro" || sub?.plan === "balanced"
            ? sub.status === "active" || sub.status === "cancelled"
            : false
        }
      />
    </main>
  );
}

async function AdminActionsWrapper({
  userId,
  userEmail,
  effectivePlan,
  hasActiveSub,
}: {
  userId: string;
  userEmail: string | null;
  effectivePlan: "free" | "balanced" | "pro" | "byok";
  hasActiveSub: boolean;
}) {
  // 본인 계정 보호 — admin이 자기 자신 페이지 보고 있으면 삭제 disable
  const session = await auth();
  const isSelf = session?.user?.id === userId;
  return (
    <AdminUserActions
      userId={userId}
      userEmail={userEmail}
      currentPlan={effectivePlan}
      hasActiveSub={hasActiveSub}
      isSelf={isSelf}
    />
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-3 border-b border-paperis-border/40 py-1 last:border-0">
      <dt className="w-28 shrink-0 text-paperis-text-3">{label}</dt>
      <dd className="min-w-0 flex-1 break-all">{value}</dd>
    </div>
  );
}

function StatBlock({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-paperis-border bg-paperis-surface p-3">
      <div className="text-xs text-paperis-text-3">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums text-paperis-text">
        {value}
      </div>
    </div>
  );
}

function UsageBlock({
  kind,
  label,
  usage,
  limits,
}: {
  kind: UsageKind;
  label: string;
  usage: {
    curationCount: number;
    ttsCount: number;
    fulltextCount: number;
  } | null;
  limits: Record<UsageKind, number>;
}) {
  const cur =
    usage == null
      ? 0
      : kind === "curation"
        ? usage.curationCount
        : kind === "tts"
          ? usage.ttsCount
          : usage.fulltextCount;
  const lim = limits[kind];
  const isInf = !Number.isFinite(lim);
  const ratio = isInf ? 0 : Math.min(1, cur / lim);
  return (
    <div className="rounded-lg border border-paperis-border bg-paperis-surface p-3">
      <div className="text-xs text-paperis-text-3">{label}</div>
      <div className="mt-1 text-base font-semibold tabular-nums text-paperis-text">
        {isInf ? `${cur} / ∞` : `${cur} / ${lim}`}
      </div>
      {!isInf ? (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-paperis-border">
          <div
            className={`h-full ${ratio >= 1 ? "bg-paperis-accent" : "bg-paperis-accent/70"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      ) : null}
    </div>
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
