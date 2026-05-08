"use client";

// 로그인 사용자의 localStorage 4종(specialty/blocks/additions/favorites)을 DB와
// 양방향 동기화.
//
// 흐름:
// 1. status === "authenticated"가 되면 1회 머지 (GET → DB와 localStorage 합집합 →
//    합친 결과를 localStorage write + DB PUT)
// 2. localStorage 변경(subscribe)마다 debounced 500ms PUT
// 3. 로그아웃 시 머지 ref 리셋 — 다음 로그인 때 다시 머지
//
// 비로그인 사용자는 아무 일 안 함 (이전과 동일).

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  getAllAddedJournals,
  subscribeJournalAdditions,
} from "@/lib/journal-additions";
import {
  getAllJournalBlocks,
  subscribeJournalBlocks,
} from "@/lib/journal-blocks";
import {
  getAllJournalFavorites,
  subscribeJournalFavorites,
} from "@/lib/journal-favorites";
import {
  getMySpecialties,
  setMySpecialties,
  subscribeMySpecialties,
} from "@/lib/specialty-prefs";
import type { AccountPrefs } from "@/lib/account-prefs";

const STORAGE_KEYS = {
  specialties: "paperis.my_specialties",
  blocks: "paperis.journal_blocks",
  additions: "paperis.journal_additions",
  favorites: "paperis.journal_favorites",
};

function collectLocal(): AccountPrefs {
  const specialties = getMySpecialties() ?? [];
  return {
    specialties,
    blocks: getAllJournalBlocks(),
    additions: getAllAddedJournals(),
    favorites: getAllJournalFavorites(),
  };
}

function isLocalEmpty(p: AccountPrefs): boolean {
  return (
    p.specialties.length === 0 &&
    Object.keys(p.blocks).length === 0 &&
    Object.keys(p.additions).length === 0 &&
    Object.keys(p.favorites).length === 0
  );
}

function isDbEmpty(p: AccountPrefs): boolean {
  return isLocalEmpty(p);
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

function mergePrefs(local: AccountPrefs, db: AccountPrefs): AccountPrefs {
  // specialties: local 순서 우선 + DB에만 있는 것 뒤에 추가
  const specialties = dedupeOrdered([...local.specialties, ...db.specialties]);
  // blocks/favorites: specialty별 합집합
  const merge2 = (
    a: Record<string, string[]>,
    b: Record<string, string[]>
  ): Record<string, string[]> => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const out: Record<string, string[]> = {};
    for (const k of keys) {
      out[k] = dedupeOrdered([...(a[k] ?? []), ...(b[k] ?? [])]);
    }
    return out;
  };
  const blocks = merge2(local.blocks, db.blocks);
  const favorites = merge2(local.favorites, db.favorites);
  // additions: openAlexId별 합집합 (local 메타 우선)
  const additionsKeys = new Set([
    ...Object.keys(local.additions),
    ...Object.keys(db.additions),
  ]);
  const additions: Record<string, AccountPrefs["additions"][string]> = {};
  for (const k of additionsKeys) {
    const seen = new Set<string>();
    const merged: AccountPrefs["additions"][string] = [];
    for (const j of [...(local.additions[k] ?? []), ...(db.additions[k] ?? [])]) {
      if (!seen.has(j.openAlexId)) {
        seen.add(j.openAlexId);
        merged.push(j);
      }
    }
    additions[k] = merged;
  }
  return { specialties, blocks, additions, favorites };
}

/**
 * DB에서 받은 prefs를 localStorage에 그대로 write. 각 module의 setter 또는 직접
 * localStorage write + dispatchEvent.
 */
