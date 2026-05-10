// /billing/fail — Toss 결제창 failUrl. ?code=...&message=...&orderId=...
//
// 결제는 진행되지 않은 상태 (Toss가 confirm 호출 X). 별도 서버 호출 없이 표시만.

"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

function FailInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const message = searchParams.get("message") ?? "결제가 취소되었거나 실패했습니다.";
  const orderId = searchParams.get("orderId") ?? "";

  // USER_CANCEL은 사용자가 직접 취소 — 친절 톤
  const isCancel = code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED";

  if (isCancel) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-2xl">🔙</div>
        <h2 className="mt-2 text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          결제를 취소했습니다
        </h2>
        <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
          언제든지 다시 시도할 수 있습니다.
        </p>
        <div className="mt-5 flex gap-2">
          <Link
            href="/billing"
            className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            결제 페이지로
          </Link>
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950">
      <div className="text-2xl">⚠️</div>
      <h2 className="mt-2 text-lg font-semibold text-red-900 dark:text-red-100">
        결제에 실패했습니다
      </h2>
      <p className="mt-2 text-sm text-red-800 dark:text-red-200">{message}</p>
      <dl className="mt-4 space-y-1 text-xs text-red-700 dark:text-red-300">
        {code ? (
          <div>오류 코드: <code>{code}</code></div>
        ) : null}
        {orderId ? (
          <div>주문번호: <code>{orderId}</code></div>
        ) : null}
      </dl>
      <div className="mt-5 flex gap-2">
        <Link
          href="/billing"
          className="inline-flex h-9 items-center rounded-lg bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
        >
          다시 시도
        </Link>
        <Link
          href="/"
          className="inline-flex h-9 items-center rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}

export default function BillingFailPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/"
        className="mb-3 inline-flex h-7 items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 홈으로
      </Link>
      <Suspense
        fallback={
          <div className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        }
      >
        <FailInner />
      </Suspense>
    </main>
  );
}
