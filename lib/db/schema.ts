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
  jsonb,
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

// ── v3 사용자 임상과·저널 prefs (M4 PR3) ──────────────────────────────
// localStorage 4종(specialty-prefs / journal-blocks / journal-additions /
// journal-favorites)을 DB로 마이그레이션. 디바이스 간 동기화 + Auth 사용자 영속.
//
// 비로그인 사용자는 그대로 localStorage만 사용. 로그인 시 AccountSyncProvider가
// localStorage ↔ DB 머지 + 변경 시 debounced PUT.

/** 사용자가 선택한 임상과 + 표시 순서 */
export const userSpecialties = pgTable(
  "user_specialties",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    specialtyId: text("specialty_id").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: timestamp("added_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.specialtyId] }),
  })
);

/** 임상과별로 사용자가 ✕ 숨긴 저널 */
export const userJournalBlocks = pgTable(
  "user_journal_blocks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    specialtyId: text("specialty_id").notNull(),
    /** OpenAlex source URN (예: "https://openalex.org/S172573765") */
    openalexId: text("openalex_id").notNull(),
    blockedAt: timestamp("blocked_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.specialtyId, t.openalexId] }),
  })
);

/** 임상과별로 사용자가 직접 추가한 저널. journal jsonb로 메타 함께 저장 */
export const userJournalAdditions = pgTable(
  "user_journal_additions",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    specialtyId: text("specialty_id").notNull(),
    openalexId: text("openalex_id").notNull(),
    /** JournalSummary 객체 — UI 표시 시 OpenAlex 재호출 회피 */
    journal: jsonb("journal").notNull(),
    addedAt: timestamp("added_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.specialtyId, t.openalexId] }),
  })
);

/** 임상과별로 사용자가 ⭐ 즐겨찾기한 저널 */
export const userJournalFavorites = pgTable(
  "user_journal_favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    specialtyId: text("specialty_id").notNull(),
    openalexId: text("openalex_id").notNull(),
    favoritedAt: timestamp("favorited_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.specialtyId, t.openalexId] }),
  })
);

// ── v3 M6 — 사용량 카운터 + M7 결제(미리 schema만) ─────────────────────

/**
 * 월별 사용량. identityKey는 `user_id` (로그인) 또는 `anon:{uuid}` (비로그인).
 * yearMonth는 KST 기준 "YYYY-MM" — 매달 자연 분리되어 cron 없이도 lazy reset.
 *
 * BYOK/Pro 사용자는 lib/usage.ts에서 사전 분기되어 카운트 자체 안 일어남.
 */
export const usageMonthly = pgTable(
  "usage_monthly",
  {
    identityKey: text("identity_key").notNull(),
    yearMonth: text("year_month").notNull(),
    /** 호/주제/트렌드 실행 횟수 */
    curationCount: integer("curation_count").notNull().default(0),
    /** TTS narration 변환 횟수 */
    ttsCount: integer("tts_count").notNull().default(0),
    /** 풀텍스트 요약 호출 횟수 */
    fulltextCount: integer("fulltext_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identityKey, t.yearMonth] }),
  })
);

/**
 * 결제 구독 — M7에서 채워짐. M6에는 schema만 미리 (사용 안 함, plan 조회 시 fallback).
 * status: active / cancelled / suspended
 * plan: pro / byok
 */
export const subscriptions = pgTable("subscriptions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("inactive"),
  plan: text("plan"),
  expiresAt: timestamp("expires_at", { mode: "date" }),
  tossCustomerKey: text("toss_customer_key"),
  tossBillingKey: text("toss_billing_key"),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .default(sql`now()`),
});

/**
 * 관리자 감사 로그 — admin 액션 영구 기록.
 *
 * email은 스냅샷(adminEmail/targetEmail) — 사용자 row가 추후 변경·삭제되어도 로그는 보존.
 * targetUserId는 FK 없음 (사용자 삭제 후에도 로그 유지).
 * action: 'plan_change' | 'subscription_cancel' | 'user_delete'
 * details: 액션별 컨텍스트 (fromPlan/toPlan/durationDays/expiresAt 등)
 */
export const adminAuditLog = pgTable("admin_audit_log", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  adminUserId: text("admin_user_id").notNull(),
  adminEmail: text("admin_email"),
  action: text("action").notNull(),
  targetUserId: text("target_user_id").notNull(),
  targetEmail: text("target_email"),
  details: jsonb("details"),
  createdAt: timestamp("created_at", { mode: "date" })
    .notNull()
    .default(sql`now()`),
});