function applyToLocal(prefs: AccountPrefs): void {
  if (typeof window === "undefined") return;

  // specialties — setMySpecialties는 빈 배열일 때 키 제거 + notify까지 처리
  setMySpecialties(prefs.specialties);

  // 나머지 3종은 lib에 setAll API가 없어 localStorage 직접 write + custom event
  // dispatch (각 lib의 subscribe가 로 picking)
  try {
    if (Object.keys(prefs.blocks).length === 0) {
      localStorage.removeItem(STORAGE_KEYS.blocks);
    } else {
      localStorage.setItem(STORAGE_KEYS.blocks, JSON.stringify(prefs.blocks));
    }
    window.dispatchEvent(new CustomEvent("paperis:journal-blocks-changed"));

    if (Object.keys(prefs.additions).length === 0) {
      localStorage.removeItem(STORAGE_KEYS.additions);
    } else {
      localStorage.setItem(
        STORAGE_KEYS.additions,
        JSON.stringify(prefs.additions)
      );
    }
    window.dispatchEvent(
      new CustomEvent("paperis:journal-additions-changed")
    );

    if (Object.keys(prefs.favorites).length === 0) {
      localStorage.removeItem(STORAGE_KEYS.favorites);
    } else {
      localStorage.setItem(
        STORAGE_KEYS.favorites,
        JSON.stringify(prefs.favorites)
      );
    }
    window.dispatchEvent(
      new CustomEvent("paperis:journal-favorites-changed")
    );
  } catch {
    // private mode 등 — 그대로 무시
  }
}

export default function AccountSyncProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status } = useSession();
  // 한 세션 동안 1회 머지 보장 — 로그아웃 시 reset
  const initialMergedRef = useRef(false);
  // 변경 broadcast가 머지 직후 setMySpecialties 등으로 발생하는 게 자기 자신을
  // 트리거하지 않도록 짧은 시간 lock
  const suppressEchoRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1) 인증 상태 변경에 따른 머지
  useEffect(() => {
    if (status !== "authenticated") {
      initialMergedRef.current = false;
      return;
    }
    if (initialMergedRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        const local = collectLocal();
        const res = await fetch("/api/account/prefs", { cache: "no-store" });
        if (!res.ok) {
          console.warn(
            "[account-sync] GET prefs failed",
            res.status,
            await res.text().catch(() => "")
          );
          return;
        }
        const db = (await res.json()) as AccountPrefs;
        if (cancelled) return;

        const localEmpty = isLocalEmpty(local);
        const dbEmpty = isDbEmpty(db);

        let target: AccountPrefs;
        if (dbEmpty && !localEmpty) {
          // 처음 로그인 — local을 DB로 push
          target = local;
        } else if (!dbEmpty && localEmpty) {
          // 다른 디바이스에서 쌓인 데이터 → local로 가져옴
          target = db;
        } else if (dbEmpty && localEmpty) {
          target = local; // 둘 다 비어있음 — 아무 일도 안 함
        } else {
          // 양쪽 다 있음 — 합집합 머지
          target = mergePrefs(local, db);
        }

        // local 적용 (subscribe 트리거 → debounce PUT 시작 가능. 자기 자신 echo
        // 방지로 잠깐 lock)
        suppressEchoRef.current = true;
        applyToLocal(target);
        // applyToLocal이 동기 dispatchEvent. 다음 tick에 lock 해제.
        setTimeout(() => {
          suppressEchoRef.current = false;
        }, 0);

        // DB도 target으로 reset (idempotent PUT)
        await fetch("/api/account/prefs", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(target),
        });

        initialMergedRef.current = true;
      } catch (err) {
        console.warn("[account-sync] initial merge error", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  // 2) localStorage 변경 → debounced PUT
  useEffect(() => {
    if (status !== "authenticated") return;

    function schedulePut() {
      if (suppressEchoRef.current) return; // 자기 자신 echo 무시
      if (!initialMergedRef.current) return; // 머지 끝난 뒤에만
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void putPrefs();
      }, 500);
    }

    async function putPrefs() {
      try {
        const local = collectLocal();
        await fetch("/api/account/prefs", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(local),
        });
      } catch (err) {
        console.warn("[account-sync] PUT failed", err);
      }
    }

    const unsubs = [
      subscribeMySpecialties(schedulePut),
      subscribeJournalBlocks(schedulePut),
      subscribeJournalAdditions(schedulePut),
      subscribeJournalFavorites(schedulePut),
    ];

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      for (const u of unsubs) u();
    };
  }, [status]);

  return <>{children}</>;
}
