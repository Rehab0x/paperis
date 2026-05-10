// Upstash Redis 캐시 wrapper — 트렌드/호 분석 결과 영속 캐시.
// `UPSTASH_REDIS_REST_URL/TOKEN` 부재 시 silent fallback (캐시 miss 처리) — 라우트
// 자체는 정상 동작. M5에서 외부 의존 부재 시 silent 강등 정책 그대로.
//
// 키 패턴:
//   issue:{issn}:{yyyy-mm}      호 탐색 응답 (papers + total)
//   trend:{issn}:{months}m:{yyyy-mm}   트렌드 응답 — 매달 키 갱신
//
// TTL:
//   과거 호: ∞ (없음, Redis LRU eviction에 맡김)
//   당월 호 / 트렌드: 24시간

import { Redis } from "@upstash/redis";

let _client: Redis | null = null;
// 한 번 초기화 실패하면 그 프로세스 동안 다시 시도 안 함 (콜드스타트마다 시도)
let _initFailed = false;

// dev 환경에서만 진단 로그 — prod logs 노이즈 방지
const IS_DEV = process.env.NODE_ENV === "development";

function getClient(): Redis | null {
  if (_initFailed) return null;
  if (_client) return _client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (IS_DEV) {
      console.warn("[journal-cache] env missing", {
        hasUrl: Boolean(url),
        hasToken: Boolean(token),
      });
    }
    return null;
  }
  try {
    _client = new Redis({ url, token });
    if (IS_DEV) console.log("[journal-cache] Redis client initialized");
    return _client;
  } catch (err) {
    console.warn("[journal-cache] Redis init failed", err);
    _initFailed = true;
    return null;
  }
}

export async function getCached<T>(key: string): Promise<T | null> {
  const client = getClient();
  if (!client) return null;
  try {
    const v = await client.get<T>(key);
    if (IS_DEV) {
      console.log(`[journal-cache] GET ${key}: ${v ? "HIT" : "miss"}`);
    }
    return v ?? null;
  } catch (err) {
    console.warn("[journal-cache] get failed", key, err);
    return null;
  }
}

export async function setCached<T>(
  key: string,
  value: T,
  options?: { ttlSeconds?: number }
): Promise<void> {
  const client = getClient();
  if (!client) return;
  try {
    if (options?.ttlSeconds && options.ttlSeconds > 0) {
      await client.set(key, value, { ex: options.ttlSeconds });
    } else {
      await client.set(key, value);
    }
    if (IS_DEV) {
      console.log(
        `[journal-cache] SET ${key}${options?.ttlSeconds ? ` (ttl ${options.ttlSeconds}s)` : ""}`
      );
    }
  } catch (err) {
    console.warn("[journal-cache] set failed", key, err);
  }
}

export function isCacheConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

// ─── 키 helpers ────────────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 호 탐색 캐시 키. issn은 NLM 표준 0028-3878 형태 그대로 사용 */
export function issueKey(issn: string, year: number, month: number): string {
  return `issue:${issn}:${year}-${pad2(month)}`;
}

/**
 * 트렌드 캐시 키. months 옵션 + 현재 yyyy-mm을 함께 — 매달 자연 갱신.
 * 이전 달 트렌드를 보고 싶으면 키가 다르므로 새로 계산됨.
 */
export function trendKey(issn: string, months: number): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return `trend:${issn}:${months}m:${y}-${pad2(m)}`;
}

/**
 * (year, month)가 "지난 달" 또는 그 이전이면 true → 결과 불변, ∞ TTL.
 * 당월(혹은 미래)이면 24h TTL — PubMed 인덱싱 지연 + 새 논문 추가 대비.
 */
export function isPastIssue(year: number, month: number): boolean {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (year < y) return true;
  if (year === y && month < m) return true;
  return false;
}

export const TTL_24H = 24 * 60 * 60;
