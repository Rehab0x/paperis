// 클라이언트 localStorage 캐시 — pmid → 한국어 제목.
// "한국어 제목 표시" 기능에서 사용. 한 번 번역된 제목은 불변이라 영구 저장.
// quota는 MAX_ENTRIES로 제한 (가장 오래된 것 먼저 evict — FIFO 근사).

const KEY = "paperis.titles_ko.v1";
const MAX_ENTRIES = 5000;

interface Stored {
  // pmid → { ko, savedAt }
  [pmid: string]: { ko: string; savedAt: number };
}

function read(): Stored {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function write(map: Stored): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // quota — 조용히 무시. 다음에 reduce할 때 자연 회복.
  }
}

/** 여러 pmid를 한 번에 조회 — useKoreanTitles 훅이 batch fetch 전에 hit/miss 분류용 */
export function readManyKoreanTitles(pmids: string[]): Map<string, string> {
  const map = read();
  const out = new Map<string, string>();
  for (const pmid of pmids) {
    const entry = map[pmid];
    if (entry && entry.ko) out.set(pmid, entry.ko);
  }
  return out;
}

/** batch 결과를 캐시에 저장 — 한 번에 write (storage I/O 절약) */
export function writeManyKoreanTitles(entries: Map<string, string>): void {
  if (entries.size === 0) return;
  const map = read();
  const now = Date.now();
  for (const [pmid, ko] of entries) {
    map[pmid] = { ko, savedAt: now };
  }

  // MAX_ENTRIES 초과 시 savedAt 가장 오래된 것부터 제거
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort((a, b) => map[a].savedAt - map[b].savedAt);
    for (const k of sorted.slice(0, keys.length - MAX_ENTRIES)) {
      delete map[k];
    }
  }
  write(map);
}
