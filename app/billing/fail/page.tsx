// /billing/fail — Toss 결제창 failUrl. ?code=...&message=...&orderId=...
//
// 결제는 진행되지 않은 상태 (Toss가 confirm 호출 X). 별도 서버 호출 없이 표시만.

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAppMessages } from "@/components/useAppMessages";

function FailInner() {
  const m = useAppMessages();
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const message = searchParams.get("message") ?? m.billing.defaultFailMessage;
  const orderId = searchParams.get("orderId") ?? "";

  // USER_CANCEL은 사용자가 직접 취소 — 친절 톤
  const isCancel = code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED";

  if (isCancel) {
    return (
      <div className="rounded-xl border border-paperis-border bg-paperis-surface-2 p-6">
        <div className="text-2xl">🔙</div>
        <h2 className="mt-2 font-serif text-xl font-medium tracking-tight text-paperis-text">
          {m.billing.failUserCancelTitle}
        </h2>
        <p className="mt-2 text-sm text-paperis-text-2">
          {m.billing.failUserCancelBody}
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            href="/billing"
            className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
          >
            {m.billing.successErrorBack}
          </Link>
          <Link
            href="/app"
            className="inline-flex h-9 items-center rounded-lg border border-paperis-border bg-paperis-surface px-4 text-sm font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
          >
            {m.billing.failHome}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/40 p-6">
      <div className="text-2xl">⚠️</div>
      <h2 className="mt-2 font-serif text-xl font-medium tracking-tight text-paperis-text">
        {m.billing.failTitle}
      </h2>
      <p className="mt-2 text-sm text-paperis-accent">{message}</p>
      <dl className="mt-4 space-y-1 text-xs text-paperis-text-2">
        {code ? (
          <div>{m.billing.failCodeLabel} <code className="font-mono">{code}</code></div>
        ) : null}
        {orderId ? (
          <div>{m.billing.failOrderLabel} <code className="font-mono">{orderId}</code></div>
        ) : null}
      </dl>
      <div className="mt-5 flex gap-2">
        <Link
          href="/billing"
          className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
        >
          {m.billing.retry}
        </Link>
        <Link
          href="/app"
          className="inline-flex h-9 items-center rounded-lg border border-paperis-border bg-paperis-surface px-4 text-sm font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
        >
          {m.billing.failHome}
        </Link>
      </div>
    </div>
  );
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

export default function BillingFailPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <BackToAppLink />
      <Suspense
        fallback={
          <div className="h-32 animate-pulse rounded-xl bg-paperis-surface-2" />
        }
      >
        <FailInner />
      </Suspense>
    </main>
  );
}
