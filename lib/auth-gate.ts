// Logout 라우트 차단 헬퍼 — service-cleanup Phase C-2.
//
// Free 등급 정책상 비로그인 사용자는 검색·요약·TTS·트렌드 풀 분석을 이용 불가.
// 홈 트렌드 헤드라인(/api/journal/trend-headline)과 저널 호/주제 탐색은 허용 (cheap,
// 또는 home decoration). 사용량 카운트는 그 다음 단계.
//
// 사용:
//   const gate = await requireLogin();
//   if (!gate.ok) return gate.response;
//   // gate.userId, gate.email 사용 가능
//
// 라우트가 이미 자체 auth() 검사를 하고 있으면 (account/billing 등) 이 헬퍼 안 써도 됨.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { ApiError } from "@/types";

export type AuthGateResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: Response };

export async function requireLogin(): Promise<AuthGateResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json<ApiError>(
        {
          error:
            "로그인이 필요합니다. 검색·요약·TTS·풀 트렌드 분석은 로그인 사용자만 이용할 수 있습니다.",
        },
        { status: 401 }
      ),
    };
  }
  return {
    ok: true,
    userId: session.user.id,
    email: session.user.email ?? null,
  };
}
