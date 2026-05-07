"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type TtsProviderName = "gemini" | "clova" | "google-cloud";

/** 사용자 단위 속도 — 각 provider가 자기 단위로 매핑한다 */
export type SpeakingRate = -1 | 0 | 1;

const STORAGE_KEY_PROVIDER = "paperis.tts_provider";
const STORAGE_KEY_VOICE = "paperis.tts_voice_by_provider";
const STORAGE_KEY_RATE = "paperis.tts_speaking_rate";

// v3 default = Clova (한국어 자연스러움 + 빠름 + Vercel timeout 회피).
// 기존 사용자 localStorage 값은 보존 — 신규 사용자만 영향. 서버는 키 부재 시 Gemini fallback.
const DEFAULT_PROVIDER: TtsProviderName = "clova";
const DEFAULT_RATE: SpeakingRate = 0;

/** provider별 default voice — 사용자가 명시 안 했을 때 폴백 */
export const PROVIDER_DEFAULT_VOICE: Record<TtsProviderName, string> = {
  gemini: "Kore",
  clova: "nara",
  "google-cloud": "ko-KR-Neural2-A",
};

/** UI에 노출할 provider별 voice 목록 */
export const PROVIDER_VOICES: Record<TtsProviderName, string[]> = {
  gemini: ["Kore", "Puck", "Charon", "Aoede", "Fenrir", "Leda", "Orus", "Zephyr"],
  clova: [
    "nara",
    "nminyoung",
    "nyoungil",
    "vdain",
    "ngoeun",
    "clara",
    "matt",
    "danna",
  ],
  "google-cloud": [
    "ko-KR-Neural2-A",
    "ko-KR-Neural2-B",
    "ko-KR-Neural2-C",
    "ko-KR-Wavenet-A",
    "ko-KR-Wavenet-B",
    "ko-KR-Wavenet-C",
    "ko-KR-Wavenet-D",
    "en-US-Neural2-F",
    "en-US-Neural2-J",
    "en-US-Wavenet-F",
  ],
};

interface PreferenceContextValue {
  provider: TtsProviderName;
  setProvider: (p: TtsProviderName) => void;
  voiceByProvider: Partial<Record<TtsProviderName, string>>;
  setVoice: (provider: TtsProviderName, voice: string) => void;
  /** 현재 선택된 provider의 voice (없으면 default) */
  effectiveVoice: string;
  speakingRate: SpeakingRate;
  setSpeakingRate: (r: SpeakingRate) => void;
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
  return v === "gemini" || v === "clova" || v === "google-cloud";
}

function isRate(n: number): n is SpeakingRate {
  return n === -1 || n === 0 || n === 1;
}

export default function TtsProviderPreferenceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // SSR/hydration 안정성 위해 useState init은 default. useEffect에서 localStorage 적용.
  const [provider, setProviderState] = useState<TtsProviderName>(DEFAULT_PROVIDER);
  const [voiceByProvider, setVoiceByProvider] = useState<
    Partial<Record<TtsProviderName, string>>
  >({});
  const [speakingRate, setSpeakingRateState] =
    useState<SpeakingRate>(DEFAULT_RATE);

  useEffect(() => {
    try {
      const p = localStorage.getItem(STORAGE_KEY_PROVIDER);
      if (isProvider(p)) setProviderState(p);
    } catch {
      // ignore
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VOICE);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "object" && parsed) {
          const out: Partial<Record<TtsProviderName, string>> = {};
          for (const k of ["gemini", "clova", "google-cloud"] as TtsProviderName[]) {
            const v = (parsed as Record<string, unknown>)[k];
            if (typeof v === "string" && v) out[k] = v;
          }
          setVoiceByProvider(out);
        }
      }
    } catch {
      // ignore
    }
    try {
      const r = localStorage.getItem(STORAGE_KEY_RATE);
      const n = r != null ? Number(r) : DEFAULT_RATE;
      if (isRate(n)) setSpeakingRateState(n);
    } catch {
      // ignore
    }
  }, []);

  const setProvider = useCallback((p: TtsProviderName) => {
    setProviderState(p);
    try {
      localStorage.setItem(STORAGE_KEY_PROVIDER, p);
    } catch {
      // ignore
    }
  }, []);

  const setVoice = useCallback(
    (p: TtsProviderName, voice: string) => {
      setVoiceByProvider((prev) => {
        const next = { ...prev, [p]: voice };
        try {
          localStorage.setItem(STORAGE_KEY_VOICE, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    []
  );

  const setSpeakingRate = useCallback((r: SpeakingRate) => {
    setSpeakingRateState(r);
    try {
      localStorage.setItem(STORAGE_KEY_RATE, String(r));
    } catch {
      // ignore
    }
  }, []);

  const effectiveVoice =
    voiceByProvider[provider] ?? PROVIDER_DEFAULT_VOICE[provider];

  return (
    <Ctx.Provider
      value={{
        provider,
        setProvider,
        voiceByProvider,
        setVoice,
        effectiveVoice,
        speakingRate,
        setSpeakingRate,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
