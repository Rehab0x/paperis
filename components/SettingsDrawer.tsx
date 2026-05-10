"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  API_KEY_LABELS,
  useApiKeys,
  type ApiKeyName,
} from "@/components/ApiKeysProvider";
import JournalBlocksManager from "@/components/JournalBlocksManager";
import MySpecialtiesEditor from "@/components/MySpecialtiesEditor";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { useAutoMiniSummary } from "@/components/useAutoMiniSummary";
import { writeAutoMiniSummary } from "@/lib/auto-mini-summary";
import {
  PROVIDER_DEFAULT_VOICE,
  PROVIDER_VOICES,
  useTtsProviderPreference,
  type SpeakingRate,
  type TtsProviderName,
} from "@/components/TtsProviderPreferenceProvider";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import {
  exportLibrary,
  importLibrary,
  type LibraryExport,
} from "@/lib/audio-library";

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
    value: "clova",
    label: "Naver Clova Voice (Premium) — 기본",
    hint: "NCP_CLOVA_CLIENT_ID/SECRET 필요 — 한국어 자연스러움 우수, 빠르고 안정적",
  },
  {
    value: "google-cloud",
    label: "Google Cloud TTS (Neural2/WaveNet)",
    hint: "GOOGLE_CLOUD_TTS_API_KEY 필요 — 월 1M자 무료, 안정적",
  },
  {
    value: "gemini",
    label: "Gemini TTS (fallback)",
    hint: "GEMINI_API_KEY로 동작 — preview 단계, 긴 narration에서 timeout 가능. 다른 provider 키 없을 때 자동 사용됨",
  },
];

const SPEED_OPTIONS: { value: SpeakingRate; label: string }[] = [
  { value: -1, label: "느림" },
  { value: 0, label: "보통" },
  { value: 1, label: "빠름" },
];

export default function SettingsDrawer({ open, onClose }: Props) {
  const { theme, setTheme } = useTheme();
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
        aria-label="앱 설정"
        aria-hidden={!open}
        style={{ bottom: "var(--player-bar-h, 0px)" }}
        className={[
          "fixed right-0 top-0 z-40 flex w-full max-w-md flex-col border-l border-paperis-border bg-paperis-bg shadow-[0_0_60px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-paperis-border bg-paperis-bg/95 px-5 py-3 backdrop-blur-xl">
          <h2 className="font-serif text-lg font-medium tracking-tight text-paperis-text">
            ⚙ 설정
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
            aria-label="설정 닫기 (ESC)"
            title="ESC"
          >
            닫기 ✕
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-auto px-5 py-5 pb-12">
          <Section title="화면 테마" description="라이트/다크/시스템 중에서 선택">
            <RadioGroup
              name="theme"
              value={theme}
              options={THEME_OPTIONS}
              onChange={(v) => setTheme(v as Theme)}
            />
          </Section>

          <Section
            title="TTS provider"
            description="음성 합성에 어떤 서비스를 쓸지 — 다음 변환부터 적용"
          >
            <RadioGroup
              name="tts"
              value={provider}
              options={TTS_OPTIONS}
              onChange={(v) => setProvider(v as TtsProviderName)}
            />
          </Section>

          <Section
            title="TTS 화자 / 속도"
            description={`현재 provider(${provider})의 화자 + 재생 속도`}
          >
            <label className="mb-3 block">
              <span className="mb-1 block text-xs text-paperis-text-3">화자</span>
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
            <span className="mb-1 block text-xs text-paperis-text-3">속도</span>
            <RadioGroup
              name="speed"
              value={speakingRate}
              options={SPEED_OPTIONS}
              onChange={(v) => setSpeakingRate(v as SpeakingRate)}
            />
            {provider === "gemini" ? (
              <p className="mt-2 text-[11px] text-paperis-text-3">
                Gemini는 속도 옵션을 받지 않아 “보통”으로 합성됩니다.
              </p>
            ) : null}
            <VoicePreview
              provider={provider}
              voice={currentVoice}
              speakingRate={speakingRate}
            />
          </Section>

          <Section
            title="검색 자동 요약"
            description="결과 상위 3건의 미니 요약을 자동으로 가져올지 — 끄면 카드를 클릭한 항목만 요약"
          >
            <AutoMiniSummaryToggle />
          </Section>

          <Section
            title="알림"
            description="TTS 변환이 끝나면 브라우저 알림을 표시"
          >
            <NotificationPermission />
          </Section>

          <Section
            title="API 키"
            description="입력한 키는 브라우저(localStorage)에 저장되어 fetch 시 헤더로 전송 → 서버가 .env 키 대신 사용"
          >
            <ApiKeysSection />
          </Section>

          <Section
            title="내 임상과"
            description="저널 페이지에 노출할 임상과 — 추가·삭제·순서 변경"
          >
            <MySpecialtiesEditor />
          </Section>

          <Section
            title="차단된 저널"
            description="임상과 페이지에서 ✕로 숨긴 저널들 — 복구 가능"
          >
            <JournalBlocksManager />
          </Section>

          <Section
            title="라이브러리 백업 / 복원"
            description="모든 트랙(메타 + 오디오)을 한 JSON 파일로 묶어 저장·복원"
          >
            <LibraryBackup />
          </Section>
        </div>
      </aside>
    </>,
    document.body
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
      <h3 className="text-sm font-semibold text-paperis-text">
        {title}
      </h3>
      {description ? (
        <p className="mt-0.5 text-xs text-paperis-text-3">{description}</p>
      ) : null}
      <div className="mt-2.5">{children}</div>
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
        let msg = `미리듣기 실패 (${res.status})`;
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
      setError(err instanceof Error ? err.message : "미리듣기 실패");
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
        {busy ? "합성 중…" : "🔊 이 화자/속도로 미리듣기"}
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
  const enabled = useAutoMiniSummary();
  // SSR/hydrate 시점에 false default. 사용자 토글 즉시 localStorage + 모든 사용처에
  // CustomEvent로 broadcast.
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
          {enabled ? "켜짐 — 결과 도착 시 상위 3건 자동 요약" : "꺼짐 — 카드 클릭 시만 요약"}
        </span>
        <span className="block text-xs text-paperis-text-3">
          출퇴근 청취 전 빠르게 스캔하는 패턴이면 켜세요. 검색을 자주 다시 하거나
          페이지를 자주 넘기면 끄는 편이 Gemini 응답 시간을 아껴줍니다.
          {enabled
            ? " 현재 default를 사용자가 직접 켠 상태."
            : " 기본값(꺼짐)을 그대로 사용 중."}
        </span>
      </span>
    </label>
  );
}

function NotificationPermission() {
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
      <p className="text-xs text-paperis-text-3">
        이 브라우저는 알림 API를 지원하지 않습니다.
      </p>
    );
  }
  if (status === "granted") {
    return (
      <p className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-xs text-paperis-accent">
        ✓ 알림 허용됨 — TTS 변환 끝나면 브라우저 알림이 표시됩니다.
      </p>
    );
  }
  if (status === "denied") {
    return (
      <p className="text-xs text-paperis-text-3">
        알림이 차단되어 있습니다. 브라우저 주소창의 자물쇠 아이콘에서 권한을
        다시 열어주세요.
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={request}
      className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
    >
      알림 권한 요청
    </button>
  );
}

