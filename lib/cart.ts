// 장바구니: 사용자가 모은 논문을 한 번에 요약+오디오 합성하기 위한 영속 저장소.
// localStorage + custom 이벤트로 같은 탭의 여러 컴포넌트가 변경을 인지하도록.

import type { Paper } from "@/types";

const STORAGE_KEY = "paperis.cart.v1";
const EVENT_NAME = "paperis-cart-change";
const MAX_ITEMS = 10; // 한 번에 합성하기 무리 없는 상한

export interface CartItem {
  pmid: string;
  paper: Paper;
  addedAt: number;
}

function safeRead(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (it): it is CartItem =>
        !!it &&
        typeof it === "object" &&
        typeof (it as CartItem).pmid === "string" &&
        typeof (it as CartItem).addedAt === "number" &&
        typeof (it as CartItem).paper === "object"
    );
  } catch {
    return [];
  }
}

function safeWrite(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // quota / private mode 등 무시
  }
}

export function getCart(): CartItem[] {
  return safeRead();
}

export function isInCart(pmid: string): boolean {
  return safeRead().some((it) => it.pmid === pmid);
}

export function addToCart(paper: Paper): { ok: boolean; reason?: string } {
  const items = safeRead();
  if (items.some((it) => it.pmid === paper.pmid)) {
    return { ok: false, reason: "already" };
  }
  if (items.length >= MAX_ITEMS) {
    return { ok: false, reason: "full" };
  }
  items.push({ pmid: paper.pmid, paper, addedAt: Date.now() });
  safeWrite(items);
  return { ok: true };
}

export function removeFromCart(pmid: string): void {
  const next = safeRead().filter((it) => it.pmid !== pmid);
  safeWrite(next);
}

export function clearCart(): void {
  safeWrite([]);
}

// 외부(서버 동기화 등)에서 카트 전체를 일괄 교체할 때 사용.
export function setCart(items: CartItem[]): void {
  // 안전성: 잘못된 항목 제거
  const valid = items.filter(
    (it) =>
      it &&
      typeof it.pmid === "string" &&
      typeof it.addedAt === "number" &&
      it.paper &&
      typeof it.paper === "object"
  );
  safeWrite(valid.slice(0, MAX_ITEMS));
}

export function getCartCount(): number {
  return safeRead().length;
}

// 같은 탭에서 cart 변경 시 호출되는 콜백 등록
export function subscribeCart(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(EVENT_NAME, handler);
  // 다른 탭에서의 변경(localStorage event)도 반영
  window.addEventListener("storage", (e) => {
    if (e.key === STORAGE_KEY) handler();
  });
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}

export const CART_LIMIT = MAX_ITEMS;
