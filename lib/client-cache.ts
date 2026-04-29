// 클라이언트 localStorage 캐시 — 자연어 → 변환된 검색식 + 검색 응답 메타.
// 같은 자연어를 다시 검색할 때 /api/search 호출 자체를 생략하기 위함.
// 결과 papers는 캐시하지 않는다 (PubMed 결과는 매번 fresh를 원함).

const KEY = "paperis.qcache.v2";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 50;

interface CacheEntry {
  query: string;
  note: string;
  expiresAt: number;
}

type CacheMap = Record<string, CacheEntry>;

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function read(): CacheMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as CacheMap) : {};
  } catch {
    return {};
  }
}

function write(map: CacheMap): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // quota 초과 시 조용히 무시
  }
}

export function getClientCachedQuery(
  nl: string
): { query: string; note: string } | null {
  const key = normalize(nl);
  const map = read();
  const entry = map[key];
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    delete map[key];
    write(map);
    return null;
  }
  return { query: entry.query, note: entry.note };
}

export function setClientCachedQuery(
  nl: string,
  query: string,
  note: string
): void {
  const key = normalize(nl);
  const map = read();
  map[key] = { query, note, expiresAt: Date.now() + TTL_MS };

  // 용량 초과 시 expiresAt이 가장 작은 (가장 오래된) 것부터 제거
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    const sorted = keys.sort(
      (a, b) => map[a].expiresAt - map[b].expiresAt
    );
    for (const k of sorted.slice(0, keys.length - MAX_ENTRIES)) {
      delete map[k];
    }
  }
  write(map);
}
