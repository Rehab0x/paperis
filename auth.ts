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
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { parseGoogleLocale } from "@/lib/email-locale";
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
          // 첫 가입 시 1회 welcome 이메일 + locale 저장. signIn에서 처리하는 이유:
          // createUser는 profile에 접근 못 함. signIn은 isNewUser + profile 모두 제공해
          // Google profile.locale을 감지해 DB에 저장 + 첫 이메일도 해당 locale로 발송.
          async signIn({ user, profile, isNewUser }) {
            if (!isNewUser || !user.email || !user.id) return;
            const locale = parseGoogleLocale(
              (profile as { locale?: unknown } | null)?.locale
            );
            // DB locale 업데이트 (이후 모든 이메일 트리거가 이 값 참조)
            try {
              await getDb()
                .update(users)
                .set({ locale })
                .where(eq(users.id, user.id));
            } catch (err) {
              console.warn("[auth] locale update failed", err);
            }
            // welcome 이메일 — 감지된 locale로
            const tpl = welcomeTemplate({ name: user.name, locale });
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
