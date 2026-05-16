// /api/billing/charge-first — Pro/Balanced 첫 달 결제. 빌링키 발급 직후 호출.
//
// 입력: { plan: "balanced" | "pro" } (default = "pro" 하위호환)
//
// 흐름:
//   1. /api/billing/issue-billing-key로 billingKey 저장됨
//   2. 이 라우트가 chargeBilling으로 첫 결제 (Balanced 4,900 / Pro 9,900)
//   3. 성공 시 subscriptions: plan / status='active' / expiresAt=now+30일
//
// 별도 라우트 이유: 빌링키 발급과 결제는 분리해야 재시도가 깔끔함. 발급만 됐고
// 결제 실패한 경우 사용자에게 "다시 시도" UX 제공 (카드 한도 등 일시적 문제).
//
// 출력: { ok, plan, status: 'active', expiresAt }

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import {
  chargeBilling,
  newOrderId,
  PRICING,
  TossApiError,
} from "@/lib/billing";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  if (!hasDb()) {
    return NextResponse.json<ApiError>(
      { error: "DB가 설정되지 않았습니다." },
      { status: 503 }
    );
  }
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiError>(
      { error: "로그인이 필요합니다." },
      { status: 401 }
    );
  }
  // body에서 plan 읽기 — default "pro"로 하위호환. body 비거나 잘못된 plan이면 pro
  let requestedPlan: "balanced" | "pro" = "pro";
  try {
    const body = (await req.json()) as { plan?: unknown };
    if (body.plan === "balanced") requestedPlan = "balanced";
    else if (body.plan === "pro") requestedPlan = "pro";
  } catch {
    // 빈 body 등은 무시 — default pro
  }
  const pricing =
    requestedPlan === "balanced" ? PRICING.balancedMonthly : PRICING.proMonthly;

  // subscriptions에서 billingKey 조회
  let sub: typeof subscriptions.$inferSelect | null = null;
  let userRow: { email: string | null; name: string | null } | null = null;
  try {
    const db = getDb();
    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.userId, session.user.id))
      .limit(1);
    sub = subs[0] ?? null;
    const us = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    userRow = us[0] ?? null;
  } catch (err) {
    console.error("[billing/charge-first] db lookup failed", err);
    return NextResponse.json<ApiError>(
      { error: "구독 정보 조회에 실패했습니다." },
      { status: 500 }
    );
  }
  if (!sub || !sub.tossBillingKey || !sub.tossCustomerKey) {
    return NextResponse.json<ApiError>(
      { error: "빌링키가 등록되지 않았습니다. 카드 등록부터 다시 진행해 주세요." },
      { status: 400 }
    );
  }
  // 이미 활성 (요청한 plan과 동일)이면 idempotent — 그대로 반환
  if (sub.status === "active" && sub.plan === requestedPlan) {
    return NextResponse.json({
      ok: true,
      plan: requestedPlan,
      status: "active" as const,
      expiresAt: sub.expiresAt?.toISOString(),
      already: true,
    });
  }

  const orderId = newOrderId(requestedPlan, session.user.id);
  let payment;
  try {
    payment = await chargeBilling({
      billingKey: sub.tossBillingKey,
      customerKey: sub.tossCustomerKey,
      amount: pricing.amount,
      orderId,
      orderName: pricing.label,
      customerEmail: userRow?.email ?? undefined,
      customerName: userRow?.name ?? undefined,
    });
  } catch (err) {
    if (err instanceof TossApiError) {
      console.warn("[billing/charge-first] toss api error", err.code, err.message);
      return NextResponse.json<ApiError>(
        { error: `결제 실패: ${err.message} (${err.code})` },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    console.error("[billing/charge-first] unexpected error", err);
    return NextResponse.json<ApiError>(
      { error: "결제 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  if (payment.status !== "DONE") {
    return NextResponse.json<ApiError>(
      { error: `결제 상태가 완료가 아닙니다: ${payment.status}` },
      { status: 400 }
    );
  }

  const expiresAt = new Date(Date.now() + 30 * MS_PER_DAY);
  try {
    const db = getDb();
    await db
      .update(subscriptions)
      .set({
        status: "active",
        plan: requestedPlan,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.userId, session.user.id));
  } catch (err) {
    console.error(
      "[billing/charge-first] payment OK but DB update failed",
      { userId: session.user.id, orderId },
      err
    );
    return NextResponse.json<ApiError>(
      {
        error:
          "결제는 완료되었으나 권한 활성화 중 오류가 발생했습니다. 고객센터로 orderId와 함께 문의해 주세요.",
      },
      { status: 500 }
    );
  }

  // 결제 성공 이메일 — fire-and-forget
  void sendChargeFirstSuccessEmail(
    session.user.id,
    requestedPlan,
    pricing.amount,
    expiresAt
  );

  return NextResponse.json({
    ok: true,
    plan: requestedPlan,
    status: "active" as const,
    expiresAt: expiresAt.toISOString(),
    orderId: payment.orderId,
    approvedAt: payment.approvedAt,
  });
}

async function sendChargeFirstSuccessEmail(
  userId: string,
  plan: "balanced" | "pro",
  amount: number,
  expiresAt: Date
): Promise<void> {
  try {
    const db = getDb();
    const { users } = await import("@/lib/db/schema");
    const row = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const email = row[0]?.email;
    if (!email) return;
    const { sendEmail } = await import("@/lib/email");
    const { paymentSuccessTemplate } = await import("@/lib/email-templates");
    const tpl = paymentSuccessTemplate({ plan, amount, expiresAt, locale: "ko" });
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.warn("[billing/charge-first] success email failed", err);
  }
}
