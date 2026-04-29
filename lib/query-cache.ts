// 자연어 → PubMed 검색식 캐시 (서버 모듈 LRU + TTL).
// Vercel 콜드 스타트마다 비워지지만 한 인스턴스 안에서는 같은 자연어 입력 재호출을 막아준다.
// 클라이언트 localStorage 캐시는 별도(`lib/client-cache.ts`).

interface CacheEntry {
  query: string;
  note: string;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_ENTRIES = 200;

const store = new Map<string, CacheEntry>();

function normalize(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getCachedQuery(
  nl: string
): { query: string; note: string } | null {
  const key = normalize(nl);
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  // LRU: hit하면 맨 뒤로 다시 삽입
  store.delete(key);
  store.set(key, entry);
  return { query: entry.query, note: entry.note };
}

export function setCachedQuery(
  nl: string,
  query: string,
  note: string
): void {
  const key = normalize(nl);
  if (store.has(key)) store.delete(key);
  store.set(key, { query, note, expiresAt: Date.now() + TTL_MS });
  // 용량 초과 시 가장 오래된 것 제거 (Map은 삽입 순서 보존)
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}
