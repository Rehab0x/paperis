// /api/account/onboarding — 온보딩 폼 제출 (휴대폰 + 약관).
// users 테이블의 v3 확장 컬럼만 업데이트. 임상과 선택은 PR3에서 user_specialty_prefs
// 테이블이 추가되기 전까지 클라이언트가 localStorage(specialty-prefs)에 직접 저장한다.

import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

interface OnboardingBody {
  phone?: string;
  termsAgreed?: boolean;
  marketingAgreed?: boolean;
}

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// 한국 휴대폰 번호 — 010-XXXX-XXXX 또는 01012345678 등 10~11자리 숫자.
// 사용자가 -, 공백, +82 prefix 등 다양하게 넣을 수 있어 normalize 후 검증.
function normalizePhone(raw: string): string | null {
  let s = raw.trim().replace(/[\s-]/g, "");
  if (s.startsWith("+82")) s = "0" + s.slice(3);
  if (!/^01[016789]\d{7,8}$/.test(s)) return null;
  return s;
}

export async function POST(req: Request) {
  if (!hasDb()) {
    return jsonError("DB가 설정되지 않았습니다 (DATABASE_URL 누락).", 503);
  }
  const session = await auth();
  if (!session?.user?.id) {
    return jsonError("로그인이 필요합니다.", 401);
  }

  let body: OnboardingBody;
  try {
    body = (await req.json()) as OnboardingBody;
  } catch {
    return jsonError("요청 본문이 올바른 JSON이 아닙니다.");
  }

  const rawPhone = typeof body.phone === "string" ? body.phone : "";
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return jsonError(
      "휴대폰 번호 형식이 올바르지 않습니다. 010-XXXX-XXXX 또는 +82 형식으로 입력해 주세요."
    );
  }

  if (body.termsAgreed !== true) {
    return jsonError("필수 약관에 동의해야 합니다.");
  }
  const marketingAgreed = body.marketingAgreed === true;

  try {
    const db = getDb();
    await db
      .update(users)
      .set({
        phone,
        termsAgreedAt: new Date(),
        marketingAgreed,
        onboardingDone: true,
      })
      .where(eq(users.id, session.user.id));
  } catch (err) {
    console.error("[onboarding] db update failed", err);
    return jsonError("온보딩 정보 저장에 실패했습니다.", 500);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
