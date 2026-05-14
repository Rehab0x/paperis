// "한국어 제목 표시" 설정 — ko locale 사용자가 영문 제목 아래에 한국어 번역을
// 보조 표시할지 결정. localStorage 기반. default OFF (번역 호출은 사용자가
// 명시적으로 켤 때만 발생 — quota 보호).
//
// en locale에서는 토글 자체를 노출하지 않음. 토글이 ON이라도 useLocale이 ko가
// 아니면 useKoreanTitles 훅이 효과 없음(서버 호출 안 함, 캐시도 안 읽음).

const STORAGE_KEY = "paperis.show_korean_titles";
const EVENT_NAME = "paperis:show-korean-titles-changed";

export function readShowKoreanTitles(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeShowKoreanTitles(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // private mode 등
  }
}

export function subscribeShowKoreanTitles(cb: () => void): () => void {
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
