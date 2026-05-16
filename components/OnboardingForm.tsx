"use client";

// 온보딩 폼 — 휴대폰 + 약관 + 임상과 선택. 한 화면에 다 표시.
// 임상과 선택은 선택 사항 (필수 X) — 사용자가 나중에 /journal에서 추가/변경 가능.
//
// 제출 성공 시:
//   - 임상과 1개 이상 선택 → /journal/specialty/{firstId} (선택한 임상과 저널들로)
//   - 선택 안 함 → /journal (임상과 전체 grid)

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAppMessages } from "@/components/useAppMessages";
import { useLocale } from "@/components/useLocale";
import { fmt } from "@/lib/i18n";

export interface SpecialtyOption {
  id: string;
  name: string;
  nameEn: string;
}

interface Props {
  specialties: SpecialtyOption[];
}

export default function OnboardingForm({ specialties }: Props) {
  const m = useAppMessages();
  const locale = useLocale();
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [thirdParty, setThirdParty] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미로그인 → 홈으로, 이미 완료 → 홈으로
  if (status === "loading" || !session?.user) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-sm text-paperis-text-3">{m.onboarding.loading}</p>
      </main>
    );
  }
  if (session.user.onboardingDone) {
    router.replace("/app");
    return null;
  }

  const allRequired = terms && privacy && thirdParty;
  const phoneFilled = phone.trim().length > 0;
  const canSubmit = allRequired && phoneFilled && !submitting;

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const specialtyIds = Array.from(picked);
      const res = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          termsAgreed: allRequired,
          marketingAgreed: marketing,
          specialties: specialtyIds,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = fmt(m.onboarding.saveFailedStatus, { status: res.status });
        try {
          const j = JSON.parse(text);
          if (j?.error) msg = j.error;
        } catch {
          if (text) msg = text.slice(0, 200);
        }
        setError(msg);
        return;
      }
      await update();
      // 임상과 선택 시 첫 임상과로, 아니면 /journal 그리드
      router.replace(
        specialtyIds[0]
          ? `/journal/specialty/${encodeURIComponent(specialtyIds[0])}`
          : "/journal"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : m.onboarding.saveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/app"
        className="inline-flex h-7 items-center gap-1 text-xs text-paperis-text-3 transition hover:text-paperis-text"
      >
        {m.common.back}
      </Link>
      <header className="mt-2 mb-7">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-paperis-text">
          {m.onboarding.title}
        </h1>
        <p className="mt-1.5 text-sm text-paperis-text-3">
          {session.user.name
            ? fmt(m.onboarding.welcomeWithName, { name: session.user.name })
            : ""}
          {m.onboarding.intro}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-7">
        <section>
          <h2 className="text-sm font-semibold text-paperis-text">
            {m.onboarding.phoneTitle}
          </h2>
          <p className="mt-0.5 text-xs text-paperis-text-3">
            {m.onboarding.phoneHint}
          </p>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
            className="mt-3 w-full rounded-lg border border-paperis-border bg-paperis-surface px-3 py-2 text-sm text-paperis-text"
          />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-paperis-text">
            {m.onboarding.termsTitle}
          </h2>
          <div className="mt-3 space-y-2">
            <Checkbox
              checked={terms}
              onChange={setTerms}
              required
              label={m.onboarding.termsLabel}
              hint={m.onboarding.termsHint}
            />
            <Checkbox
              checked={privacy}
              onChange={setPrivacy}
              required
              label={m.onboarding.privacyLabel}
              hint={m.onboarding.privacyHint}
            />
            <Checkbox
              checked={thirdParty}
              onChange={setThirdParty}
              required
              label={m.onboarding.thirdPartyLabel}
              hint={m.onboarding.thirdPartyHint}
            />
            <Checkbox
              checked={marketing}
              onChange={setMarketing}
              label={m.onboarding.marketingLabel}
              hint={m.onboarding.marketingHint}
            />
          </div>
        </section>

        {/* 임상과 선택 — 선택사항. 1개 이상 고르면 첫 임상과 페이지로 이동 */}
        <section>
          <h2 className="text-sm font-semibold text-paperis-text">
            {m.onboarding.specialtyTitle}
          </h2>
          <p className="mt-0.5 text-xs text-paperis-text-3">
            {m.onboarding.specialtyHint}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {specialties.map((s) => {
              const active = picked.has(s.id);
              const label = locale === "en" ? s.nameEn : s.name;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className={[
                    "rounded-full border px-3 py-1 text-xs transition",
                    active
                      ? "border-paperis-accent bg-paperis-accent-dim/40 text-paperis-accent"
                      : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3 hover:text-paperis-text",
                  ].join(" ")}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-sm text-paperis-accent">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.replace("/app")}
            className="rounded-lg px-3 py-2 text-sm text-paperis-text-3 transition hover:text-paperis-text"
          >
            {m.onboarding.later}
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-paperis-accent px-4 py-2 text-sm font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? m.onboarding.saving : m.onboarding.save}
          </button>
        </div>
      </form>
    </main>
  );
}

function Checkbox({
  checked,
  onChange,
  label,
  hint,
  required,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-paperis-border px-3 py-2 transition hover:border-paperis-text-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 accent-paperis-accent"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-paperis-text">
          {label}
          {required ? (
            <span className="ml-1 text-[10px] font-medium text-paperis-accent">*</span>
          ) : null}
        </span>
        {hint ? (
          <span className="block text-xs text-paperis-text-3">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
