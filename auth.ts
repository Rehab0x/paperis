// Auth.js v5 — Google OAuth + Drizzle (Neon Postgres) adapter
//
// 환경변수:
//   AUTH_SECRET           NEXTAUTH 세션 암호화 키
//   AUTH_GOOGLE_ID        Google OAuth Client ID
//   AUTH_GOOGLE_SECRET    Google OAuth Client Secret
//   DATABASE_URL          Neon 연결 문자열 (Drizzle adapter 내부에서 사용)

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { getDb } from "@/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    // database 세션 전략에서도 클라이언트가 session.user.id를 직접 받을 수 있게 명시 매핑
    session({ session, user }) {
      if (session.user && user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  // 로그인 후엔 홈으로 — 별도 로그인 페이지를 두지 않고 헤더 버튼/모달로 처리
  pages: {},
});
