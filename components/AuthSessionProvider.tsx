"use client";

// next-auth/react SessionProvider wrapper — useSession()을 사용하는 클라
// 컴포넌트(AuthMenu 등)는 이 Provider 안에 들어가야 한다.
//
// app/layout.tsx에서 다른 Provider들과 함께 wrapping. FEATURE_AUTH=0이어도
// 그대로 wrapping해도 무해 — 미로그인 상태로 머물 뿐.

import { SessionProvider } from "next-auth/react";

export default function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
