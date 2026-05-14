"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  API_KEY_LABELS,
  KEY_HELP_URLS,
  useApiKeys,
  type ApiKeyName,
} from "@/components/ApiKeysProvider";
import JournalBlocksManager from "@/components/JournalBlocksManager";
import MySpecialtiesEditor from "@/components/MySpecialtiesEditor";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { useAppMessages } from "@/components/useAppMessages";
import { useAutoMiniSummary } from "@/components/useAutoMiniSummary";
import { useLocale } from "@/components/useLocale";
import { useShowKoreanTitles } from "@/components/useShowKoreanTitles";
import { fmt } from "@/lib/i18n";
import { writeAutoMiniSummary } from "@/lib/auto-mini-summary";
import { writeShowKoreanTitles } from "@/lib/show-korean-titles";
import {
  PROVIDER_DEFAULT_VOICE,
  PROVIDER_VOICES,
  useTtsProviderPreference,
  type SpeakingRate,
  type TtsProviderName,
} from "@/components/TtsProviderPreferenceProvider";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import {
  AI_PROVIDER_DEFAULT,
  getAiPreference,
  setAiPreference,
  subscribeAiPreference,
} from "@/lib/ai-preference";
import type { AiProviderName } from "@/lib/ai/types";
import {
  exportLibrary,
  importLibrary,
  type LibraryExport,
} from "@/lib/audio-library";

interface Props {
  open: boolean;
  onClose: () => void;
}

// THEME/TTS/SPEED OPTIONS는 컴포넌트 내부에서 m 메시지를 받아 동적 생성.

