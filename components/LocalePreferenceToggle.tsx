"use client";

// Settings 드로어용 언어 토글. 클릭 시 두 가지 동시 수행:
//   1. paperis.locale 쿠키 즉시 set → useLocale 훅이 다음 렌더에 반영 (UI 즉각)
//   2. /api/account/locale PATCH → users.locale DB 업데이트 (이메일 트리거가 참조)
//
// 비로그인 사용자는 PATCH 401 — 쿠키만 set (UI 영향만 받고 이메일 무관).
//
// 새로고침까지 안 기다리려고 router.refresh() — server components(랜딩 등)도 새 locale로
// 다시 렌더.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, type Locale } from "@/lib/i18n";
import { useLocale } from "@/components/useLocale";

export default function LocalePreferenceToggle() {
  const current = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function switchTo(next: Locale) {
    if (busy || next === current) return;
    setBusy(true);
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    try {
      // 로그인 사용자만 DB 저장. 비로그인은 401 — 무시.
      await fetch("/api/account/locale", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
    } catch {
      // 네트워크 실패 — 쿠키는 이미 set, UI는 정상. 다음 가입·결제 시 재시도되지 않음
      // (사용자가 다시 토글 시 다시 PATCH 시도)
    }
    router.refresh();
    setBusy(false);
  }

  const btn = (target: Locale, label: string) => {
    const active = current === target;
    return (
      <button
        type="button"
        onClick={() => switchTo(target)}
        aria-pressed={active}
        disabled={busy}
        className={[
          "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition",
          active
            ? "bg-paperis-accent text-paperis-bg"
            : "bg-transparent text-paperis-text-2 hover:bg-paperis-surface-2",
          busy ? "cursor-wait opacity-70" : "",
        ].join(" ")}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-paperis-border bg-paperis-surface p-0.5">
      {btn("ko", "한국어")}
      {btn("en", "English")}
    </div>
  );
}
