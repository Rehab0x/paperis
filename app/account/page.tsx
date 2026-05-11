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
        <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          계정 기능은 현재 점진 롤아웃 중입니다 (NEXT_PUBLIC_FEATURE_AUTH=0).
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
    if (!sub?.plan) return "text-paperis-text-2";
    if (sub.plan === "byok") return "text-paperis-accent";
    if (sub.status === "cancelled") return "text-paperis-text-3";
    if (sub.status === "suspended") return "text-paperis-accent";
    return "text-paperis-accent";
  })();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/"
        className="inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
      >
        ← 홈으로
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-paperis-text">
        계정
      </h1>

      {/* 사용자 정보 */}
      <section className="mt-6 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          내 정보
        </h2>
        <dl className="mt-3 space-y-1 text-sm text-paperis-text-2">
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-paperis-text-3">이름</dt>
            <dd>{session.user.name ?? "(없음)"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-paperis-text-3">이메일</dt>
            <dd>{session.user.email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-paperis-text-3">온보딩</dt>
            <dd>
              {session.user.onboardingDone ? (
                <span className="text-paperis-accent">완료</span>
              ) : (
                <Link href="/onboarding" className="text-paperis-accent underline">
                  완성하기
                </Link>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {/* 구독 */}
      <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          구독
        </h2>
        {loading ? (
          <div className="mt-3 h-12 animate-pulse rounded-md bg-paperis-surface-2" />
        ) : (
          <div className="mt-3 space-y-3 text-sm">
            <div className={`text-base font-semibold ${planColor}`}>{planLabel}</div>
            {sub?.plan === "pro" ? (
              <>
                {sub.nextBillingAt ? (
                  <div className="text-xs text-paperis-text-3">
                    다음 결제일:{" "}
                    <span className="text-paperis-text-2">
                      {formatDate(sub.nextBillingAt)}
                    </span>
                  </div>
                ) : sub.status === "cancelled" && sub.expiresAt ? (
                  <div className="text-xs text-paperis-text-3">
                    {formatDate(sub.expiresAt)}까지 Pro 권한 유지. 이후 Free로 전환됩니다.
                  </div>
                ) : sub.status === "suspended" ? (
                  <div className="text-xs text-paperis-accent">
                    자동결제가 실패했습니다. 결제 페이지에서 카드를 다시 등록해 주세요.
                  </div>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <Link
                    href="/billing"
                    className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
                  >
                    카드 변경
                  </Link>
                  {sub.status !== "cancelled" ? (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="inline-flex h-8 items-center rounded-lg border border-paperis-accent/40 bg-paperis-surface px-3 text-xs font-medium text-paperis-accent transition hover:bg-paperis-accent-dim/40 disabled:opacity-50"
                    >
                      {cancelling ? "해지 중…" : "구독 해지"}
                    </button>
                  ) : null}
                </div>
              </>
            ) : sub?.plan === "byok" ? (
              <p className="text-xs text-paperis-text-3">
                BYOK 평생 이용권입니다. 별도 갱신·해지가 없습니다.
              </p>
            ) : (
              <div className="pt-1">
                <Link
                  href="/billing"
                  className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
                >
                  업그레이드
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 사용량 */}
      <section className="mt-4 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
        <h2 className="text-sm font-semibold text-paperis-text">
          이번 달 사용량
        </h2>
        {usage ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <UsageBlock label="저널 큐레이션" data={usage.curation} />
            <UsageBlock label="TTS 변환" data={usage.tts} />
            <UsageBlock label="풀텍스트 요약" data={usage.fulltext} />
          </div>
        ) : (
          <div className="mt-3 h-16 animate-pulse rounded-md bg-paperis-surface-2" />
        )}
        {usage?.plan === "free" ? (
          <p className="mt-3 text-xs text-paperis-text-3">
            매월 1일 KST 자정에 자동 초기화됩니다.{" "}
            <Link href="/billing" className="underline">
              업그레이드
            </Link>{" "}
            시 한도가 사라집니다.
          </p>
        ) : usage ? (
          <p className="mt-3 text-xs text-paperis-text-3">
            {usage.plan === "byok"
              ? "BYOK 권한 — 한도 없음."
              : "Pro 권한 — 한도 없음."}
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
    <div className="rounded-lg border border-paperis-border bg-paperis-surface p-3">
      <div className="text-xs text-paperis-text-3">{label}</div>
      <div className="mt-1 text-base font-semibold text-paperis-text">
        {isInf ? "무제한" : `${data.current} / ${data.limit}`}
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
