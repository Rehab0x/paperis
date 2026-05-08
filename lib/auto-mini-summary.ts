// 검색·저널 결과의 "상위 3건 자동 미니요약 batch" 기능 토글 — localStorage 기반.
//
// default OFF — 결과 도착 후 추가 5-15초의 layout shift + Gemini quota 낭비 (특히
// 사용자가 검색을 자주 refine하거나 페이지를 넘길 때) 비용 대비 가치가 낮다.
// 출퇴근 청취 시나리오에서 카드 스캔이 잦은 사용자가 설정에서 켜서 쓰는 형태.

const STORAGE_KEY = "paperis.auto_mini_summary";
const EVENT_NAME = "paperis:auto-mini-summary-changed";

export function readAutoMiniSummary(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAutoMiniSummary(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // private mode 등
  }
}

export function subscribeAutoMiniSummary(cb: () => void): () => void {
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
