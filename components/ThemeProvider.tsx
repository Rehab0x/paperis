"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "paperis.theme";

interface ThemeContextValue {
  theme: Theme;
  /** 실제로 적용된 light/dark — system일 때는 prefers-color-scheme 결과 */
  resolved: "light" | "dark";
  setTheme: (t: Theme) => void;
}

const Ctx = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useTheme은 ThemeProvider 안에서만 호출되어야 합니다.");
  }
  return ctx;
}

function isTheme(v: string | null): v is Theme {
  return v === "light" || v === "dark" || v === "system";
}

function readStored(): Theme {
  if (typeof window === "undefined") return "system";
  const raw = localStorage.getItem(STORAGE_KEY);
  return isTheme(raw) ? raw : "system";
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ThemeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [theme, setThemeState] = useState<Theme>(() => readStored());
  const [resolved, setResolved] = useState<"light" | "dark">(() => {
    const t = readStored();
    if (t === "system") return prefersDark() ? "dark" : "light";
    return t;
  });

  // theme이 변하거나 system일 때 prefers 변하면 html 클래스 동기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      const isDark =
        theme === "dark" || (theme === "system" && prefersDark());
      document.documentElement.classList.toggle("dark", isDark);
      setResolved(isDark ? "dark" : "light");
    };
    apply();
    if (theme === "system") {
      const m = window.matchMedia("(prefers-color-scheme: dark)");
      m.addEventListener("change", apply);
      return () => m.removeEventListener("change", apply);
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      // private mode 등에서 저장 실패 시 메모리만 유지
    }
  }, []);

  return <Ctx.Provider value={{ theme, resolved, setTheme }}>{children}</Ctx.Provider>;
}
