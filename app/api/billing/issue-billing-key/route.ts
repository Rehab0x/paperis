// /api/billing/issue-billing-key — Pro 구독 카드 등록 후 빌링키 발급.
//
// 흐름:
//   1. 클라가 Toss SDK requestBillingAuth → 카드 인증 → successUrl?customerKey&authKey
//   2. /billing/success가 plan='pro'로 진입했으면 이 라우트 호출
//   3. 서버: POST /billing/authorizations/issue → billingKey 반환
//   4. subscriptions에 customerKey/billingKey 저장 (status='inactive' — 첫 결제 전)
//   5. 클라가 이어서 /api/billing/charge-first 호출 → 첫 달 결제 + 활성화
//
// 분리 이유: billingKey 발급과 첫 결제는 다른 Toss API. 발급만 했고 첫 결제 실패해도
// billingKey는 유지되어 재시도 가능.
//
// 입력: { customerKey, authKey }
// 출력: { billingKey, cardCompany, cardNumber }

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { issueBillingKey, TossApiError } from "@/lib/billing";
import { getDb, hasDb } from "@/lib/db";
import { subscriptions } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

interface IssueBody {
  customerKey?: string;
  authKey?: string;
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

  let body: IssueBody;
  try {
    body = (await req.json()) as IssueBody;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }
  const customerKey = typeof body.customerKey === "string" ? body.customerKey.trim() : "";
  const authKey = typeof body.authKey === "string" ? body.authKey.trim() : "";
  if (!customerKey || !authKey) {
    return NextResponse.json<ApiError>(
      { error: "customerKey와 authKey가 필요합니다." },
      { status: 400 }
    );
  }
  // customerKey는 user.id여야 함 — 다른 사용자 빌링키 발급 차단
  if (customerKey !== session.user.id) {
    return NextResponse.json<ApiError>(
      { error: "사용자 정보가 일치하지 않습니다." },
      { status: 403 }
    );
  }

  let result;
  try {
    result = await issueBillingKey({ customerKey, authKey });
  } catch (err) {
    if (err instanceof TossApiError) {
      console.warn("[billing/issue-billing-key] toss api error", err.code, err.message);
      return NextResponse.json<ApiError>(
        { error: `빌링키 발급 실패: ${err.message} (${err.code})` },
        { status: err.status >= 400 && err.status < 500 ? err.status : 502 }
      );
    }
    console.error("[billing/issue-billing-key] unexpected error", err);
    return NextResponse.json<ApiError>(
      { error: "빌링키 발급 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }

  // subscriptions row 저장 — 빌링키만 잡아두고 status는 'inactive', plan은 비워둠
  // (첫 결제 성공 후 charge-first에서 활성화)
  try {
    const db = getDb();
    await db
      .insert(subscriptions)
      .values({
        userId: session.user.id,
        status: "inactive",
        plan: null,
        expiresAt: null,
        tossCustomerKey: customerKey,
        tossBillingKey: result.billingKey,
      })
      .onConflictDoUpdate({
        target: subscriptions.userId,
        set: {
          tossCustomerKey: customerKey,
          tossBillingKey: result.billingKey,
          updatedAt: new Date(),
        },
      });
  } catch (err) {
    console.error("[billing/issue-billing-key] db upsert failed", err);
    return NextResponse.json<ApiError>(
      { error: "빌링키 저장에 실패했습니다." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    billingKey: result.billingKey,
    cardCompany: result.cardCompany,
    cardNumber: result.cardNumber,
  });
}
