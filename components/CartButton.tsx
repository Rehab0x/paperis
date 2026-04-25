"use client";

import { useEffect, useState } from "react";
import {
  addToCart,
  CART_LIMIT,
  isInCart,
  removeFromCart,
  subscribeCart,
} from "@/lib/cart";
import type { Paper } from "@/types";

interface Props {
  paper: Paper;
  /** compact 모드: 작은 칩 형태 */
  size?: "sm" | "md";
}

export default function CartButton({ paper, size = "sm" }: Props) {
  const [inCart, setInCart] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    // localStorage(외부 시스템)와 동기화 — 마운트 시 1회 + 변경 이벤트 구독
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInCart(isInCart(paper.pmid));
    return subscribeCart(() => setInCart(isInCart(paper.pmid)));
  }, [paper.pmid]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    setError("");
    if (inCart) {
      removeFromCart(paper.pmid);
      return;
    }
    const result = addToCart(paper);
    if (!result.ok) {
      if (result.reason === "full") {
        setError(`재생목록은 최대 ${CART_LIMIT}편까지`);
      }
    }
  }

  const base =
    size === "md"
      ? "h-8 px-3 text-xs"
      : "h-7 px-2.5 text-[11px]";

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={inCart}
        title={inCart ? "재생목록에서 빼기" : "재생목록에 담기"}
        className={
          base +
          " inline-flex items-center gap-1 rounded-full font-medium transition " +
          (inCart
            ? "border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
            : "border border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500")
        }
      >
        {inCart ? "✓ 담김" : "+ 담기"}
      </button>
      {error ? (
        <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span>
      ) : null}
    </span>
  );
}
