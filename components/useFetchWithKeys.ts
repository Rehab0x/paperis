"use client";

import { useCallback } from "react";
import { useApiKeys } from "@/components/ApiKeysProvider";
import { getAnonymousId } from "@/lib/anonymous-id";

// 각 fetch 호출 시 다음 두 헤더를 자동으로 동봉하는 wrapper hook:
//   - X-Paperis-Keys: 사용자 입력 API 키 (base64 JSON) — 서버가 process.env override
//   - X-Paperis-Anon-Id: localStorage UUID — 서버가 비로그인 사용자 식별 + 사용량 카운트
export function useFetchWithKeys(): typeof fetch {
  const { toHeaderValue } = useApiKeys();
  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const k = toHeaderValue();
      if (k) headers.set("X-Paperis-Keys", k);
      const anonId = getAnonymousId();
      if (anonId) headers.set("X-Paperis-Anon-Id", anonId);
      return fetch(input, { ...init, headers });
    },
    [toHeaderValue]
  ) as typeof fetch;
}
