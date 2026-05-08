// 사용자가 선택한 "내 임상과" 목록 — localStorage 기반.
// 비어 있으면(=한 번도 안 건드림) /journal 페이지는 catalog의 default를 보여준다.
// M4(Auth+Neon) 도입 후 user_specialty_prefs 테이블로 마이그레이션 (스키마 동일).

const STORAGE_KEY = "paperis.my_specialties";
const EVENT_NAME = "paperis:my-specialties-changed";

function readStored(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (s): s is string => typeof s === "string" && Boolean(s)
    );
  } catch {
    return null;
  }
}

function persist(ids: string[]): void {
  try {
    if (ids.length === 0) {
      // 빈 배열 = "default로 돌아가기" 의도. localStorage 키 자체 제거.
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    }
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

/**
 * 사용자가 저장한 선택. null = 한 번도 저장 안 함 (default를 사용해야 함).
 * 빈 배열이 저장된 경우는 없도록 persist에서 처리.
 */
export function getMySpecialties(): string[] | null {
  return readStored();
}

export function setMySpecialties(ids: string[]): void {
  persist(ids);
  notify();
}

export function addSpecialty(id: string): void {
  const cur = readStored() ?? [];
  if (cur.includes(id)) return;
  setMySpecialties([...cur, id]);
}

export function removeSpecialty(id: string): void {
  const cur = readStored() ?? [];
  const next = cur.filter((x) => x !== id);
  if (next.length === cur.length) return;
  setMySpecialties(next);
}

/** from → to 위치로 한 항목 이동 (위/아래 화살표 또는 drag) */
export function moveSpecialty(from: number, to: number): void {
  const cur = readStored() ?? [];
  if (from < 0 || from >= cur.length || to < 0 || to >= cur.length) return;
  if (from === to) return;
  const next = [...cur];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  setMySpecialties(next);
}

export function subscribeMySpecialties(cb: () => void): () => void {
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

/**
 * 사용자 선택 ↔ 카탈로그 mismatch 정리.
 * 카탈로그에서 사라진 specialty id가 사용자 선택에 남아 있으면 제거.
 */
export function reconcileWithCatalog(validIds: string[]): void {
  const cur = readStored();
  if (!cur || cur.length === 0) return;
  const valid = new Set(validIds);
  const next = cur.filter((id) => valid.has(id));
  if (next.length !== cur.length) {
    setMySpecialties(next);
  }
}
