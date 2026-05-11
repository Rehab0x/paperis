"use client";

import { useCallback, useEffect, useState } from "react";
import { useApiKeys } from "@/components/ApiKeysProvider";
import {
  AI_PROVIDER_DEFAULT,
  getAiPreference,
  subscribeAiPreference,
} from "@/lib/ai-preference";
import { getAnonymousId } from "@/lib/anonymous-id";

// 각 fetch 호출 시 다음 헤더를 자동으로 동봉하는 wrapper hook:
//   - X-Paperis-Keys: 사용자 입력 API 키 (base64 JSON) — 서버가 process.env override
//   - X-Paperis-Anon-Id: localStorage UUID — 서버가 비로그인 사용자 식별 + 사용량 카운트
//   - X-Paperis-Ai-Provider: 사용자가 선택한 AI provider (gemini/claude/openai/grok)
export function useFetchWithKeys(): typeof fetch {
  const { toHeaderValue } = useApiKeys();
  // AI preference는 localStorage라 SSR/CSR 시점 분리 — useState로 hydrate
  const [aiProvider, setAiProvider] = useState(AI_PROVIDER_DEFAULT);
  useEffect(() => {
    setAiProvider(getAiPreference());
    return subscribeAiPreference(() => {
      setAiProvider(getAiPreference());
    });
  }, []);

  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      const k = toHeaderValue();
      if (k) headers.set("X-Paperis-Keys", k);
      const anonId = getAnonymousId();
      if (anonId) headers.set("X-Paperis-Anon-Id", anonId);
      // default(gemini)와 다를 때만 헤더 동봉 — 트래픽 절약 + 캐시 키 단순화
      if (aiProvider && aiProvider !== AI_PROVIDER_DEFAULT) {
        headers.set("X-Paperis-Ai-Provider", aiProvider);
      }
      return fetch(input, { ...init, headers });
    },
    [toHeaderValue, aiProvider]
  ) as typeof fetch;
}
