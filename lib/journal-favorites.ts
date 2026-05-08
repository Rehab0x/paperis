// 사용자가 임상과별로 ⭐ 표시한 저널 — 추천/추가 영역 통합 정렬에서 항상 위.
// localStorage 기반 (M4에서 user_journal_favorites 테이블로 마이그레이션 예정).
//
// 차단(journal-blocks)과는 상호배타 — favorite을 켜면 차단 자동 해제, 차단을 켜면
// favorite 자동 해제. (호출자가 명시적으로 처리)

const STORAGE_KEY = "paperis.journal_favorites";
const EVENT_NAME = "paperis:journal-favorites-changed";

/** specialtyId → 즐겨찾기 저널의 openAlexId 배열 */
type Favorites = Record<string, string[]>;

function readStored(): Favorites {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return {};
    const out: Favorites = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        const ids = v.filter(
          (s): s is string => typeof s === "string" && Boolean(s)
        );
        if (ids.length > 0) out[k] = ids;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(next: Favorites): void {
  try {
    const clean: Favorites = {};
    for (const [k, v] of Object.entries(next)) {
      if (Array.isArray(v) && v.length > 0) clean[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // private mode 등
  }
}

function notify(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function getFavoriteJournals(specialtyId: string): Set<string> {
  const all = readStored();
  return new Set(all[specialtyId] ?? []);
}

export function getAllJournalFavorites(): Favorites {
  return readStored();
}

export function favoriteJournal(
  specialtyId: string,
  journalId: string
): void {
  if (!specialtyId || !journalId) return;
  const all = readStored();
  const list = all[specialtyId] ?? [];
  if (list.includes(journalId)) return;
  all[specialtyId] = [...list, journalId];
  persist(all);
  notify();
}

export function unfavoriteJournal(
  specialtyId: string,
  journalId: string
): void {
  if (!specialtyId || !journalId) return;
  const all = readStored();
  const list = all[specialtyId];
  if (!list) return;
  const next = list.filter((id) => id !== journalId);
  if (next.length === list.length) return;
  if (next.length === 0) {
    delete all[specialtyId];
  } else {
    all[specialtyId] = next;
  }
  persist(all);
  notify();
}

export function subscribeJournalFavorites(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
