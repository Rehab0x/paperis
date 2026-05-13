"use client";

// 온보딩 — 휴대폰 + 약관 동의. 강제 redirect는 안 함 (사용자가 AuthMenu의
// "프로필 완성" 버튼이나 직접 URL로 진입). 결제 단계(M7) 직전에 강제 흐름 도입.
//
// 임상과 선택은 PR3(user_specialty_prefs 테이블 추가) 전까지 별도 단계로 두지
// 않는다 — 사용자는 /journal 페이지의 "내 임상과" 인프라(localStorage)를 그대로
// 쓰면 됨. 온보딩은 휴대폰 + 약관만 명확히.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";

export default function OnboardingPage() {
  const m = useAppMessages();
  const router = useRouter();
  const { data: session, status, update } = useSession();
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [thirdParty, setThirdParty] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 미로그인 → 로그인 안내. 이미 완료 → 홈으로.
  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user) {
      // 미로그인 — 로그인 페이지로 가긴 어색하니 홈으로 보내고 헤더에서 로그인 유도
      router.replace("/app");
      return;
    }
    if (session.user.onboardingDone) {
      router.replace("/app");
    }
  }, [session, status, router]);

  const allRequired = terms && privacy && thirdParty;
  const phoneFilled = phone.trim().length > 0;
  const canSubmit = allRequired && phoneFilled && !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/onboarding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          phone,
          termsAgreed: allRequired,
          marketingAgreed: marketing,
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
      // session 갱신 — onboardingDone=true 반영 (next-auth update())
      await update();
      router.replace("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : m.onboarding.saveFailed);
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || !session?.user) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-sm text-paperis-text-3">{m.onboarding.loading}</p>
      </main>
    );
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
