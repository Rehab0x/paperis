"use client";

import { useEffect } from "react";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import {
  useTtsProviderPreference,
  type TtsProviderName,
} from "@/components/TtsProviderPreferenceProvider";

interface Props {
  open: boolean;
  onClose: () => void;
}

const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "라이트", hint: "항상 밝은 화면" },
  { value: "dark", label: "다크", hint: "항상 어두운 화면" },
  { value: "system", label: "시스템", hint: "OS 설정을 따름" },
];

const TTS_OPTIONS: {
  value: TtsProviderName;
  label: string;
  hint: string;
}[] = [
  {
    value: "gemini",
    label: "Gemini TTS",
    hint: "GEMINI_API_KEY로 동작 — preview 단계, 가끔 실패할 수 있음",
  },
  {
    value: "clova",
    label: "Naver Clova Voice (Premium)",
    hint: "NCP_CLOVA_CLIENT_ID/SECRET 필요 — 한국어 자연스러움 우수, 안정적",
  },
];

// 우측 슬라이드 설정 드로어. 라이브러리와 동일한 패턴.
// PlayerBar 위에서 끝나도록 --player-bar-h CSS 변수 사용.
export default function SettingsDrawer({ open, onClose }: Props) {
  const { theme, setTheme } = useTheme();
  const { provider, setProvider } = useTtsProviderPreference();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        className={[
          "fixed inset-0 z-30 bg-black/30 transition-opacity duration-200 dark:bg-black/60",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      <aside
        role="dialog"
        aria-label="앱 설정"
        aria-hidden={!open}
        style={{ bottom: "var(--player-bar-h, 0px)" }}
        className={[
          "fixed right-0 top-0 z-40 flex w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out dark:bg-zinc-950",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            ⚙ 설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="설정 닫기 (ESC)"
            title="ESC"
          >
            닫기 ✕
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-auto px-5 py-5 pb-8">
          <Section
            title="화면 테마"
            description="라이트/다크/시스템 중에서 선택"
          >
            <RadioGroup
              name="theme"
              value={theme}
              options={THEME_OPTIONS}
              onChange={(v) => setTheme(v as Theme)}
            />
          </Section>

          <Section
            title="TTS provider"
            description="음성 합성에 어떤 서비스를 쓸지 — 선택은 다음 변환부터 적용됨"
          >
            <RadioGroup
              name="tts"
              value={provider}
              options={TTS_OPTIONS}
              onChange={(v) => setProvider(v as TtsProviderName)}
            />
          </Section>

          <Section title="앞으로 추가될 항목">
            <ul className="space-y-1 text-xs text-zinc-500">
              <li>• API 키 직접 입력 (현재는 .env.local에서만)</li>
              <li>• TTS 화자/속도 선택</li>
              <li>• 알림 권한 토글</li>
              <li>• 라이브러리 백업·복원</li>
            </ul>
          </Section>
        </div>
      </aside>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h3>
      {description ? (
        <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
      ) : null}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

interface RadioOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

function RadioGroup<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: RadioOption<T>[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="space-y-1.5">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <label
            key={opt.value}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition",
              active
                ? "border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-900"
                : "border-zinc-200 hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {opt.label}
              </span>
              {opt.hint ? (
                <span className="block text-xs text-zinc-500">{opt.hint}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}
