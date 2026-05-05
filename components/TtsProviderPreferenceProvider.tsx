"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type TtsProviderName = "gemini" | "clova";

const STORAGE_KEY = "paperis.tts_provider";
const DEFAULT_PROVIDER: TtsProviderName = "gemini";

interface PreferenceContextValue {
  provider: TtsProviderName;
  setProvider: (p: TtsProviderName) => void;
}

const Ctx = createContext<PreferenceContextValue | null>(null);

export function useTtsProviderPreference(): PreferenceContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useTtsProviderPreference는 TtsProviderPreferenceProvider 안에서만 호출되어야 합니다."
    );
  }
  return ctx;
}

function isProvider(v: string | null): v is TtsProviderName {
  return v === "gemini" || v === "clova";
}

export default function TtsProviderPreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [provider, setProviderState] = useState<TtsProviderName>(DEFAULT_PROVIDER);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (isProvider(raw)) setProviderState(raw);
    } catch {
      // private mode 등 — default 유지
    }
  }, []);

  const setProvider = useCallback((p: TtsProviderName) => {
    setProviderState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // ignore
    }
  }, []);

  return <Ctx.Provider value={{ provider, setProvider }}>{children}</Ctx.Provider>;
}
