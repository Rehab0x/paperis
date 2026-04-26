// Drizzle 스키마 — Auth.js v5 Drizzle adapter가 요구하는 4개 표준 테이블 +
// Paperis 도메인 (user_cart, user_weights)
//
// Auth.js v5 표준 컬럼은 https://authjs.dev/getting-started/adapters/drizzle 참고.

import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

// ── Paperis 도메인 ────────────────────────────────────────────────────

// 장바구니: (userId, pmid) 유니크. paper 객체 통째 저장(수십 KB 수준이라 jsonb로 충분).
export const userCart = pgTable(
  "user_cart",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    pmid: text("pmid").notNull(),
    paper: jsonb("paper").notNull(),
    addedAt: timestamp("added_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    userPmidIdx: uniqueIndex("user_cart_user_pmid_idx").on(t.userId, t.pmid),
  })
);

// 추천 가중치: 사용자당 단일 행
export const userWeights = pgTable("user_weights", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  recency: integer("recency").notNull().default(50),
  citations: integer("citations").notNull().default(50),
  journal: integer("journal").notNull().default(50),
  niche: integer("niche").notNull().default(50),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .default(sql`now()`),
});
