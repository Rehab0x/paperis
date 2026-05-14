"use client";

import { useEffect, useState } from "react";
import {
  readShowKoreanTitles,
  subscribeShowKoreanTitles,
} from "@/lib/show-korean-titles";

/**
 * "한국어 제목 표시" 설정 — ko locale 사용자만 의미 있음.
 * SSR 시점엔 false (default OFF) → hydrate 후 localStorage 적용.
 */
export function useShowKoreanTitles(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(readShowKoreanTitles());
    return subscribeShowKoreanTitles(() =>
      setEnabled(readShowKoreanTitles())
    );
  }, []);
  return enabled;
}
