// /api/cron/recurring-billing — Vercel Cron이 매일 호출. 만료된 Pro 구독을 자동결제.
//
// 보안: Authorization: Bearer ${CRON_SECRET} 검증. Vercel cron은 자동으로
// `Authorization: Bearer ${process.env.CRON_SECRET}` 헤더를 붙임 (vercel.json에서 설정).
// 외부에서 호출되면 401.
//
// 알고리즘:
//   1. SELECT users WHERE plan='pro' AND status='active' AND expiresAt <= NOW()
//   2. 각 사용자에 대해 chargeBilling
//      - DONE → expiresAt += 30일
//      - 실패 → status='suspended' (다음 cron이 다시 시도하지 않음)
//   3. 결과 집계 + 로그
//
// idempotency: orderId가 매번 새로 생성되므로 같은 사용자를 재호출해도 중복 결제
// 안 됨 (Toss Idempotency-Key는 다른 orderId면 다른 결제로 처리 — 그래서 expiresAt
// 가드가 1차 방어선).

import { NextResponse } from "next/server";
import { and, eq, lte } from "drizzle-orm";
import {
  chargeBilling,
  newOrderId,
  PRICING,
  TossApiError,
} from "@/lib/billing";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 300; // 다수 사용자 처리

const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface ChargeResult {
  userId: string;
  outcome: "renewed" | "suspended" | "skipped";
  message?: string;
}

export async function GET(req: Request) {
  // CRON_SECRET 검증
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.warn("[cron/recurring-billing] CRON_SECRET 미설정 — cron 비활성");
    return NextResponse.json(
      { error: "CRON_SECRET 미설정" },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hasDb()) {
    return NextResponse.json({ error: "DB 미설정" }, { status: 503 });
  }

  const db = getDb();
  const now = new Date();

  // 만료된 활성 Pro 구독 조회 — userRow와 join
  let due: Array<{
    userId: string;
    customerKey: string | null;
    billingKey: string | null;
    email: string | null;
    name: string | null;
  }>;
  try {
    due = await db
      .select({
        userId: subscriptions.userId,
        customerKey: subscriptions.tossCustomerKey,
        billingKey: subscriptions.tossBillingKey,
        email: users.email,
        name: users.name,
      })
      .from(subscriptions)
      .innerJoin(users, eq(users.id, subscriptions.userId))
      .where(
        and(
          eq(subscriptions.plan, "pro"),
          eq(subscriptions.status, "active"),
          lte(subscriptions.expiresAt, now)
        )
      );
  } catch (err) {
    console.error("[cron/recurring-billing] db lookup failed", err);
    return NextResponse.json(
      { error: "DB 조회 실패" },
      { status: 500 }
    );
  }

  const results: ChargeResult[] = [];

  for (const sub of due) {
    if (!sub.billingKey || !sub.customerKey) {
      results.push({
        userId: sub.userId,
        outcome: "skipped",
        message: "billingKey/customerKey 누락",
      });
      continue;
    }
    const orderId = newOrderId("pro", sub.userId);
    try {
      const payment = await chargeBilling({
        billingKey: sub.billingKey,
        customerKey: sub.customerKey,
        amount: PRICING.proMonthly.amount,
        orderId,
        orderName: PRICING.proMonthly.label,
        customerEmail: sub.email ?? undefined,
        customerName: sub.name ?? undefined,
      });
      if (payment.status !== "DONE") {
        await suspend(sub.userId, `status=${payment.status}`);
        results.push({
          userId: sub.userId,
          outcome: "suspended",
          message: `Toss status: ${payment.status}`,
        });
        continue;
      }
      const newExpires = new Date(Date.now() + 30 * MS_PER_DAY);
      await db
        .update(subscriptions)
        .set({
          expiresAt: newExpires,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(subscriptions.userId, sub.userId));
      results.push({ userId: sub.userId, outcome: "renewed" });
    } catch (err) {
      const msg =
        err instanceof TossApiError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : "unknown";
      console.warn(
        "[cron/recurring-billing] charge failed",
        sub.userId,
        msg
      );
      await suspend(sub.userId, msg);
      results.push({ userId: sub.userId, outcome: "suspended", message: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    processedAt: now.toISOString(),
    total: results.length,
    renewed: results.filter((r) => r.outcome === "renewed").length,
    suspended: results.filter((r) => r.outcome === "suspended").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    results,
  });

  async function suspend(userId: string, reason: string) {
    try {
      await db
        .update(subscriptions)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(eq(subscriptions.userId, userId));
    } catch (err) {
      console.error(
        "[cron/recurring-billing] suspend failed",
        userId,
        reason,
        err
      );
    }
  }
}
