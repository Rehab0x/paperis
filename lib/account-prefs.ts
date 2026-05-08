// Server-side helpers: 사용자의 임상과·저널 prefs를 DB에서 load/save.
//
// 멱등 upsert + notInArray delete 패턴 (v1.1 cart load-bearing 결정).
// Neon HTTP는 statement-level이라 트랜잭션 X → race condition 회피 위해 delete +
// insert 대신 onConflictDoUpdate + notInArray로 처리.

import { and, eq, notInArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  userJournalAdditions,
  userJournalBlocks,
  userJournalFavorites,
  userSpecialties,
} from "@/lib/db/schema";
import type { JournalSummary } from "@/lib/openalex";

/**
 * 사용자의 모든 prefs를 한 번에 직렬화한 형태.
 * 클라(localStorage 4종)와 DB(4 테이블) 사이의 wire format.
 */
export interface AccountPrefs {
  /** 임상과 ID 배열, 순서 보존 */
  specialties: string[];
  /** specialtyId → openalexId[] */
  blocks: Record<string, string[]>;
  /** specialtyId → JournalSummary[] (메타 포함) */
  additions: Record<string, JournalSummary[]>;
  /** specialtyId → openalexId[] */
  favorites: Record<string, string[]>;
}

export function emptyPrefs(): AccountPrefs {
  return { specialties: [], blocks: {}, additions: {}, favorites: {} };
}

export function isPrefsEmpty(p: AccountPrefs): boolean {
  return (
    p.specialties.length === 0 &&
    Object.keys(p.blocks).length === 0 &&
    Object.keys(p.additions).length === 0 &&
    Object.keys(p.favorites).length === 0
  );
}

/** 사용자의 4개 테이블을 한 번에 load → AccountPrefs */
export async function loadAccountPrefs(userId: string): Promise<AccountPrefs> {
  const db = getDb();
  const [specRows, blockRows, addRows, favRows] = await Promise.all([
    db
      .select()
      .from(userSpecialties)
      .where(eq(userSpecialties.userId, userId)),
    db
      .select()
      .from(userJournalBlocks)
      .where(eq(userJournalBlocks.userId, userId)),
    db
      .select()
      .from(userJournalAdditions)
      .where(eq(userJournalAdditions.userId, userId)),
    db
      .select()
      .from(userJournalFavorites)
      .where(eq(userJournalFavorites.userId, userId)),
  ]);

  // 임상과: sortOrder asc 정렬, addedAt asc 보조
  const specialties = [...specRows]
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.addedAt.getTime() - b.addedAt.getTime();
    })
    .map((r) => r.specialtyId);

  const blocks: Record<string, string[]> = {};
  for (const r of blockRows) {
    (blocks[r.specialtyId] ??= []).push(r.openalexId);
  }

  const additions: Record<string, JournalSummary[]> = {};
  for (const r of addRows) {
    (additions[r.specialtyId] ??= []).push(r.journal as JournalSummary);
  }

  const favorites: Record<string, string[]> = {};
  for (const r of favRows) {
    (favorites[r.specialtyId] ??= []).push(r.openalexId);
  }

  return { specialties, blocks, additions, favorites };
}

/**
 * 클라가 보낸 전체 prefs 상태로 DB를 reset (멱등 PUT).
 * onConflictDoUpdate + notInArray delete 패턴으로 race-safe 보장 (v1.1 load-bearing).
 */
export async function saveAccountPrefs(
  userId: string,
  prefs: AccountPrefs
): Promise<void> {
  const db = getDb();

  // ── 1. user_specialties ──
  if (prefs.specialties.length > 0) {
    const rows = prefs.specialties.map((specialtyId, i) => ({
      userId,
      specialtyId,
      sortOrder: i,
    }));
    await db
      .insert(userSpecialties)
      .values(rows)
      .onConflictDoUpdate({
        target: [userSpecialties.userId, userSpecialties.specialtyId],
        set: {
          sortOrder: sqlExcluded("sort_order"),
        },
      });
    await db
      .delete(userSpecialties)
      .where(
        and(
          eq(userSpecialties.userId, userId),
          notInArray(userSpecialties.specialtyId, prefs.specialties)
        )
      );
  } else {
    await db.delete(userSpecialties).where(eq(userSpecialties.userId, userId));
  }

  // ── 2. user_journal_blocks (모든 specialtyId의 합집합으로 reset) ──
  await syncManyToManyOpenalex(
    userId,
    "blocks",
    prefs.blocks,
    userJournalBlocks
  );

  // ── 3. user_journal_additions (jsonb 함께) ──
  const allAddRows: {
    userId: string;
    specialtyId: string;
    openalexId: string;
    journal: JournalSummary;
  }[] = [];
  for (const [specialtyId, journals] of Object.entries(prefs.additions)) {
    for (const j of journals) {
      allAddRows.push({
        userId,
        specialtyId,
        openalexId: j.openAlexId,
        journal: j,
      });
    }
  }
  if (allAddRows.length > 0) {
    await db
      .insert(userJournalAdditions)
      .values(allAddRows)
      .onConflictDoUpdate({
        target: [
          userJournalAdditions.userId,
          userJournalAdditions.specialtyId,
          userJournalAdditions.openalexId,
        ],
        set: {
          journal: sqlExcluded("journal"),
        },
      });
  }
  // 사용자가 보낸 set 외의 row는 delete — specialty 별로
  await pruneByCompositeKey(
    userId,
    "additions",
    prefs.additions,
    userJournalAdditions
  );
  // 사용자 prefs.additions에 없는 specialty의 row 전체 삭제
  await pruneSpecialtiesNotIn(
    userId,
    Object.keys(prefs.additions),
    userJournalAdditions
  );

  // ── 4. user_journal_favorites ──
  await syncManyToManyOpenalex(
    userId,
    "favorites",
    prefs.favorites,
    userJournalFavorites
  );
}

