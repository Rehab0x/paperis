// 사용자가 본 저널의 메타(JournalSummary)를 localStorage에 dump.
// favorites가 openAlexId만 저장하기 때문에 홈 화면 등에서 메타 복원이 필요하다.
//
// 채워지는 시점: SpecialtyJournalsList 등 저널을 표시하는 컴포넌트가 렌더 시
// 무조건 cacheJournalMetas(seen)를 호출 → 한 번 본 저널은 영구 캐시.
//
// 캐시 크기 제한: 200개 (LRU 비슷하게 lastSeenAt 갱신 + cap 도달 시 오래된 것 제거).
// 200개면 localStorage 용량(보통 5~10MB)에 비해 한참 여유.

import type { JournalSummary } from "@/lib/openalex";

const STORAGE_KEY = "paperis.journal_meta_cache";
const CAP = 200;

interface CachedEntry {
  meta: JournalSummary;
  lastSeenAt: number;
}

type CacheMap = Record<string, CachedEntry>;

function readStored(): CacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: CacheMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as CachedEntry).lastSeenAt === "number" &&
        (v as CachedEntry).meta &&
        typeof (v as CachedEntry).meta.openAlexId === "string"
      ) {
        out[k] = v as CachedEntry;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(next: CacheMap): void {
  try {
    // CAP 초과 시 lastSeenAt 오래된 순으로 제거
    const entries = Object.entries(next);
    if (entries.length > CAP) {
      entries.sort((a, b) => b[1].lastSeenAt - a[1].lastSeenAt);
      const trimmed: CacheMap = {};
      for (const [k, v] of entries.slice(0, CAP)) trimmed[k] = v;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode 등
  }
}

/** 한 번에 여러 저널 메타를 cache에 dump. lastSeenAt = now. */
export function cacheJournalMetas(journals: JournalSummary[]): void {
  if (!journals || journals.length === 0) return;
  const all = readStored();
  const now = Date.now();
  let changed = false;
  for (const j of journals) {
    if (!j.openAlexId) continue;
    all[j.openAlexId] = { meta: j, lastSeenAt: now };
    changed = true;
  }
  if (changed) persist(all);
}

/** 단일 lookup. 없으면 null. */
export function getJournalMeta(openAlexId: string): JournalSummary | null {
  const all = readStored();
  return all[openAlexId]?.meta ?? null;
}

/** 여러 ID 한 번에 lookup. 캐시 hit인 것만 반환. */
export function getJournalMetas(
  openAlexIds: string[]
): JournalSummary[] {
  if (openAlexIds.length === 0) return [];
  const all = readStored();
  const out: JournalSummary[] = [];
  for (const id of openAlexIds) {
    const e = all[id];
    if (e) out.push(e.meta);
  }
  return out;
}
