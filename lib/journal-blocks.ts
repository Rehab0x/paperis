// 사용자가 임상과별로 "이 저널은 안 보고 싶다"고 표시한 저널 목록 관리.
// localStorage 기반 — anonymous-id 흐름에서도 동작. M4(Auth+Neon) 도입 후엔
// user_journal_blocks 테이블로 마이그레이션 (스키마 동일 모양).

const STORAGE_KEY = "paperis.journal_blocks";
const EVENT_NAME = "paperis:journal-blocks-changed";

/** specialtyId → 차단된 저널의 openAlexId Set */
type Blocks = Record<string, string[]>;

function readStored(): Blocks {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return {};
    const out: Blocks = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        const ids = v.filter((s): s is string => typeof s === "string" && Boolean(s));
        if (ids.length > 0) out[k] = ids;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(next: Blocks): void {
  try {
    // 빈 specialty 키는 저장하지 않음 — 노이즈 회피
    const clean: Blocks = {};
    for (const [k, v] of Object.entries(next)) {
      if (Array.isArray(v) && v.length > 0) clean[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // private mode 등 — 메모리만 유지
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

/** 특정 임상과의 차단 목록 (set으로). server에서 호출 시 빈 set */
export function getBlockedJournals(specialtyId: string): Set<string> {
  const all = readStored();
  return new Set(all[specialtyId] ?? []);
}

/** 전체 차단 맵 (설정 페이지 등에서 표시용) */
export function getAllJournalBlocks(): Blocks {
  return readStored();
}

export function blockJournal(specialtyId: string, journalId: string): void {
  if (!specialtyId || !journalId) return;
  const all = readStored();
  const list = all[specialtyId] ?? [];
  if (list.includes(journalId)) return;
  all[specialtyId] = [...list, journalId];
  persist(all);
  notify();
}

export function unblockJournal(specialtyId: string, journalId: string): void {
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

/** 변경 알림 구독. unsubscribe 함수 반환 */
export function subscribeJournalBlocks(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  // 같은 origin 다른 탭/창에서 변경됐을 때도 반영
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
