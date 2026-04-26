// 추천 가중치 저장소 — localStorage + custom event subscribe.
// cart.ts와 같은 패턴이라, AccountSyncProvider가 서버에서 받은 값을 setStoredWeights로 적용하면
// 페이지/RecommendWeights 컴포넌트가 자동으로 새 값으로 리렌더된다.

import {
  DEFAULT_RECOMMEND_WEIGHTS,
  type RecommendWeights,
} from "@/types";

const STORAGE_KEY = "paperis.recommend.weights.v1";
const EVENT_NAME = "paperis-weights-change";

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 50;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

export function weightsAreEqual(
  a: RecommendWeights,
  b: RecommendWeights
): boolean {
  return (
    a.recency === b.recency &&
    a.citations === b.citations &&
    a.journal === b.journal &&
    a.niche === b.niche
  );
}

export function getStoredWeights(): RecommendWeights {
  if (typeof window === "undefined") return DEFAULT_RECOMMEND_WEIGHTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RECOMMEND_WEIGHTS;
    const parsed = JSON.parse(raw) as Partial<RecommendWeights>;
    return {
      recency: clamp(parsed.recency ?? DEFAULT_RECOMMEND_WEIGHTS.recency),
      citations: clamp(parsed.citations ?? DEFAULT_RECOMMEND_WEIGHTS.citations),
      journal: clamp(parsed.journal ?? DEFAULT_RECOMMEND_WEIGHTS.journal),
      niche: clamp(parsed.niche ?? DEFAULT_RECOMMEND_WEIGHTS.niche),
    };
  } catch {
    return DEFAULT_RECOMMEND_WEIGHTS;
  }
}

export function setStoredWeights(value: RecommendWeights): void {
  if (typeof window === "undefined") return;
  const safe: RecommendWeights = {
    recency: clamp(value.recency),
    citations: clamp(value.citations),
    journal: clamp(value.journal),
    niche: clamp(value.niche),
  };
  // 같은 값이면 dispatch 생략 — 무한 루프 방지
  const current = getStoredWeights();
  if (weightsAreEqual(current, safe)) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safe));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // quota / private mode 무시
  }
}

export function subscribeWeights(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(EVENT_NAME, handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
