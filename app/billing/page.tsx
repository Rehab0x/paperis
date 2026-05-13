// /billing — 가격 표시 + 결제 시작 버튼.
//
// 사용자 시나리오:
//   1. 헤더 계정 메뉴 → "업그레이드" or 한도 초과 CTA → /billing 진입
//   2. BYOK / Pro 카드에서 결제 버튼 클릭
//   3. /api/billing/checkout으로 orderId 발급 → Toss SDK requestPayment
//   4. 결제 성공 → /billing/success → /api/billing/confirm 호출 → DB 갱신
//
// 비로그인 진입 시 안내 + 로그인 유도. 온보딩 미완료 시 /onboarding 안내.
// PR3에서 Pro 구독은 별도 흐름(빌링키 발급)이라 일단 BYOK만 동작 — Pro 버튼은 PR3.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { loadTossPayments } from "@tosspayments/payment-sdk";
import type { CheckoutResponse } from "@/app/api/billing/checkout/route";
import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";

const FEATURE_AUTH = process.env.NEXT_PUBLIC_FEATURE_AUTH === "1";
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

export default function BillingPage() {
  const m = useAppMessages();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = !!session?.user;
  const onboardingDone = session?.user?.onboardingDone === true;

  async function startPayment(plan: "byok" | "pro") {
    setError(null);
    if (!TOSS_CLIENT_KEY) {
      setError(m.billing.tossNotConfigured);
      return;
    }
    if (!isLoggedIn) {
      setError(m.billing.needSignInError);
      return;
    }
    if (!onboardingDone) {
      router.push("/onboarding");
      return;
    }
    setLoading(true);
    try {
      // 1. 서버에서 orderId/customerKey 발급
      const checkoutRes = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!checkoutRes.ok) {
        const text = await checkoutRes.text();
        let msg = fmt(m.billing.checkoutFailedStatus, { status: checkoutRes.status });
        try {
          const obj = JSON.parse(text) as { error?: string };
          if (obj.error) msg = obj.error;
        } catch {}
        throw new Error(msg);
      }
      const checkout = (await checkoutRes.json()) as CheckoutResponse;

      // 2. Toss SDK
      const tossPayments = await loadTossPayments(TOSS_CLIENT_KEY);
      if (plan === "byok") {
        // 1회 결제 — 카드창
        await tossPayments.requestPayment("카드", {
          amount: checkout.amount,
          orderId: checkout.orderId,
          orderName: checkout.orderName,
          customerEmail: checkout.customerEmail,
          customerName: checkout.customerName,
          successUrl: `${window.location.origin}/billing/success?flow=byok`,
          failUrl: `${window.location.origin}/billing/fail`,
        });
      } else {
        // Pro 구독 — 빌링키 인증
        await tossPayments.requestBillingAuth("카드", {
          customerKey: checkout.customerKey,
          successUrl: `${window.location.origin}/billing/success?flow=pro`,
          failUrl: `${window.location.origin}/billing/fail`,
        });
      }
      // 위 두 메서드 모두 redirect로 이동하므로 여기 도달 X (성공 시)
    } catch (err) {
      console.warn("[billing] start failed", err);
      const msg =
        err instanceof Error ? err.message : m.billing.startFailed;
      // 사용자가 결제창에서 취소한 경우 SDK가 throw — 친절 메시지
      if (msg.includes("USER_CANCEL")) {
        setError(m.billing.userCancel);
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/app"
        className="inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
      >
        {m.common.back}
      </Link>
      <h1 className="mt-2 font-serif text-3xl font-medium tracking-tight text-paperis-text">
        {m.billing.title}
      </h1>
      <p className="mt-2 text-sm text-paperis-text-2">{m.billing.intro}</p>

      {!FEATURE_AUTH ? (
        <div className="mt-6 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {m.billing.featureOff}
        </div>
      ) : status === "loading" ? (
        <div className="mt-6 h-32 animate-pulse rounded-xl bg-paperis-surface-2" />
      ) : !isLoggedIn ? (
        <div className="mt-6 rounded-xl border border-paperis-border bg-paperis-surface-2 p-4 text-sm text-paperis-text-2">
          {m.billing.needSignInPrefix}{" "}
          <span className="font-medium">{m.billing.needSignInBold}</span>
          {m.billing.needSignInSuffix}
        </div>
      ) : !onboardingDone ? (
        <div className="mt-6 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {m.billing.needOnboardingPrefix}{" "}
          <Link href="/onboarding" className="font-medium underline">
            {m.billing.needOnboardingLink}
          </Link>
          {m.billing.needOnboardingSuffix}
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* BYOK */}
        <div className="flex flex-col rounded-2xl border border-paperis-border bg-paperis-surface p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-accent">
            {m.billing.byokTag}
          </div>
          <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight text-paperis-text">
            {m.billing.byokName}
          </h2>
          <div className="mt-3 text-3xl font-bold tabular-nums text-paperis-text">
            {m.billing.byokPrice}
            <span className="ml-0.5 text-base font-medium">{m.billing.byokPriceUnit}</span>
          </div>
          <p className="mt-1 text-xs text-paperis-text-3">{m.billing.byokSubtitle}</p>
          <ul className="mt-4 space-y-2 text-sm text-paperis-text-2">
            {m.billing.byokFeatures.map((f, i) => (
              <li
                key={i}
                className={i === m.billing.byokFeatures.length - 1 ? "text-paperis-text-3" : undefined}
              >
                {f}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => startPayment("byok")}
            disabled={loading || !FEATURE_AUTH}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-paperis-accent text-sm font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? m.billing.loading : m.billing.byokCta}
          </button>
        </div>

        {/* Pro */}
        <div className="flex flex-col rounded-2xl border border-paperis-accent/40 bg-paperis-accent-dim/20 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-accent">
            {m.billing.proTag}
          </div>
          <h2 className="mt-1 font-serif text-2xl font-medium tracking-tight text-paperis-text">
            {m.billing.proName}
          </h2>
          <div className="mt-3 text-3xl font-bold tabular-nums text-paperis-text">
            {m.billing.proPrice}
            <span className="ml-0.5 text-base font-medium">{m.billing.proPriceUnit}</span>
          </div>
          <p className="mt-1 text-xs text-paperis-text-3">{m.billing.proSubtitle}</p>
          <ul className="mt-4 space-y-2 text-sm text-paperis-text-2">
            {m.billing.proFeatures.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => startPayment("pro")}
            disabled={loading || !FEATURE_AUTH}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-paperis-accent text-sm font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? m.billing.loading : m.billing.proCta}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-4 text-sm text-paperis-accent">
          {error}
        </div>
      ) : null}

      <p className="mt-8 text-xs text-paperis-text-3">
        {m.billing.termsPrefix}{" "}
        <Link href="/legal/terms" className="underline">
          {m.billing.termsLink}
        </Link>
        ,{" "}
        <Link href="/legal/privacy" className="underline">
          {m.billing.privacyLink}
        </Link>
        ,{" "}
        <Link href="/legal/refund" className="underline">
          {m.billing.refundLink}
        </Link>
        {m.billing.termsSuffix}
      </p>
    </main>
  );
}
