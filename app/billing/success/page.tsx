// /billing/success — Toss 결제창에서 successUrl로 redirect되는 콜백.
//
// query: ?paymentKey=...&orderId=...&amount=...
// 1. 클라이언트 쪽에서 /api/billing/confirm 호출
// 2. 성공 → "결제 완료" + 홈/계정 페이지 링크
// 3. 실패 → 에러 메시지 + 고객센터 안내
//
// useSearchParams는 Suspense 경계 안에서만 호출 — Next 15+ 빌드 룰.

"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

type Status = "verifying" | "success" | "fail";

function SuccessInner() {
  const searchParams = useSearchParams();
  const paymentKey = searchParams.get("paymentKey") ?? "";
  const orderId = searchParams.get("orderId") ?? "";
  const amountStr = searchParams.get("amount") ?? "";
  const amount = Number(amountStr);

  const [status, setStatus] = useState<Status>("verifying");
  const [message, setMessage] = useState<string | null>(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    if (!paymentKey || !orderId || !Number.isFinite(amount)) {
      setStatus("fail");
      setMessage("결제 정보가 누락되었습니다.");
      return;
    }
    fetch("/api/billing/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    })
      .then(async (res) => {
        const text = await res.text();
        let data: unknown = null;
        try {
          data = JSON.parse(text);
        } catch {}
        if (!res.ok) {
          const err = (data as { error?: string } | null)?.error;
          throw new Error(err ?? `결제 확정 실패 (${res.status})`);
        }
        return data;
      })
      .then(() => {
        setStatus("success");
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "결제 확정 실패";
        setStatus("fail");
        setMessage(msg);
      });
  }, [paymentKey, orderId, amount]);

  if (status === "verifying") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        <div className="flex items-center gap-3">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200" />
          결제를 확정하는 중입니다…
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          창을 닫지 마세요. 처리에 5초 정도 걸릴 수 있습니다.
        </p>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
        <div className="text-2xl">✅</div>
        <h2 className="mt-2 text-lg font-semibold text-emerald-900 dark:text-emerald-100">
          결제가 완료되었습니다
        </h2>
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
          BYOK 평생 권한이 활성화되었습니다. 이제 모든 한도 없이 이용할 수 있습니다.
        </p>
        <dl className="mt-4 space-y-1 text-xs text-emerald-700 dark:text-emerald-300">
          <div>주문번호: <code>{orderId}</code></div>
          <div>금액: {amount.toLocaleString()}원</div>
        </dl>
        <div className="mt-5 flex gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            홈으로
          </Link>
          <Link
            href="/journal"
            className="inline-flex h-9 items-center rounded-lg border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            저널 큐레이션
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950">
      <div className="text-2xl">⚠️</div>
      <h2 className="mt-2 text-lg font-semibold text-red-900 dark:text-red-100">
        결제 확정 중 문제가 발생했습니다
      </h2>
      <p className="mt-2 text-sm text-red-800 dark:text-red-200">{message}</p>
      <dl className="mt-4 space-y-1 text-xs text-red-700 dark:text-red-300">
        <div>주문번호: <code>{orderId || "(없음)"}</code></div>
        <div>paymentKey: <code>{paymentKey || "(없음)"}</code></div>
      </dl>
      <p className="mt-4 text-xs text-red-700 dark:text-red-300">
        결제는 이미 처리되었을 수 있습니다. 위 주문번호와 함께 고객센터로 문의해
        주세요. (자세한 내용은{" "}
        <Link href="/legal/refund" className="underline">
          환불 정책
        </Link>
        )
      </p>
      <div className="mt-5">
        <Link
          href="/billing"
          className="inline-flex h-9 items-center rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-800 dark:bg-red-950 dark:text-red-300"
        >
          결제 페이지로
        </Link>
      </div>
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <Suspense
        fallback={
          <div className="h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        }
      >
        <SuccessInner />
      </Suspense>
    </main>
  );
}
