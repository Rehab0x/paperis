// Auth.js v5 — Google OAuth + Drizzle (Neon Postgres) adapter.
//
// 환경변수 (.env.local):
//   AUTH_SECRET           세션 암호화 키 — `npx auth secret` 또는 openssl rand
//   AUTH_GOOGLE_ID        Google OAuth Client ID
//   AUTH_GOOGLE_SECRET    Google OAuth Client Secret
//   DATABASE_URL          Neon 연결 문자열
//
// 환경변수 누락 시 빌드 통과 + signIn 시도하면 자연스럽게 실패 — FEATURE_AUTH=0
// 으로 UI를 가려두면 사용자에게 시도 경로 자체가 안 보인다.

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { getDb, hasDb } from "@/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { welcomeTemplate } from "@/lib/email-templates";

// 환경변수 4개가 모두 있어야 정식 NextAuth 설정. 부재 시 placeholder로 빌드만
// 통과시키고, 실제 signIn은 unauthenticated 상태로 머문다.
const HAS_AUTH_ENV = Boolean(
  hasDb() &&
    process.env.AUTH_SECRET &&
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET
);

export const { handlers, signIn, signOut, auth } = NextAuth(
  HAS_AUTH_ENV
    ? {
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
          // database 세션 전략에서도 클라이언트가 session.user.id를 직접 받을 수
          // 있게 명시 매핑 (v1.1 load-bearing 결정).
          // user는 DrizzleAdapter가 DB에서 가져온 행 — onboardingDone도 그대로 매핑.
          session({ session, user }) {
            if (session.user && user) {
              session.user.id = user.id;
              const onboardingDone = (user as { onboardingDone?: boolean })
                .onboardingDone;
              session.user.onboardingDone = Boolean(onboardingDone);
            }
            return session;
          },
        },
        events: {
          // 사용자가 처음 만들어졌을 때 1회. fire-and-forget — 이메일 실패해도 가입은 성공.
          // RESEND_API_KEY 없으면 sendEmail이 silent skip.
          async createUser({ user }) {
            if (!user.email) return;
            const tpl = welcomeTemplate({ name: user.name, locale: "ko" });
            // await but errors caught inside sendEmail — 시그널 막힘 없도록 단순 호출
            await sendEmail({
              to: user.email,
              subject: tpl.subject,
              html: tpl.html,
            });
          },
        },
        pages: {},
      }
    : {
        // env 없을 때 placeholder — 빌드 통과용. providers []라 signIn 시도해도
        // "no provider" 응답.
        providers: [],
      }
);