// ── 헬퍼 함수들 ─────────────────────────────────────────────────────

import { sql } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";

// onConflictDoUpdate에서 excluded.X 참조 SQL fragment 생성
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

/**
 * specialtyId → openalexId[] 형태의 prefs를 (userId, specialtyId, openalexId) 컴포지트
 * PK 테이블에 sync. 이 테이블은 추가 컬럼 없이 PK 3개로 행 존재 여부만 의미.
 *
 * 알고리즘:
 * 1. 보낸 set에 있는 모든 row를 onConflictDoNothing insert
 * 2. 각 specialtyId 안에서 보낸 openalexId 외의 row 삭제
 * 3. 보낸 specialtyId 외의 row 전체 삭제
 */
async function syncManyToManyOpenalex(
  userId: string,
  _label: string,
  data: Record<string, string[]>,
  table: typeof userJournalBlocks | typeof userJournalFavorites
): Promise<void> {
  const db = getDb();
  const rows: { userId: string; specialtyId: string; openalexId: string }[] =
    [];
  for (const [specialtyId, ids] of Object.entries(data)) {
    for (const openalexId of ids) {
      rows.push({ userId, specialtyId, openalexId });
    }
  }
  if (rows.length > 0) {
    await db.insert(table).values(rows).onConflictDoNothing();
  }
  // 각 specialtyId 안에서 보낸 openalexId set 외 삭제
  for (const [specialtyId, ids] of Object.entries(data)) {
    if (ids.length === 0) {
      await db
        .delete(table)
        .where(
          and(eq(table.userId, userId), eq(table.specialtyId, specialtyId))
        );
    } else {
      await db
        .delete(table)
        .where(
          and(
            eq(table.userId, userId),
            eq(table.specialtyId, specialtyId),
            notInArray(table.openalexId, ids)
          )
        );
    }
  }
  // 보낸 specialtyId 외의 row 전체 삭제
  await pruneSpecialtiesNotIn(userId, Object.keys(data), table);
}

async function pruneByCompositeKey(
  userId: string,
  _label: string,
  data: Record<string, JournalSummary[]>,
  table: typeof userJournalAdditions
): Promise<void> {
  const db = getDb();
  for (const [specialtyId, journals] of Object.entries(data)) {
    const ids = journals.map((j) => j.openAlexId);
    if (ids.length === 0) {
      await db
        .delete(table)
        .where(
          and(eq(table.userId, userId), eq(table.specialtyId, specialtyId))
        );
    } else {
      await db
        .delete(table)
        .where(
          and(
            eq(table.userId, userId),
            eq(table.specialtyId, specialtyId),
            notInArray(table.openalexId, ids)
          )
        );
    }
  }
}

async function pruneSpecialtiesNotIn(
  userId: string,
  keepSpecialtyIds: string[],
  table:
    | typeof userJournalBlocks
    | typeof userJournalAdditions
    | typeof userJournalFavorites
): Promise<void> {
  const db = getDb();
  if (keepSpecialtyIds.length === 0) {
    // 보낸 set이 비어있으면 사용자의 모든 row 삭제
    await db.delete(table).where(eq(table.userId, userId));
  } else {
    await db
      .delete(table)
      .where(
        and(
          eq(table.userId, userId),
          notInArray(table.specialtyId, keepSpecialtyIds)
        )
      );
  }
}

/**
 * localStorage / DB의 두 prefs를 합집합 머지.
 * - specialties: dedupe하면서 local 순서 우선, 그 뒤에 db 추가분
 * - blocks/favorites: specialtyId 별로 union (Set)
 * - additions: openAlexId 별로 union, local 메타가 더 최신이라 가정해 우선
 */
export function mergePrefs(
  local: AccountPrefs,
  db: AccountPrefs
): AccountPrefs {
  const specialties = dedupeOrdered([...local.specialties, ...db.specialties]);
  const blocks = mergeStringArrayMap(local.blocks, db.blocks);
  const favorites = mergeStringArrayMap(local.favorites, db.favorites);
  const additions = mergeJournalMap(local.additions, db.additions);
  return { specialties, blocks, additions, favorites };
}

function dedupeOrdered(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

function mergeStringArrayMap(
  a: Record<string, string[]>,
  b: Record<string, string[]>
): Record<string, string[]> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, string[]> = {};
  for (const k of keys) {
    out[k] = dedupeOrdered([...(a[k] ?? []), ...(b[k] ?? [])]);
  }
  return out;
}

function mergeJournalMap(
  a: Record<string, JournalSummary[]>,
  b: Record<string, JournalSummary[]>
): Record<string, JournalSummary[]> {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, JournalSummary[]> = {};
  for (const k of keys) {
    const seen = new Set<string>();
    const merged: JournalSummary[] = [];
    for (const j of [...(a[k] ?? []), ...(b[k] ?? [])]) {
      if (!seen.has(j.openAlexId)) {
        seen.add(j.openAlexId);
        merged.push(j);
      }
    }
    out[k] = merged;
  }
  return out;
}
