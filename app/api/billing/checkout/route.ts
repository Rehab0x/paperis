// /api/billing/checkout — 결제 시작 시 서버에서 orderId/금액을 발급.
//
// 클라이언트가 결제창을 열기 전 호출. orderId·amount를 클라가 임의로 만들면
// "사용자가 100원 보내고 BYOK plan 받기" 같은 시도가 가능하므로 서버가 발급한다.
// /api/billing/confirm에서도 amount를 다시 검증하므로 이중 가드.
//
// 입력: { plan: "byok" | "pro" }
// 출력: { orderId, amount, orderName, customerKey, customerEmail, customerName }
//
// 로그인 + 온보딩 완료 + 휴대폰 등록을 모두 요구. (Toss billing은 customerMobilePhone
// 필수 — 1회 결제도 같은 사용자 채널로 통일)

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { newOrderId, PRICING } from "@/lib/billing";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

interface CheckoutBody {
  plan?: "byok" | "pro";
}

export interface CheckoutResponse {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  customerEmail: string;
  customerName: string;
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

  let body: CheckoutBody;
  try {
    body = (await req.json()) as CheckoutBody;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const plan = body.plan === "pro" ? "pro" : body.plan === "byok" ? "byok" : null;
  if (!plan) {
    return NextResponse.json<ApiError>(
      { error: "plan은 'byok' 또는 'pro'여야 합니다." },
      { status: 400 }
    );
  }

  // 사용자 정보 조회 — onboarding 완료 + 휴대폰 필수
  let userRow: {
    id: string;
    email: string | null;
    name: string | null;
    phone: string | null;
    onboardingDone: boolean;
  } | null = null;
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        phone: users.phone,
        onboardingDone: users.onboardingDone,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);
    userRow = rows[0] ?? null;
  } catch (err) {
    console.error("[billing/checkout] user lookup failed", err);
    return NextResponse.json<ApiError>(
      { error: "사용자 정보 조회에 실패했습니다." },
      { status: 500 }
    );
  }
  if (!userRow) {
    return NextResponse.json<ApiError>(
      { error: "사용자 정보가 없습니다." },
      { status: 404 }
    );
  }
  if (!userRow.onboardingDone || !userRow.phone) {
    return NextResponse.json<ApiError>(
      { error: "결제 전에 프로필(휴대폰·약관)을 완성해 주세요." },
      { status: 400 }
    );
  }
  if (!userRow.email) {
    return NextResponse.json<ApiError>(
      { error: "이메일이 없습니다. 다시 로그인해 주세요." },
      { status: 400 }
    );
  }

  const pricing = plan === "pro" ? PRICING.proMonthly : PRICING.byokOnce;
  const orderId = newOrderId(plan, userRow.id);

  const response: CheckoutResponse = {
    orderId,
    amount: pricing.amount,
    orderName: pricing.label,
    // customerKey — Toss billing 기준 식별자. user.id 사용 (사용자별 고유)
    customerKey: userRow.id,
    customerEmail: userRow.email,
    customerName: userRow.name ?? userRow.email.split("@")[0] ?? "Paperis 사용자",
  };

  return NextResponse.json(response);
}
