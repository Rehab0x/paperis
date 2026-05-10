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

const FEATURE_AUTH = process.env.NEXT_PUBLIC_FEATURE_AUTH === "1";
const TOSS_CLIENT_KEY = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? "";

export default function BillingPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoggedIn = !!session?.user;
  const onboardingDone = session?.user?.onboardingDone === true;

  async function startPayment(plan: "byok" | "pro") {
    setError(null);
    if (!TOSS_CLIENT_KEY) {
      setError(
        "결제 시스템이 아직 활성화되지 않았습니다 (NEXT_PUBLIC_TOSS_CLIENT_KEY 미설정)."
      );
      return;
    }
    if (!isLoggedIn) {
      setError("로그인이 필요합니다.");
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
        let msg = `결제 준비 실패 (${checkoutRes.status})`;
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
        err instanceof Error ? err.message : "결제 시작 중 오류가 발생했습니다.";
      // 사용자가 결제창에서 취소한 경우 SDK가 throw — 친절 메시지
      if (msg.includes("USER_CANCEL")) {
        setError("결제를 취소했습니다.");
      } else {
        setError(msg);
      }
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/"
        className="inline-flex h-7 items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 홈으로
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
        업그레이드
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        무료 한도를 우회하고 저널 큐레이션·TTS·풀텍스트 요약을 자유롭게 이용하세요.
      </p>

      {!FEATURE_AUTH ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          결제 기능은 현재 점진 롤아웃 중입니다 (NEXT_PUBLIC_FEATURE_AUTH=0).
        </div>
      ) : status === "loading" ? (
        <div className="mt-6 h-32 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
      ) : !isLoggedIn ? (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          결제하려면{" "}
          <span className="font-medium">우측 상단 Google 로그인</span>이 필요합니다.
        </div>
      ) : !onboardingDone ? (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          결제 전에{" "}
          <Link href="/onboarding" className="font-medium underline">
            프로필(휴대폰·약관)
          </Link>
          을 완성해 주세요.
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {/* BYOK */}
        <div className="flex flex-col rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            평생 1회 결제
          </div>
          <h2 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            BYOK
          </h2>
          <div className="mt-3 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            9,900<span className="ml-0.5 text-base font-medium">원</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">한 번 결제, 평생 이용</p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <li>✓ 저널 큐레이션 무제한</li>
            <li>✓ TTS 변환 무제한</li>
            <li>✓ 풀텍스트 요약 무제한</li>
            <li className="text-zinc-500">
              ※ Gemini API 키를 직접 입력해도 같은 효과 (무료, 자기 키 사용)
            </li>
          </ul>
          <button
            type="button"
            onClick={() => startPayment("byok")}
            disabled={loading || !FEATURE_AUTH}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-zinc-900 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            {loading ? "결제 준비 중…" : "BYOK 결제하기"}
          </button>
        </div>

        {/* Pro */}
        <div className="flex flex-col rounded-2xl border border-violet-200 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
          <div className="text-xs font-medium text-violet-600 dark:text-violet-400">
            월 구독
          </div>
          <h2 className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            Pro
          </h2>
          <div className="mt-3 text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            4,900<span className="ml-0.5 text-base font-medium">원/월</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">자동 갱신, 언제든 해지</p>
          <ul className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <li>✓ BYOK 모든 혜택</li>
            <li>✓ 새 기능 우선 사용</li>
            <li>✓ 우선 고객지원</li>
          </ul>
          <button
            type="button"
            onClick={() => startPayment("pro")}
            disabled={loading || !FEATURE_AUTH}
            className="mt-6 inline-flex h-10 w-full items-center justify-center rounded-lg bg-violet-600 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "결제 준비 중…" : "Pro 구독하기"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <p className="mt-8 text-xs text-zinc-500">
        결제 진행 시{" "}
        <Link href="/legal/terms" className="underline">
          이용약관
        </Link>
        ,{" "}
        <Link href="/legal/privacy" className="underline">
          개인정보처리방침
        </Link>
        ,{" "}
        <Link href="/legal/refund" className="underline">
          환불 정책
        </Link>
        에 동의한 것으로 간주됩니다.
      </p>
    </main>
  );
}
