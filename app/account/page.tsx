// /account — 계정 + 구독 관리.
// - 사용자 기본 정보
// - 구독 상태 (BYOK / Pro / Free)
// - Pro 해지 / 카드 변경
// - 사용량 잔여 (이번 달)

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { SubscriptionDto } from "@/app/api/account/subscription/route";
import type { UsageSnapshot } from "@/lib/usage";

const FEATURE_AUTH = process.env.NEXT_PUBLIC_FEATURE_AUTH === "1";

export default function AccountPage() {
  const { data: session, status } = useSession();
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    void reload();
  }, [status, reload]);

  async function handleCancel() {
    if (!confirm("Pro 구독을 해지하시겠어요? 다음 결제일 이후로는 자동결제가 멈추고 Free로 전환됩니다.")) {
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
        throw new Error(err ?? `해지 실패 (${res.status})`);
      }
      const msg = (data as { message?: string } | null)?.message ?? "구독이 해지되었습니다.";
      setMessage(msg);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "해지 실패");
    } finally {
      setCancelling(false);
    }
  }

  if (!FEATURE_AUTH) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          계정 기능은 현재 점진 롤아웃 중입니다 (NEXT_PUBLIC_FEATURE_AUTH=0).
        </div>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
        <div className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          계정 정보를 보려면 우측 상단에서 로그인하세요.
        </div>
      </main>
    );
  }

  const planLabel = (() => {
    if (!sub || !sub.plan) return "Free";
    if (sub.plan === "byok") return "BYOK (평생)";
    if (sub.status === "cancelled") return "Pro (해지 예정)";
    if (sub.status === "suspended") return "Pro (결제 실패 — 보류)";
    return "Pro (월 구독)";
  })();
  const planColor = (() => {
    if (!sub?.plan) return "text-zinc-700 dark:text-zinc-300";
    if (sub.plan === "byok") return "text-emerald-700 dark:text-emerald-300";
    if (sub.status === "cancelled") return "text-amber-700 dark:text-amber-300";
    if (sub.status === "suspended") return "text-red-700 dark:text-red-300";
    return "text-violet-700 dark:text-violet-300";
  })();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/"
        className="inline-flex h-7 items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 홈으로
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        계정
      </h1>

      {/* 사용자 정보 */}
      <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          내 정보
        </h2>
        <dl className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">이름</dt>
            <dd>{session.user.name ?? "(없음)"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">이메일</dt>
            <dd>{session.user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-zinc-500">온보딩</dt>
            <dd>
              {session.user.onboardingDone ? (
                <span className="text-emerald-700 dark:text-emerald-300">완료</span>
              ) : (
                <Link href="/onboarding" className="text-amber-700 underline dark:text-amber-300">
                  완성하기
                </Link>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* 구독 */}
      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          구독
        </h2>
        {loading ? (
          <div className="mt-3 h-12 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className={`text-base font-semibold ${planColor}`}>{planLabel}</div>
            {sub?.plan === "pro" ? (
              <>
                {sub.nextBillingAt ? (
                  <div className="text-xs text-zinc-500">
                    다음 결제일:{" "}
                    <span className="text-zinc-700 dark:text-zinc-300">
                      {formatDate(sub.nextBillingAt)}
                    </span>
                  </div>
                ) : sub.status === "cancelled" && sub.expiresAt ? (
                  <div className="text-xs text-amber-700 dark:text-amber-300">
                    {formatDate(sub.expiresAt)}까지 Pro 권한 유지. 이후 Free로 전환됩니다.
                  </div>
                ) : sub.status === "suspended" ? (
                  <div className="text-xs text-red-700 dark:text-red-300">
                    자동결제가 실패했습니다. 결제 페이지에서 카드를 다시 등록해 주세요.
                  </div>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <Link
                    href="/billing"
                    className="inline-flex h-8 items-center rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    카드 변경
                  </Link>
                  {sub.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:bg-zinc-950 dark:text-red-300 dark:hover:bg-red-950"
                    >
                      {cancelling ? "해지 중…" : "구독 해지"}
                    </button>
                  ) : null}
                </div>
              </>
            ) : sub?.plan === "byok" ? (
              <p className="text-xs text-zinc-500">
                BYOK 평생 이용권입니다. 별도 갱신·해지가 없습니다.
              </p>
            ) : (
              <div className="pt-1">
                <Link
                  href="/billing"
                  className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  업그레이드
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 사용량 */}
      <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          이번 달 사용량
        </h2>
        {usage ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <UsageBlock label="저널 큐레이션" data={usage.curation} />
            <UsageBlock label="TTS 변환" data={usage.tts} />
            <UsageBlock label="풀텍스트 요약" data={usage.fulltext} />
          </div>
        ) : (
          <div className="mt-3 h-16 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
        )}
        {usage?.plan === "free" ? (
          <p className="mt-3 text-xs text-zinc-500">
            매월 1일 KST 자정에 자동 초기화됩니다.{" "}
            <Link href="/billing" className="underline">
              업그레이드
            </Link>{" "}
            시 한도가 사라집니다.
          </p>
        ) : usage ? (
          <p className="mt-3 text-xs text-zinc-500">
            {usage.plan === "byok" || usage.plan === "byok-effective"
              ? "BYOK 권한 — 한도 없음."
              : "Pro 권한 — 한도 없음."}
          </p>
        ) : null}
      </section>

      {message ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}
    </main>
  );
}

function UsageBlock({
  label,
  data,
}: {
  label: string;
  data: { current: number; limit: number; remaining: number };
}) {
  const isInf = !Number.isFinite(data.limit);
  const ratio = isInf ? 0 : Math.min(1, data.current / data.limit);
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-100">
        {isInf ? "무제한" : `${data.current} / ${data.limit}`}
      </div>
      {!isInf ? (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div
            className={`h-full ${ratio >= 1 ? "bg-red-500" : "bg-emerald-500"}`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}
