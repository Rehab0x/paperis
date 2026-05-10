// /api/account/usage — 사용자 현재 월 사용량 + 한도 + 잔여.
// 로그인 / 비로그인 / BYOK / Pro 모두 호출 가능. UI에서 잔여 횟수 표시용.

import { getUsageSnapshot } from "@/lib/usage";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const snapshot = await getUsageSnapshot(req);
  return new Response(JSON.stringify(snapshot), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
