// /account — 계정 + 구독 관리.
// - 사용자 기본 정보
// - 구독 상태 (BYOK / Pro / Free)
// - Pro 해지 / 카드 변경
// - 사용량 잔여 (이번 달)

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { SubscriptionDto } from "@/app/api/account/subscription/route";
import { useAppMessages } from "@/components/useAppMessages";
import { useLocale } from "@/components/useLocale";
import { fmt } from "@/lib/i18n";
import type { UsageSnapshot } from "@/lib/usage";

const FEATURE_AUTH = process.env.NEXT_PUBLIC_FEATURE_AUTH === "1";

export default function AccountPage() {
  const m = useAppMessages();
  const locale = useLocale();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 계정 해지 — 2단계 확인 (warn 노출 → 최종 버튼 → 실제 삭제)
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subRes, usageRes] = await Promise.all([
        fetch("/api/account/subscription"),
        fetch("/api/account/usage"),
      ]);
      if (subRes.ok) setSub((await subRes.json()) as SubscriptionDto);
      if (usageRes.ok) setUsage((await usageRes.json()) as UsageSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.account.queryFailed);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void reload();
  }, [status, reload]);

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const text = await res.text();
        let msg = m.account.deleteFailed;
        try {
          const obj = JSON.parse(text) as { error?: string };
          if (obj.error) msg = obj.error;
        } catch {}
        throw new Error(msg);
      }
      // signOut → /로 리다이렉트. session 무효화도 자동.
      await signOut({ redirect: false });
      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.account.deleteFailed);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function handleCancel() {
    if (!confirm(m.account.confirmCancel)) {
      return;
    }
    setCancelling(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/account/subscription", { method: "DELETE" });
      const text = await res.text();
      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {}
      if (!res.ok) {
        const err = (data as { error?: string } | null)?.error;
        throw new Error(err ?? fmt(m.account.cancelFailedStatus, { status: res.status }));
      }
      const msg = (data as { message?: string } | null)?.message ?? m.account.cancelDone;
      setMessage(msg);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : m.account.cancelFailed);
    } finally {
      setCancelling(false);
    }
  }

  if (!FEATURE_AUTH) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
        <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {m.account.featureOff}
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
        <div className="h-32 animate-pulse rounded-xl bg-paperis-surface-2" />
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
        <div className="rounded-xl border border-paperis-border bg-paperis-surface-2 p-4 text-sm text-paperis-text-2">
          {m.account.needSignIn}
        </div>
      </main>
    );
  }

  const planLabel = (() => {
    if (!sub || !sub.plan) return m.account.planFree;
    if (sub.plan === "byok") return sub.admin ? m.account.planByokAdmin : m.account.planByokLifetime;
    if (sub.plan === "balanced") {
      if (sub.status === "cancelled") return m.account.planBalancedCancelled;
      if (sub.status === "suspended") return m.account.planBalancedSuspended;
      return m.account.planBalancedMonthly;
    }
    if (sub.status === "cancelled") return m.account.planProCancelled;
    if (sub.status === "suspended") return m.account.planProSuspended;
    return m.account.planProMonthly;
  })();
  const planColor = (() => {
    if (!sub?.plan) return "text-paperis-text-2";
    if (sub.plan === "byok") return "text-paperis-accent";
    if (sub.status === "cancelled") return "text-paperis-text-3";
    if (sub.status === "suspended") return "text-paperis-accent";
    return "text-paperis-accent";
  })();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/app"
        className="inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
      >
        {m.common.back}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-paperis-text">
          {m.account.title}
        </h1>
        {sub?.admin ? (
          <Link
            href="/admin"
            className="inline-flex h-8 items-center rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/20 px-3 text-xs font-medium text-paperis-accent transition hover:bg-paperis-accent-dim/40"
          >
            {m.account.adminLink}
          </Link>
        ) : null}
      </div>

      {/* 사용자 정보 */}
      <section className="mt-6 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.account.myInfo}
        </h2>
        <dl className="mt-3 space-y-1 text-sm text-paperis-text-2">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-paperis-text-3">{m.account.labelName}</dt>
            <dd>{session.user.name ?? m.account.nameNone}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-paperis-text-3">{m.account.labelEmail}</dt>
            <dd>{session.user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-paperis-text-3">{m.account.labelOnboarding}</dt>
            <dd>
              {session.user.onboardingDone ? (
                <span className="text-paperis-accent">{m.account.onboardingDone}</span>
              ) : (
                <Link href="/onboarding" className="text-paperis-accent underline">
                  {m.account.onboardingTodo}
                </Link>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* 구독 */}
      <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.account.subscription}
        </h2>
        {loading ? (
          <div className="mt-3 h-12 animate-pulse rounded-md bg-paperis-surface-2" />
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className={`text-base font-semibold ${planColor}`}>{planLabel}</div>
            {sub?.plan === "pro" || sub?.plan === "balanced" ? (
              <>
                {sub.nextBillingAt ? (
                  <div className="text-xs text-paperis-text-3">
                    {m.account.nextBilling}{" "}
                    <span className="text-paperis-text-2">
                      {formatDate(sub.nextBillingAt, locale)}
                    </span>
                  </div>
                ) : sub.status === "cancelled" && sub.expiresAt ? (
                  <div className="text-xs text-paperis-text-3">
                    {fmt(m.account.cancelledHint, { date: formatDate(sub.expiresAt, locale) })}
                  </div>
                ) : sub.status === "suspended" ? (
                  <div className="text-xs text-paperis-accent">
                    {m.account.suspendedHint}
                  </div>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <Link
                    href="/billing"
                    className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
                  >
                    {m.account.changeCard}
                  </Link>
                  {sub.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="inline-flex h-8 items-center rounded-lg border border-paperis-accent/40 bg-paperis-surface px-3 text-xs font-medium text-paperis-accent transition hover:bg-paperis-accent-dim/40 disabled:opacity-50"
                    >
                      {cancelling ? m.account.cancelling : m.account.cancelSubscription}
                    </button>
                  ) : null}
                </div>
              </>
            ) : sub?.plan === "byok" ? (
              <p className="text-xs text-paperis-text-3">
                {m.account.byokLifetimeNote}
              </p>
            ) : (
              <div className="pt-1">
                <Link
                  href="/billing"
                  className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
                >
                  {m.account.upgrade}
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 사용량 */}
      <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.account.thisMonthUsage}
        </h2>
        {usage ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <UsageBlock label={m.account.usageCuration} unlimited={m.account.unlimited} data={usage.curation} />
            <UsageBlock label={m.account.usageTts} unlimited={m.account.unlimited} data={usage.tts} />
            <UsageBlock label={m.account.usageFulltext} unlimited={m.account.unlimited} data={usage.fulltext} />
          </div>
        ) : (
          <div className="mt-3 h-16 animate-pulse rounded-md bg-paperis-surface-2" />
        )}
        {usage?.plan === "free" ? (
          <p className="mt-3 text-xs text-paperis-text-3">
            {m.account.freeResetHint1}{" "}
            <Link href="/billing" className="underline">
              {m.account.upgrade}
            </Link>{" "}
            {m.account.freeResetHint2}
          </p>
        ) : usage ? (
          <p className="mt-3 text-xs text-paperis-text-3">
            {usage.plan === "byok"
              ? m.account.byokNoQuota
              : usage.plan === "balanced"
                ? m.account.balancedTtsQuota
                : m.account.proNoQuota}
          </p>
        ) : null}
      </section>

      {message ? (
        <div className="mt-4 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-sm text-paperis-accent">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-sm text-paperis-accent">
          {error}
        </div>
      ) : null}

      {/* 계정 해지 — 마지막 섹션. 2단계 확인 (펼침 → 최종 버튼). 토스 빌링키는 dormant. */}
      <section className="mt-8 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          {m.account.deleteAccountTitle}
        </h2>
        <p className="mt-2 text-xs text-paperis-text-3">
          {m.account.deleteAccountDesc}
        </p>
        {!deleteConfirm ? (
          <button
            type="button"
            onClick={() => setDeleteConfirm(true)}
            className="mt-3 inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs font-medium text-paperis-text-3 transition hover:border-paperis-accent hover:text-paperis-accent"
          >
            {m.account.deleteAccountButton}
          </button>
        ) : (
          <div className="mt-3 space-y-3 rounded-lg border border-paperis-accent/50 bg-paperis-accent-dim/30 p-3">
            <p className="text-xs leading-relaxed text-paperis-text">
              {m.account.deleteAccountWarn}
            </p>
            <p className="text-xs font-medium text-paperis-accent">
              {m.account.deleteAccountConfirm}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex h-8 items-center rounded-lg bg-paperis-accent px-3 text-xs font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting ? m.account.deleting : m.account.deleteAccountFinal}
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                {m.account.deleteAccountCancel}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function UsageBlock({
  label,
  unlimited,
  data,
}: {
  label: string;
  unlimited: string;
  data: { current: number; limit: number; remaining: number };
}) {
  const isInf = !Number.isFinite(data.limit);
  const ratio = isInf ? 0 : Math.min(1, data.current / data.limit);
  return (
    <div className="rounded-lg border border-paperis-border bg-paperis-surface p-3">
      <div className="text-xs text-paperis-text-3">{label}</div>
      <div className="mt-1 text-base font-semibold text-paperis-text">
        {isInf ? unlimited : `${data.current} / ${data.limit}`}
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

function formatDate(iso: string, locale: "ko" | "en"): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(locale === "en" ? "en-US" : "ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
