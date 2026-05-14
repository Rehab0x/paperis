"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

// 사용자가 직접 입력하는 API 키 모음.
// localStorage 저장. 클라가 fetch 시 X-Paperis-Keys 헤더로 동봉 → 서버 라우트가
// 헤더 우선, 그 다음 process.env 순으로 사용한다.
//
// 보안 메모: localStorage는 같은 origin의 JS에서 읽힌다. XSS가 발생하면 키 노출
// 위험이 있으므로 사용자가 명시적으로 입력해야만 활용된다 (UI에 안내).

export type ApiKeyName =
  | "gemini"
  | "anthropic"
  | "openai"
  | "grok"
  | "googleCloud"
  | "clovaId"
  | "clovaSecret"
  | "pubmed"
  | "unpaywall";

export const API_KEY_LABELS: Record<ApiKeyName, string> = {
  gemini: "GEMINI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  grok: "XAI_API_KEY",
  googleCloud: "GOOGLE_CLOUD_TTS_API_KEY",
  clovaId: "NCP_CLOVA_CLIENT_ID",
  clovaSecret: "NCP_CLOVA_CLIENT_SECRET",
  pubmed: "PUBMED_API_KEY",
  unpaywall: "UNPAYWALL_EMAIL",
};

/** AI 모델 provider 키만 별도 그룹 — 설정 UI에서 묶어 표시 */
export const AI_PROVIDER_KEYS: ReadonlyArray<ApiKeyName> = [
  "gemini",
  "anthropic",
  "openai",
  "grok",
];

/** 외부 서비스/TTS 키 — AI provider와 분리 */
export const SERVICE_KEYS: ReadonlyArray<ApiKeyName> = [
  "googleCloud",
  "clovaId",
  "clovaSecret",
  "pubmed",
  "unpaywall",
];

/** 각 키 발급 페이지 URL — 설정 패널의 "Get key ↗" 인라인 링크에 사용.
 * unpaywall은 키 발급이 아니라 이메일 입력만이라 URL 없음. */
export const KEY_HELP_URLS: Partial<Record<ApiKeyName, string>> = {
  gemini: "https://aistudio.google.com/apikey",
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  grok: "https://console.x.ai/",
  googleCloud: "https://console.cloud.google.com/apis/credentials",
  clovaId: "https://www.ncloud.com/",
  clovaSecret: "https://www.ncloud.com/",
  pubmed: "https://www.ncbi.nlm.nih.gov/account/settings/",
};

export type ApiKeys = Partial<Record<ApiKeyName, string>>;

const STORAGE_KEY = "paperis.api_keys";

interface ApiKeysContextValue {
  keys: ApiKeys;
  setKey: (name: ApiKeyName, value: string) => void;
  clearKey: (name: ApiKeyName) => void;
  /** fetch 헤더에 동봉할 base64(JSON) — 비어 있으면 undefined 반환 */
  toHeaderValue: () => string | undefined;
}

const Ctx = createContext<ApiKeysContextValue | null>(null);

export function useApiKeys(): ApiKeysContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useApiKeys는 ApiKeysProvider 안에서만 호출되어야 합니다.");
  }
  return ctx;
}

function readStored(): ApiKeys {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return {};
    const out: ApiKeys = {};
    const allowed: ApiKeyName[] = [
      "gemini",
      "anthropic",
      "openai",
      "grok",
      "googleCloud",
      "clovaId",
      "clovaSecret",
      "pubmed",
      "unpaywall",
    ];
    for (const k of allowed) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function utf8ToBase64(s: string): string {
  if (typeof window === "undefined") return "";
  // btoa는 latin-1만 처리하므로 utf-8 multi-byte 안전 인코딩
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export default function ApiKeysProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [keys, setKeys] = useState<ApiKeys>({});

  useEffect(() => {
    setKeys(readStored());
  }, []);

  const persist = useCallback((next: ApiKeys) => {
    try {
      // 빈 값은 저장하지 않음
      const clean: ApiKeys = {};
      for (const [k, v] of Object.entries(next)) {
        if (typeof v === "string" && v) clean[k as ApiKeyName] = v;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // private mode 등 — 메모리만 유지
    }
  }, []);

  const setKey = useCallback(
    (name: ApiKeyName, value: string) => {
      setKeys((prev) => {
        const next = { ...prev };
        const trimmed = value.trim();
        if (trimmed) next[name] = trimmed;
        else delete next[name];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearKey = useCallback(
    (name: ApiKeyName) => {
      setKeys((prev) => {
        const next = { ...prev };
        delete next[name];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const toHeaderValue = useCallback((): string | undefined => {
    if (Object.keys(keys).length === 0) return undefined;
    return utf8ToBase64(JSON.stringify(keys));
  }, [keys]);

  return (
    <Ctx.Provider value={{ keys, setKey, clearKey, toHeaderValue }}>
      {children}
    </Ctx.Provider>
  );
}
