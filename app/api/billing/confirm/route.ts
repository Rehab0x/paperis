// /api/billing/confirm — Toss 결제창 successUrl에서 받은 paymentKey/orderId/amount를
// 서버 confirmPayment로 확정. 성공하면 subscriptions.plan='byok' status='active'.
//
// 보안:
//   1. orderId prefix가 "byok-{user.id-prefix}-" 와 일치하는지 검증
//   2. amount가 PRICING.byokOnce.amount와 일치하는지 검증
//   3. confirmPayment는 idempotency-key=orderId — 같은 orderId 재호출 안전
//
// 입력: { paymentKey, orderId, amount }
// 출력: { ok: true, plan, status }

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { confirmPayment, PRICING, TossApiError } from "@/lib/billing";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

interface ConfirmBody {
  paymentKey?: string;
  orderId?: string;
  amount?: number;
}

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

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const paymentKey = typeof body.paymentKey === "string" ? body.paymentKey.trim() : "";
  const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
  const amount = typeof body.amount === "number" ? body.amount : Number(body.amount);

  if (!paymentKey || !orderId || !Number.isFinite(amount)) {
    return NextResponse.json<ApiError>(
      { error: "paymentKey, orderId, amount가 모두 필요합니다." },
      { status: 400 }
    );
  }

  // BYOK orderId 패턴 검증 — `byok-{userIdPrefix}-{ts}-{rand}`
  // 사용자가 다른 사용자 orderId로 confirm 호출하면 거부.
  const userIdPrefix = session.user.id.slice(0, 16);
  if (!orderId.startsWith(`byok-${userIdPrefix}-`)) {
    return NextResponse.json<ApiError>(
      { error: "주문 정보와 사용자가 일치하지 않습니다." },
      { status: 403 }
    );
  }

  // 금액 검증
  if (amount !== PRICING.byokOnce.amount) {
    return NextResponse.json<ApiError>(
      {
        error: `결제 금액이 일치하지 않습니다. 기대값 ${PRICING.byokOnce.amount}원.`,
      },
      { status: 400 }
    );
  }

  // Toss confirm
  let payment;
  try {
    payment = await confirmPayment({ paymentKey, orderId, amount });
  } catch (err) {
    if (err instanceof TossApiError) {
      console.warn("[billing/confirm] toss api error", err.code, err.message);
      return NextResponse.json<ApiError>(
        { error: `결제 확정 실패: ${err.message} (${err.code})` },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    console.error("[billing/confirm] unexpected error", err);
    return NextResponse.json<ApiError>(
      { error: "결제 확정 중 알 수 없는 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  if (payment.status !== "DONE") {
    return NextResponse.json<ApiError>(
      { error: `결제 상태가 완료가 아닙니다: ${payment.status}` },
      { status: 400 }
    );
  }

  // subscriptions upsert — plan='byok' status='active' (BYOK는 평생, expiresAt=null)
  try {
    const db = getDb();
    await db
      .insert(subscriptions)
      .values({
        userId: session.user.id,
        status: "active",
        plan: "byok",
        expiresAt: null,
        tossCustomerKey: session.user.id,
        tossBillingKey: null,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          status: "active",
          plan: "byok",
          expiresAt: null,
          tossCustomerKey: session.user.id,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    // 결제는 됐는데 DB 실패 — 사용자에겐 결제 완료 알리고 운영자가 수동 복구해야 함
    console.error(
      "[billing/confirm] payment OK but DB upsert failed",
      { userId: session.user.id, orderId, paymentKey },
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

  return NextResponse.json({
    ok: true,
    plan: "byok" as const,
    status: "active" as const,
    paymentKey: payment.paymentKey,
    orderId: payment.orderId,
    approvedAt: payment.approvedAt,
  });
}