function ApiKeysSection() {
  const { keys, setKey, clearKey } = useApiKeys();
  const [reveal, setReveal] = useState<Record<ApiKeyName, boolean>>({
    gemini: false,
    googleCloud: false,
    clovaId: false,
    clovaSecret: false,
    pubmed: false,
    unpaywall: false,
  });

  const fields: ApiKeyName[] = [
    "gemini",
    "googleCloud",
    "clovaId",
    "clovaSecret",
    "pubmed",
    "unpaywall",
  ];

  return (
    <div className="space-y-2.5">
      <p className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-[11px] text-paperis-accent">
        ⚠ 키는 브라우저 localStorage에 저장됩니다. XSS 위험을 인지하시고 본인
        브라우저에서만 사용하세요.
      </p>
      {fields.map((name) => {
        const v = keys[name] ?? "";
        const visible = reveal[name];
        return (
          <label key={name} className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wide text-paperis-text-3">
              {API_KEY_LABELS[name]}
            </span>
            <div className="flex gap-1">
              <input
                type={visible ? "text" : "password"}
                value={v}
                onChange={(e) => setKey(name, e.target.value)}
                placeholder="(미설정 시 .env.local 키 사용)"
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
                aria-label={visible ? "숨기기" : "보이기"}
                title={visible ? "숨기기" : "보이기"}
              >
                {visible ? "🙈" : "👁"}
              </button>
              {v ? (
                <button
                  type="button"
                  onClick={() => clearKey(name)}
                  className="rounded-lg border border-paperis-border px-2 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
                  aria-label="삭제"
                  title="삭제"
                >
                  🗑
                </button>
              ) : null}
            </div>
          </label>
        );
      })}
    </div>
  );
}

function LibraryBackup() {
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
        setMessage("내보낼 트랙이 없습니다.");
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
      setMessage(`✓ ${data.tracks.length}개 트랙을 내보냈습니다.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "내보내기 실패");
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
        `✓ ${result.added}개 추가됨${
          result.skipped > 0 ? `, ${result.skipped}개 건너뜀` : ""
        }`
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "복원 실패");
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
          {busy === "exporting" ? "내보내는 중…" : "📤 백업 내보내기"}
        </button>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy !== "idle"}
          className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "importing" ? "복원 중…" : "📥 백업 복원"}
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
        오디오 데이터까지 포함하므로 트랙 수에 따라 파일이 클 수 있습니다 (트랙
        하나당 보통 1–5MB).
      </p>
    </div>
  );
}
