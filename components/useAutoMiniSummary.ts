"use client";

import { useEffect, useState } from "react";
import {
  readAutoMiniSummary,
  subscribeAutoMiniSummary,
} from "@/lib/auto-mini-summary";

/**
 * 현재 자동 미니요약 batch 활성 여부.
 * SSR 시점엔 항상 false 반환 (default OFF) → hydrate 후 localStorage 값 적용.
 */
export function useAutoMiniSummary(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(readAutoMiniSummary());
    return subscribeAutoMiniSummary(() => setEnabled(readAutoMiniSummary()));
  }, []);
  return enabled;
}
