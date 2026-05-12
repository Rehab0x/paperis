// 루트 / 진입의 fallback — 미들웨어가 NEXT_PUBLIC_FEATURE_LANDING 분기로 먼저
// 처리하지만, edge runtime 실패 등 예외 경로에서 이 페이지가 렌더될 수 있어
// 안전하게 /app으로 server redirect.

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/app");
}
