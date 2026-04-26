"use client";

// 로그인 상태 변화에 따라 카트/가중치를 서버와 동기화한다.
//
// 흐름:
//   비로그인 → 로그인:
//     1) 서버에서 cart/weights GET
//     2) 로컬과 union 머지(cart) / 서버 우선 fallback(weights)
//     3) 머지 결과를 서버에 PUT (한 번)
//     4) localStorage에도 머지 결과 반영 → cart/weights store가 자동 dispatch → UI 리렌더
//   로그인 상태에서 변경:
//     subscribeCart / subscribeWeights 가 발화될 때마다 350ms debounce 후 PUT
//   로그아웃 시:
//     localStorage는 그대로 둬서 다음 비로그인 사용에도 이어짐(서버는 이미 최신)
//
// 비로그인 사용자에 대해선 아무 일도 하지 않음 — 기존 localStorage 동작 유지.

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  CART_LIMIT,
  getCart,
  setCart,
  subscribeCart,
  type CartItem,
} from "@/lib/cart";
import {
  DEFAULT_RECOMMEND_WEIGHTS,
  type RecommendWeights,
} from "@/types";
import {
  getStoredWeights,
  setStoredWeights,
  subscribeWeights,
} from "@/lib/weights-store";

const DEBOUNCE_MS = 350;

interface ServerCartItem {
  pmid: string;
  paper: CartItem["paper"];
  addedAt: number;
}

function mergeCart(server: ServerCartItem[], local: CartItem[]): CartItem[] {
  // pmid 기준 union. 같은 pmid면 더 최근 addedAt 유지 + 서버 paper 우선.
  const map = new Map<string, CartItem>();
  for (const it of server) {
    map.set(it.pmid, {
      pmid: it.pmid,
      paper: it.paper,
      addedAt: it.addedAt,
    });
  }
  for (const it of local) {
    const existing = map.get(it.pmid);
    if (!existing) {
      map.set(it.pmid, it);
    } else if (it.addedAt > existing.addedAt) {
      map.set(it.pmid, { ...existing, addedAt: it.addedAt });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => a.addedAt - b.addedAt)
    .slice(0, CART_LIMIT);
}

function weightsAreEqual(a: RecommendWeights, b: RecommendWeights): boolean {
  return (
    a.recency === b.recency &&
    a.citations === b.citations &&
    a.journal === b.journal &&
    a.niche === b.niche
  );
}

export default function AccountSyncProvider() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;

  const lastSyncedUserIdRef = useRef<string | null>(null);
  const cartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const weightsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 머지 단계에서 자기 자신이 트리거한 dispatch는 무시 (loop 방지)
  const ignoreNextChangeRef = useRef(false);

  // 1) 로그인 시점 머지
  useEffect(() => {
    if (status !== "authenticated" || !userId) {
      lastSyncedUserIdRef.current = null;
      return;
    }
    if (lastSyncedUserIdRef.current === userId) return; // 같은 세션 내 중복 방지

    let aborted = false;
    (async () => {
      try {
        const [cartRes, weightsRes] = await Promise.all([
          fetch("/api/account/cart"),
          fetch("/api/account/weights"),
        ]);
        if (aborted) return;
        if (!cartRes.ok || !weightsRes.ok) return;
        const cartJson = (await cartRes.json()) as {
          items: ServerCartItem[];
        };
        const weightsJson = (await weightsRes.json()) as {
          weights: RecommendWeights;
        };

        // ── 카트 머지
        const localCart = getCart();
        const merged = mergeCart(cartJson.items ?? [], localCart);
        const localOnlyExists = localCart.some(
          (l) => !cartJson.items.some((s) => s.pmid === l.pmid)
        );
        ignoreNextChangeRef.current = true;
        setCart(merged);
        if (localOnlyExists || merged.length !== cartJson.items.length) {
          // 서버에도 머지 결과 PUT
          fetch("/api/account/cart", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: merged }),
          }).catch(() => {});
        }

        // ── 가중치 머지: 서버에 의미 있는 값(기본값과 다름)이 있으면 서버 우선,
        //   없으면 로컬 값을 서버에 push.
        const serverW = weightsJson.weights ?? DEFAULT_RECOMMEND_WEIGHTS;
        const localW = getStoredWeights();
        const serverIsDefault = weightsAreEqual(
          serverW,
          DEFAULT_RECOMMEND_WEIGHTS
        );
        const localIsDefault = weightsAreEqual(
          localW,
          DEFAULT_RECOMMEND_WEIGHTS
        );

        if (!serverIsDefault) {
          // 서버 값을 로컬에 적용
          if (!weightsAreEqual(serverW, localW)) {
            ignoreNextChangeRef.current = true;
            setStoredWeights(serverW);
          }
        } else if (!localIsDefault) {
          // 서버는 기본값인데 로컬에 사용자가 만진 값이 있음 → 서버에 push
          fetch("/api/account/weights", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ weights: localW }),
          }).catch(() => {});
        }

        lastSyncedUserIdRef.current = userId;
      } catch (err) {
        console.warn("[account-sync] initial sync failed", err);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [status, userId]);

  // 2) 평상시 카트 변경 → 서버 PUT (debounced)
  useEffect(() => {
    if (status !== "authenticated") return;
    return subscribeCart(() => {
      if (ignoreNextChangeRef.current) {
        ignoreNextChangeRef.current = false;
        return;
      }
      if (cartDebounceRef.current) clearTimeout(cartDebounceRef.current);
      cartDebounceRef.current = setTimeout(() => {
        const items = getCart();
        fetch("/api/account/cart", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        }).catch(() => {});
      }, DEBOUNCE_MS);
    });
  }, [status]);

  // 3) 평상시 가중치 변경 → 서버 PUT (debounced)
  useEffect(() => {
    if (status !== "authenticated") return;
    return subscribeWeights(() => {
      if (ignoreNextChangeRef.current) {
        ignoreNextChangeRef.current = false;
        return;
      }
      if (weightsDebounceRef.current) clearTimeout(weightsDebounceRef.current);
      weightsDebounceRef.current = setTimeout(() => {
        const weights = getStoredWeights();
        fetch("/api/account/weights", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ weights }),
        }).catch(() => {});
      }, DEBOUNCE_MS);
    });
  }, [status]);

  return null;
}
