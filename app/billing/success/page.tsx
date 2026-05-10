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

type Status = "verifying" | "success" | "fail";
type Flow = "byok" | "pro";

interface SuccessState {
  status: Status;
  message: string | null;
  flow: Flow;
  expiresAt?: string;
}

function SuccessInner() {
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
            throw new Error("결제 정보가 누락되었습니다.");
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
          throw new Error("Pro 구독 인증 정보가 누락되었습니다.");
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
        const msg = err instanceof Error ? err.message : "결제 확정 실패";
        setState({ status: "fail", message: msg, flow });
      }
    }

    void run();
  }, [flow, paymentKey, orderId, amount, customerKey, authKey]);

  if (state.status === "verifying") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
        <div className="flex items-center gap-3">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-700 dark:border-t-zinc-200" />
          {flow === "byok"
            ? "결제를 확정하는 중입니다…"
            : "구독을 활성화하는 중입니다 (카드 등록 + 첫 달 결제)…"}
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          창을 닫지 마세요. 처리에 5초 정도 걸릴 수 있습니다.
        </p>
      </div>
    );
  }

  if (state.status === "success") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900 dark:bg-emerald-950">
        <div className="text-2xl">✅</div>
        <h2 className="mt-2 text-lg font-semibold text-emerald-900 dark:text-emerald-100">
          {flow === "byok" ? "결제가 완료되었습니다" : "Pro 구독이 시작되었습니다"}
        </h2>
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
          {flow === "byok"
            ? "BYOK 평생 권한이 활성화되었습니다. 이제 모든 한도 없이 이용할 수 있습니다."
            : `Pro 권한이 활성화되었습니다. 매월 자동 결제됩니다.${
                state.expiresAt
                  ? ` (다음 결제일: ${formatDate(state.expiresAt)})`
                  : ""
              }`}
        </p>
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
        결제 처리 중 문제가 발생했습니다
      </h2>
      <p className="mt-2 text-sm text-red-800 dark:text-red-200">{state.message}</p>
      <p className="mt-4 text-xs text-red-700 dark:text-red-300">
        결제는 이미 처리되었을 수 있습니다. 위 정보와 함께 고객센터로 문의해 주세요.
        (자세한 내용은{" "}
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

export default function BillingSuccessPage() {
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
        <SuccessInner />
      </Suspense>
    </main>
  );
}
