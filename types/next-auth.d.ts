// next-auth 타입 augmentation — Session.user.id와 v3 신규 필드(onboardingDone) 추가.
// session 콜백에서 user 객체를 명시 매핑하므로 Session.user에 노출된다.

import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    /** v3 신규 — 온보딩(휴대폰+약관) 완료 여부. DrizzleAdapter가 users 테이블에서 가져온다. */
    onboardingDone?: boolean;
  }

  interface Session {
    user: {
      id: string;
      onboardingDone?: boolean;
    } & DefaultSession["user"];
  }
}
