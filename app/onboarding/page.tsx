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

export default function OnboardingPage() {
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
      router.replace("/");
      return;
    }
    if (session.user.onboardingDone) {
      router.replace("/");
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
        let msg = `저장 실패 (${res.status})`;
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
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading" || !session?.user) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10">
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 pb-32">
      <Link
        href="/"
        className="inline-flex h-7 items-center gap-1 text-xs text-zinc-500 transition hover:text-zinc-900 dark:hover:text-zinc-100"
      >
        ← 홈으로
      </Link>
      <header className="mt-2 mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          프로필 완성
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          {session.user.name ? `${session.user.name}님, 환영합니다. ` : ""}
          결제·구독을 위해 휴대폰 번호와 약관 동의가 필요합니다. 한 번만 입력하면
          됩니다.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-7">
        <section>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            휴대폰 번호
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Toss Payments 자동결제에 필수. 010-XXXX-XXXX 형식 또는 +82 표기 모두
            가능.
          </p>
          <input
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
            className="mt-3 w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            약관 동의
          </h2>
          <div className="mt-3 space-y-2">
            <Checkbox
              checked={terms}
              onChange={setTerms}
              required
              label="서비스 이용약관 동의"
              hint="필수"
            />
            <Checkbox
              checked={privacy}
              onChange={setPrivacy}
              required
              label="개인정보 수집·이용 동의"
              hint="필수 — 이메일/이름/휴대폰을 결제·서비스 운영 목적으로 처리"
            />
            <Checkbox
              checked={thirdParty}
              onChange={setThirdParty}
              required
              label="개인정보 제3자 제공 동의 (Toss Payments)"
              hint="필수 — 결제 처리 위해 결제사에 휴대폰/이름/이메일 제공"
            />
            <Checkbox
              checked={marketing}
              onChange={setMarketing}
              label="마케팅 수신 동의"
              hint="선택 — 새 기능·이벤트 안내 메일"
            />
          </div>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => router.replace("/")}
            className="rounded-md px-3 py-2 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            나중에
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            {submitting ? "저장 중…" : "완료"}
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
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2 transition hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-zinc-900 dark:text-zinc-100">
          {label}
          {required ? (
            <span className="ml-1 text-[10px] font-medium text-red-600">*</span>
          ) : null}
        </span>
        {hint ? (
          <span className="block text-xs text-zinc-500">{hint}</span>
        ) : null}
      </span>
    </label>
  );
}
