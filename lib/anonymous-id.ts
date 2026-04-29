// 비로그인 환경의 안정 식별자.
// 서버 동기화는 v2에서 안 하지만, 향후 분석/공유 도입 시 같은 사용자 묶기 위해 미리 발급.

const KEY = "paperis.anon_id";

export function getAnonymousId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(KEY);
  if (!id) {
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `anon-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // private mode 등에서 저장 실패해도 메모리 ID는 유지
    }
  }
  return id;
}
