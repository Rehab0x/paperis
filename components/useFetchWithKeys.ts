"use client";

import { useCallback } from "react";
import { useApiKeys } from "@/components/ApiKeysProvider";

// 각 fetch 호출 시 X-Paperis-Keys 헤더를 자동으로 동봉하는 wrapper hook.
// 서버 라우트가 그 헤더에서 키를 추출 → process.env에 반영.
export function useFetchWithKeys(): typeof fetch {
  const { toHeaderValue } = useApiKeys();
  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const k = toHeaderValue();
      if (k) headers.set("X-Paperis-Keys", k);
      return fetch(input, { ...init, headers });
    },
    [toHeaderValue]
  ) as typeof fetch;
}
