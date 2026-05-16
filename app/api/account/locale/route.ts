// /api/account/locale — 사용자가 이메일·UI locale 변경.
//
// PATCH body: { locale: "ko" | "en" }
//
// users.locale 갱신. 클라이언트는 추가로 paperis.locale 쿠키도 직접 set해 UI 즉시
// 반영 (서버는 쿠키 안 건드림 — 이중 출처 회피).

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb, hasDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

interface PatchBody {
  locale?: unknown;
}

export async function PATCH(req: Request) {
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

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const locale = body.locale === "en" ? "en" : body.locale === "ko" ? "ko" : null;
  if (!locale) {
    return NextResponse.json<ApiError>(
      { error: "locale은 'ko' 또는 'en'이어야 합니다." },
      { status: 400 }
    );
  }

  try {
    const db = getDb();
    await db
      .update(users)
      .set({ locale })
      .where(eq(users.id, session.user.id));
    return NextResponse.json({ ok: true, locale });
  } catch (err) {
    console.error("[account/locale] failed", err);
    return NextResponse.json<ApiError>(
      { error: "locale 저장에 실패했습니다." },
      { status: 500 }
    );
  }
}