export default function SettingsDrawer({ open, onClose }: Props) {
  const m = useAppMessages();
  const THEME_OPTIONS: { value: Theme; label: string; hint: string }[] = [
    { value: "light", label: m.settings.themeLight, hint: m.settings.themeLightHint },
    { value: "dark", label: m.settings.themeDark, hint: m.settings.themeDarkHint },
    { value: "system", label: m.settings.themeSystem, hint: m.settings.themeSystemHint },
  ];
  const TTS_OPTIONS: { value: TtsProviderName; label: string; hint: string }[] = [
    { value: "clova", label: m.settings.ttsClovaLabel, hint: m.settings.ttsClovaHint },
    { value: "google-cloud", label: m.settings.ttsGcLabel, hint: m.settings.ttsGcHint },
    { value: "gemini", label: m.settings.ttsGeminiLabel, hint: m.settings.ttsGeminiHint },
  ];
  const SPEED_OPTIONS: { value: SpeakingRate; label: string }[] = [
    { value: -1, label: m.settings.speedSlow },
    { value: 0, label: m.settings.speedNormal },
    { value: 1, label: m.settings.speedFast },
  ];
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const {
    provider,
    setProvider,
    voiceByProvider,
    setVoice,
    speakingRate,
    setSpeakingRate,
  } = useTtsProviderPreference();

  // SSR-safe portal target — 헤더의 backdrop-filter가 fixed 자식의 containing block이
  // 되어 드로어가 헤더 영역 안에 갇히는 CSS 사양 회피용. body에 직접 마운트한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

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

  const currentVoice =
    voiceByProvider[provider] ?? PROVIDER_DEFAULT_VOICE[provider];

  if (!mounted) return null;

  return createPortal(
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
        aria-label={m.settings.drawerAria}
        aria-hidden={!open}
        style={{ bottom: "var(--player-bar-h, 0px)" }}
        className={[
          "fixed right-0 top-0 z-40 flex w-full max-w-md flex-col border-l border-paperis-border bg-paperis-bg shadow-[0_0_60px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-paperis-border bg-paperis-bg/95 px-5 py-3 backdrop-blur-xl">
          <h2 className="font-serif text-xl font-medium tracking-tight text-paperis-text">
            Settings
            <span className="text-paperis-accent">.</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
            aria-label={m.settings.closeAria}
            title="ESC"
          >
            {m.settings.closeLabel}
          </button>
        </header>

        <div className="flex-1 space-y-2 overflow-auto px-5 py-5 pb-12">
          <Section title={m.settings.themeTitle} description={m.settings.themeDesc}>
            <RadioGroup
              name="theme"
              value={theme}
              options={THEME_OPTIONS}
              onChange={(v) => setTheme(v as Theme)}
            />
          </Section>

          <Section
            title={m.settings.ttsProviderTitle}
            description={m.settings.ttsProviderDesc}
          >
            <RadioGroup
              name="tts"
              value={provider}
              options={TTS_OPTIONS}
              onChange={(v) => setProvider(v as TtsProviderName)}
            />
          </Section>

          <Section
            title={m.settings.ttsVoiceTitle}
            description={fmt(m.settings.ttsVoiceDesc, { provider })}
          >
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-paperis-text-3">{m.settings.voiceLabel}</span>
              <select
                value={currentVoice}
                onChange={(e) => setVoice(provider, e.target.value)}
                className="w-full rounded-lg border border-paperis-border bg-paperis-surface px-2 py-1.5 text-sm text-paperis-text"
              >
                {PROVIDER_VOICES[provider].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <span className="mb-1 block text-xs text-paperis-text-3">{m.settings.speedLabel}</span>
            <RadioGroup
              name="speed"
              value={speakingRate}
              options={SPEED_OPTIONS}
              onChange={(v) => setSpeakingRate(v as SpeakingRate)}
            />
            {provider === "gemini" ? (
              <p className="mt-2 text-[11px] text-paperis-text-3">
                {m.settings.speedNoOpt}
              </p>
            ) : null}
            <VoicePreview
              provider={provider}
              voice={currentVoice}
              speakingRate={speakingRate}
            />
          </Section>

          <Section
            title={m.settings.autoMiniTitle}
            description={m.settings.autoMiniDesc}
          >
            <AutoMiniSummaryToggle />
          </Section>

          {locale === "ko" ? (
            <Section
              title={m.settings.titleKoTitle}
              description={m.settings.titleKoDesc}
            >
              <KoreanTitlesToggle />
            </Section>
          ) : null}

          <Section
            title={m.settings.notifyTitle}
            description={m.settings.notifyDesc}
          >
            <NotificationPermission />
          </Section>

          <Section
            title={m.settings.aiProviderTitle}
            description={m.settings.aiProviderDesc}
            badge={<ByokGateBadge />}
          >
            <AiProviderSection />
          </Section>

          <Section
            title={m.settings.apiKeysTitle}
            description={m.settings.apiKeysDesc}
            badge={<ByokGateBadge />}
          >
            <ApiKeysSection />
          </Section>

          <Section
            title={m.settings.specialtiesTitle}
            description={m.settings.specialtiesDesc}
          >
            <MySpecialtiesEditor />
          </Section>

          <Section
            title={m.settings.blocksTitle}
            description={m.settings.blocksDesc}
          >
            <JournalBlocksManager />
          </Section>

          <Section
            title={m.settings.backupTitle}
            description={m.settings.backupDesc}
          >
            <LibraryBackup />
          </Section>
        </div>
      </aside>
    </>,
    document.body
  );
}

/**
 * Section — 접고 펴는 아코디언. <details>는 브라우저 native지만 스타일링과 화살표
 * 일관성 위해 상태 직접 관리. 첫 진입은 모두 접힘 (정보 과부하 방지) + 사용자가
 * 원하는 섹션만 펼침.
 */
function Section({
  title,
  description,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-xl border border-paperis-border bg-paperis-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-paperis-text">
            {title}
            {badge}
          </span>
          {description ? (
            <span className="mt-0.5 block text-xs text-paperis-text-3">
              {description}
            </span>
          ) : null}
        </span>
        <span
          className={[
            "shrink-0 text-paperis-text-3 transition-transform",
            open ? "rotate-90" : "",
          ].join(" ")}
          aria-hidden
        >
          ›
        </span>
      </button>
      {open ? (
        <div className="border-t border-paperis-border px-4 pb-4 pt-3">
          {children}
        </div>
      ) : null}
    </section>
  );
}

interface RadioOption<T extends string | number> {
  value: T;
  label: string;
  hint?: string;
}

function RadioGroup<T extends string | number>({
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
            key={String(opt.value)}
            className={[
              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition",
              active
                ? "border-paperis-accent bg-paperis-accent-dim/40"
                : "border-paperis-border hover:border-paperis-text-3",
            ].join(" ")}
          >
            <input
              type="radio"
              name={name}
              value={String(opt.value)}
              checked={active}
              onChange={() => onChange(opt.value)}
              className="mt-1"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-paperis-text">
                {opt.label}
              </span>
              {opt.hint ? (
                <span className="block text-xs text-paperis-text-3">{opt.hint}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function isEnglishVoice(voice: string): boolean {
  if (/^en[-_]/i.test(voice)) return true;
  return ["clara", "matt", "danna"].includes(voice);
}

const PREVIEW_KO =
  "안녕하세요. 이것은 Paperis 음성 미리듣기 예문입니다. 발음과 속도를 확인해 보세요.";
const PREVIEW_EN =
  "Hello. This is a Paperis text-to-speech preview. Please check the pronunciation and pacing.";

function VoicePreview({
  provider,
  voice,
  speakingRate,
}: {
  provider: TtsProviderName;
  voice: string;
  speakingRate: SpeakingRate;
}) {
  const m = useAppMessages();
  const fetchWithKeys = useFetchWithKeys();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // unmount 시 blob URL 정리
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      audioRef.current?.pause();
    };
  }, []);

  async function handlePreview() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const isEn = isEnglishVoice(voice);
      const res = await fetchWithKeys("/api/tts/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: isEn ? PREVIEW_EN : PREVIEW_KO,
          language: isEn ? "en" : "ko",
          providerName: provider,
          voice,
          speakingRate,
        }),
      });
      if (!res.ok) {
        const rawText = await res.text().catch(() => "");
        let msg = fmt(m.settings.previewFailedStatus, { status: res.status });
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && typeof parsed.error === "string") msg = parsed.error;
        } catch {
          if (rawText) msg = `${msg}: ${rawText.slice(0, 160)}`;
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const a = audioRef.current;
      if (a) {
        a.src = url;
        try {
          await a.play();
        } catch {
          // 자동재생 차단 시 사용자에게 컨트롤로 재생 유도
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : m.settings.previewFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <button
        type="button"
        onClick={handlePreview}
        disabled={busy}
        className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? m.settings.previewBtnLoading : m.settings.previewBtn}
      </button>
      <audio ref={audioRef} controls className="w-full" />
      {error ? (
        <p className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-xs text-paperis-accent">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AutoMiniSummaryToggle() {
  const m = useAppMessages();
  const enabled = useAutoMiniSummary();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-paperis-border px-3 py-2 transition hover:border-paperis-text-3">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => writeAutoMiniSummary(e.target.checked)}
        className="mt-1"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-paperis-text">
          {enabled ? m.settings.autoMiniOn : m.settings.autoMiniOff}
        </span>
        <span className="block text-xs text-paperis-text-3">
          {m.settings.autoMiniHint1}
          {enabled ? m.settings.autoMiniHintOn : m.settings.autoMiniHintOff}
        </span>
      </span>
    </label>
  );
}

function KoreanTitlesToggle() {
  const m = useAppMessages();
  const enabled = useShowKoreanTitles();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-paperis-border px-3 py-2 transition hover:border-paperis-text-3">
      <input
        type="checkbox"
        checked={enabled}
        onChange={(e) => writeShowKoreanTitles(e.target.checked)}
        className="mt-1"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-paperis-text">
          {enabled ? m.settings.titleKoOn : m.settings.titleKoOff}
        </span>
        <span className="block text-xs text-paperis-text-3">
          {m.settings.titleKoHint}
        </span>
      </span>
    </label>
  );
}

function NotificationPermission() {
  const m = useAppMessages();
  const [status, setStatus] = useState<NotificationPermission | "unsupported">(
    "default"
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    setStatus(Notification.permission);
  }, []);

  async function request() {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setStatus(result);
    } catch {
      // 일부 브라우저는 sync 콜백
    }
  }

  if (status === "unsupported") {
    return (
      <p className="text-xs text-paperis-text-3">{m.settings.notifyUnsupported}</p>
    );
  }
  if (status === "granted") {
    return (
      <p className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-xs text-paperis-accent">
        {m.settings.notifyGranted}
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="text-xs text-paperis-text-3">{m.settings.notifyDenied}</p>
    );
  }
  return (
    <button
      type="button"
      onClick={request}
      className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
    >
      {m.settings.notifyRequest}
    </button>
  );
}

