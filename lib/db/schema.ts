// Drizzle 스키마 — Auth.js v5 Drizzle adapter가 요구하는 4개 표준 테이블 +
// Paperis v3 도메인 (users 확장).
//
// Auth.js v5 표준 컬럼은 https://authjs.dev/getting-started/adapters/drizzle 참고.
// users 테이블의 phone/terms_agreed_at/marketing_agreed/onboarding_done은 v3 신규.
// 마이그레이션은 add-only — drop column 금지.
//
// user_journal_prefs / user_journal_blocks / user_journal_additions /
// user_journal_favorites는 PR3에서 추가 예정 (localStorage → DB 마이그레이션).

import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// ── Auth.js 표준 ──────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // ── v3 확장 ──
  /** Toss Payments 빌링 키 발급에 필수. 온보딩에서 수집 */
  phone: text("phone"),
  /** 약관(서비스/개인정보/3자제공) 동의 시각 */
  termsAgreedAt: timestamp("terms_agreed_at", { mode: "date" }),
  /** 마케팅 수신 동의 (선택) */
  marketingAgreed: boolean("marketing_agreed").notNull().default(false),
  /** 온보딩 완료 여부. false면 모든 라우트가 /onboarding으로 redirect */
  onboardingDone: boolean("onboarding_done").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .default(sql`now()`),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    pk: primaryKey({ columns: [account.provider, account.providerAccountId] }),
  })
);

export const sessions = pgTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    pk: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);
