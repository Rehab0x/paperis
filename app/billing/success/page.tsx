// /billing/success — Toss 결제창 successUrl 콜백.
//
// 두 흐름 분기:
//   - ?flow=byok&paymentKey=&orderId=&amount=  → /api/billing/confirm
//   - ?flow=pro&customerKey=&authKey=          → /api/billing/issue-billing-key
//                                              → /api/billing/charge-first
//
// useSearchParams는 Suspense 경계 안에서만 호출 — Next 빌드 룰.

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppMessages } from "@/components/useAppMessages";
import { useLocale } from "@/components/useLocale";
import { fmt } from "@/lib/i18n";

type Status = "verifying" | "success" | "fail";
type Flow = "byok" | "pro";

interface SuccessState {
  status: Status;
  message: string | null;
  flow: Flow;
  expiresAt?: string;
}

function SuccessInner() {
  const m = useAppMessages();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const flow: Flow = searchParams.get("flow") === "pro" ? "pro" : "byok";

  // BYOK params
  const paymentKey = searchParams.get("paymentKey") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  const amountStr = searchParams.get("amount") ?? "";
  const amount = Number(amountStr);

  // Pro params
  const customerKey = searchParams.get("customerKey") ?? "";
  const authKey = searchParams.get("authKey") ?? "";

  const [state, setState] = useState<SuccessState>({
    status: "verifying",
    message: null,
    flow,
  });
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    async function run() {
      try {
        if (flow === "byok") {
          if (!paymentKey || !orderId || !Number.isFinite(amount)) {
            throw new Error(m.billing.missingPaymentInfo);
          }
          const res = await fetch("/api/billing/confirm", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ paymentKey, orderId, amount }),
          });
          await throwIfNotOk(res);
          setState({ status: "success", message: null, flow });
          return;
        }

        // Pro flow
        if (!customerKey || !authKey) {
          throw new Error(m.billing.missingProAuth);
        }
        // 1. 빌링키 발급
        const issueRes = await fetch("/api/billing/issue-billing-key", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customerKey, authKey }),
        });
        await throwIfNotOk(issueRes);
        // 2. 첫 달 결제
        const chargeRes = await fetch("/api/billing/charge-first", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        const chargeData = (await throwIfNotOk(chargeRes)) as {
          expiresAt?: string;
        };
        setState({
          status: "success",
          message: null,
          flow,
          expiresAt: chargeData.expiresAt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : m.billing.confirmGenericFailed;
        setState({ status: "fail", message: msg, flow });
      }
    }

    void run();
  }, [flow, paymentKey, orderId, amount, customerKey, authKey]);

  if (state.status === "verifying") {
    return (
      <div className="rounded-xl border border-paperis-border bg-paperis-surface p-6 text-sm text-paperis-text-2">
        <div className="flex items-center gap-3">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-paperis-border border-t-paperis-accent" />
          {flow === "byok"
            ? m.billing.successConfirming
            : m.billing.successProActivating}
        </div>
        <p className="mt-3 text-xs text-paperis-text-3">{m.billing.successWait}</p>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-6">
        <div className="text-2xl">✅</div>
        <h2 className="mt-2 font-serif text-xl font-medium tracking-tight text-paperis-text">
          {flow === "byok" ? m.billing.successByokTitle : m.billing.successProTitle}
        </h2>
        <p className="mt-2 text-sm text-paperis-text-2">
          {flow === "byok"
            ? m.billing.successByokBody
            : m.billing.successProBodyBase +
              (state.expiresAt
                ? fmt(m.billing.successProNextDate, {
                    date: formatDate(state.expiresAt, locale),
                  })
                : "")}
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            href="/app"
            className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
          >
            {m.billing.successHome}
          </Link>
          <Link
            href="/journal"
            className="inline-flex h-9 items-center rounded-lg border border-paperis-border bg-paperis-surface px-4 text-sm font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
          >
            {m.billing.successJournal}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-6">
      <div className="text-2xl">⚠️</div>
      <h2 className="mt-2 font-serif text-xl font-medium tracking-tight text-paperis-text">
        {m.billing.successErrorTitle}
      </h2>
      <p className="mt-2 text-sm text-paperis-accent">{state.message}</p>
      <p className="mt-4 text-xs text-paperis-text-2">
        {m.billing.successErrorBody1}{" "}
        <Link href="/legal/refund" className="underline">
          {m.billing.refundLink}
        </Link>
        {m.billing.successErrorBody2}
      </p>
      <div className="mt-5">
        <Link
          href="/billing"
          className="inline-flex h-9 items-center rounded-lg border border-paperis-accent bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
        >
          {m.billing.successErrorBack}
        </Link>
      </div>
    </div>
  );
}

async function throwIfNotOk(res: Response): Promise<unknown> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!res.ok) {
    const err = (data as { error?: string } | null)?.error;
    throw new Error(err ?? `요청 실패 (${res.status})`);
  }
  return data;
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

function BackToAppLink() {
  const m = useAppMessages();
  return (
    <Link
      href="/app"
      className="mb-3 inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
    >
      {m.common.back}
    </Link>
  );
}

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <BackToAppLink />
      <Suspense
        fallback={
          <div className="h-32 animate-pulse rounded-xl bg-paperis-surface-2" />
        }
      >
        <SuccessInner />
      </Suspense>
    </main>
  );
}