function ByokGateBadge() {
  const m = useAppMessages();
  const { isByok, loading } = useByokStatus();
  if (loading) return null;
  return isByok ? (
    <span className="rounded-full bg-paperis-accent-dim/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paperis-accent">
      {m.settings.keyStatusActive}
    </span>
  ) : (
    <span className="rounded-full bg-paperis-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paperis-text-3">
      {m.settings.keyStatusLocked}
    </span>
  );
}

interface ByokStatus {
  /** 본인 키 입력이 허용되는 등급 (BYOK 결제자 또는 admin) */
  isByok: boolean;
  /** Pro 결제자 (provider 선택 가능, 본인 키 입력 X) */
  isPro: boolean;
  /** 서버 env에 등록된 provider 키 보유 여부 */
  envProviders: {
    gemini: boolean;
    claude: boolean;
    openai: boolean;
    grok: boolean;
  };
  loading: boolean;
}

function useByokStatus(): ByokStatus {
  const [state, setState] = useState<ByokStatus>({
    isByok: false,
    isPro: false,
    envProviders: { gemini: true, claude: false, openai: false, grok: false },
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/subscription", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        const isByok =
          j && j.plan === "byok" &&
          (j.status === "active" || j.status === "cancelled");
        const isPro =
          j && j.plan === "pro" &&
          (j.status === "active" || j.status === "cancelled");
        setState({
          isByok: Boolean(isByok),
          isPro: Boolean(isPro),
          envProviders: j?.envProviders ?? {
            gemini: true,
            claude: false,
            openai: false,
            grok: false,
          },
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}

function ApiKeysSection() {
  const m = useAppMessages();
  const { keys, setKey, clearKey } = useApiKeys();
  const { isByok, loading } = useByokStatus();
  const [reveal, setReveal] = useState<Record<ApiKeyName, boolean>>({
    gemini: false,
    anthropic: false,
    openai: false,
    grok: false,
    googleCloud: false,
    clovaId: false,
    clovaSecret: false,
    pubmed: false,
    unpaywall: false,
  });

  const aiFields: ApiKeyName[] = ["gemini", "anthropic", "openai", "grok"];
  const serviceFields: ApiKeyName[] = [
    "googleCloud",
    "clovaId",
    "clovaSecret",
    "pubmed",
    "unpaywall",
  ];

  if (loading) {
    return (
      <div className="h-20 animate-pulse rounded-lg bg-paperis-surface-2" />
    );
  }

  if (!isByok) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-paperis-border bg-paperis-surface-2 px-2.5 py-2 text-xs text-paperis-text-2">
          {m.settings.byokGateTitle1}{" "}
          <strong>{m.settings.byokGateRole}</strong>
          {m.settings.byokGateTitle2}
        </p>
        <a
          href="/billing"
          className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-3 text-xs font-medium text-paperis-bg transition hover:opacity-90"
        >
          {m.settings.byokGateCta}
        </a>
        <p className="text-[11px] text-paperis-text-3">
          {m.settings.byokGateFree}
        </p>
      </div>
    );
  }

  const renderField = (name: ApiKeyName) => {
    const v = keys[name] ?? "";
    const visible = reveal[name];
    const helpUrl = KEY_HELP_URLS[name];
    return (
      <label key={name} className="block">
        <span className="mb-1 flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wide text-paperis-text-3">
            {API_KEY_LABELS[name]}
          </span>
          {helpUrl ? (
            <a
              href={helpUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-paperis-text-3 underline-offset-2 transition hover:text-paperis-accent hover:underline"
            >
              {m.settings.keyHelpLink}
            </a>
          ) : null}
        </span>
        <div className="flex gap-1">
          <input
            type={visible ? "text" : "password"}
            value={v}
            onChange={(e) => setKey(name, e.target.value)}
            placeholder={m.settings.keyPlaceholder}
            className="min-w-0 flex-1 rounded-lg border border-paperis-border bg-paperis-surface px-2 py-1 text-xs text-paperis-text"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() =>
              setReveal((prev) => ({ ...prev, [name]: !prev[name] }))
            }
            className="rounded-lg border border-paperis-border px-2 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
            aria-label={visible ? m.settings.keyHideAria : m.settings.keyShowAria}
            title={visible ? m.settings.keyHideAria : m.settings.keyShowAria}
          >
            {visible ? "🙈" : "👁"}
          </button>
          {v ? (
            <button
              type="button"
              onClick={() => clearKey(name)}
              className="rounded-lg border border-paperis-border px-2 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
              aria-label={m.settings.keyRemoveAria}
              title={m.settings.keyRemoveAria}
            >
              🗑
            </button>
          ) : null}
        </div>
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-[11px] text-paperis-accent">
        {m.settings.keyXssWarn}
      </p>
      <a
        href="/help/api-keys"
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-lg border border-paperis-border bg-paperis-surface-2 px-2.5 py-1.5 text-[11px] text-paperis-text-2 transition hover:border-paperis-accent hover:text-paperis-accent"
      >
        {m.settings.keyGuideLink}
      </a>
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          {m.settings.keyGroupAi}
        </h4>
        <p className="mb-2 text-[11px] text-paperis-text-3">
          {m.settings.keyGroupAiHint}
        </p>
        <div className="space-y-2.5">{aiFields.map(renderField)}</div>
      </div>
      <div>
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          {m.settings.keyGroupExt}
        </h4>
        <div className="space-y-2.5">{serviceFields.map(renderField)}</div>
      </div>
    </div>
  );
}

function AiProviderSection() {
  const m = useAppMessages();
  const { isByok, isPro, envProviders, loading } = useByokStatus();
  const { keys } = useApiKeys();
  const [provider, setProviderState] = useState<AiProviderName>(
    AI_PROVIDER_DEFAULT
  );
  useEffect(() => {
    setProviderState(getAiPreference());
    return subscribeAiPreference(() => {
      setProviderState(getAiPreference());
    });
  }, []);

  // provider별 라벨 + 필요한 키 매핑
  const PROVIDER_INFO: Record<
    AiProviderName,
    { label: string; keyName: ApiKeyName; note: string }
  > = {
    gemini: {
      label: "Gemini",
      keyName: "gemini",
      note: m.settings.aiGeminiNote,
    },
    claude: {
      label: "Claude",
      keyName: "anthropic",
      note: m.settings.aiClaudeNote,
    },
    openai: {
      label: "OpenAI",
      keyName: "openai",
      note: m.settings.aiOpenAiNote,
    },
    grok: {
      label: "Grok (xAI)",
      keyName: "grok",
      note: m.settings.aiGrokNote,
    },
  };

  if (loading) {
    return (
      <div className="h-12 animate-pulse rounded-lg bg-paperis-surface-2" />
    );
  }
  // Free 사용자 — provider 선택 불가
  if (!isByok && !isPro) {
    return (
      <p className="text-xs text-paperis-text-3">{m.settings.aiFreeLocked}</p>
    );
  }

  return (
    <div className="space-y-2">
      {(["gemini", "claude", "openai", "grok"] as const).map((p) => {
        const info = PROVIDER_INFO[p];
        const hasUserKey = Boolean(keys[info.keyName]);
        const hasEnvKey = envProviders[p];
        // 등급별 활성 조건:
        //   BYOK: 본인 키 입력 필수
        //   Pro: 서버 env 키 보유 필요 (본인 키는 못 씀)
        //   Admin (isByok=true이지만 isPro=false 가능, 또는 둘 다): 본인 키 OR env 키
        // useByokStatus는 admin을 isByok=true로 표시 → 본인 키 OR env 키 양쪽 허용으로 통일
        const enabled = isByok
          ? hasUserKey || hasEnvKey // BYOK or admin
          : hasEnvKey; // Pro
        const disabled = !enabled;
        const active = provider === p;

        // 상태 라벨: 우선순위 본인 키 > env 키 > 비활성
        const stateLabel = hasUserKey
          ? m.settings.aiOwnKey
          : hasEnvKey && isPro
            ? m.settings.aiServerKey
            : hasEnvKey && isByok
              ? m.settings.aiServerKey // admin인 경우
              : null;

        return (
          <button
            key={p}
            type="button"
            disabled={disabled}
            onClick={() => {
              setAiPreference(p);
              setProviderState(p);
            }}
            className={[
              "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition",
              active
                ? "border-paperis-accent bg-paperis-accent-dim/30"
                : "border-paperis-border hover:border-paperis-text-3",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-paperis-border">
              {active ? (
                <span className="block h-2 w-2 rounded-full bg-paperis-accent" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium text-paperis-text">
                {info.label}
                {stateLabel ? (
                  <span className="rounded-full bg-paperis-accent-dim/60 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-paperis-accent">
                    {stateLabel}
                  </span>
                ) : null}
              </span>
              <span className="block text-[11px] text-paperis-text-3">
                {info.note}
              </span>
            </span>
          </button>
        );
      })}
      <p className="mt-2 text-[11px] text-paperis-text-3">
        {isByok ? m.settings.aiByokHint : m.settings.aiProHint}{" "}
        {m.settings.aiTtsNote}
      </p>
    </div>
  );
}

function LibraryBackup() {
  const m = useAppMessages();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<"idle" | "exporting" | "importing">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleExport() {
    if (busy !== "idle") return;
    setBusy("exporting");
    setMessage(null);
    try {
      const data = await exportLibrary();
      if (data.tracks.length === 0) {
        setMessage(m.settings.backupEmpty);
        return;
      }
      const json = JSON.stringify(data);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      a.href = url;
      a.download = `paperis-library-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(fmt(m.settings.backupExported, { n: data.tracks.length }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : m.settings.backupExportFailed);
    } finally {
      setBusy("idle");
    }
  }

  async function handleImport(file: File) {
    setBusy("importing");
    setMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as LibraryExport;
      const result = await importLibrary(data);
      setMessage(
        fmt(m.settings.backupRestored, {
          added: result.added,
          skipped:
            result.skipped > 0
              ? fmt(m.settings.backupSkipped, { n: result.skipped })
              : "",
        })
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : m.settings.backupImportFailed);
    } finally {
      setBusy("idle");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleExport}
          disabled={busy !== "idle"}
          className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "exporting" ? m.settings.backupExportBtnLoading : m.settings.backupExportBtn}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== "idle"}
          className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "importing" ? m.settings.backupImportBtnLoading : m.settings.backupImportBtn}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
          }}
        />
      </div>
      {message ? (
        <p className="text-xs text-paperis-text-2">{message}</p>
      ) : null}
      <p className="text-[11px] text-paperis-text-3">
        {m.settings.backupSizeHint}
      </p>
    </div>
  );
}
