"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  type Locale,
} from "@/lib/i18n";

interface Props {
  currentLocale: Locale;
  labels: { ko: string; en: string };
}

// 언어 토글 — 쿠키 저장 후 다른 locale 랜딩으로 이동. 미들웨어가 추후
// / 진입 시 이 쿠키를 우선 참조.
export default function LangToggle({ currentLocale, labels }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const switchTo = (target: Locale) => {
    if (target === currentLocale) return;
    document.cookie = `${LOCALE_COOKIE}=${target}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    startTransition(() => {
      router.push(`/${target}`);
    });
  };

  const btnClass = (active: boolean) =>
    [
      "px-3 py-1.5 text-xs font-semibold tracking-wider transition",
      active
        ? "bg-paperis-surface-2 text-paperis-text"
        : "bg-transparent text-paperis-text-3 hover:text-paperis-text-2",
    ].join(" ");

  return (
    <div className="flex items-center overflow-hidden rounded-lg border border-paperis-border bg-paperis-surface">
      <button
        type="button"
        onClick={() => switchTo("ko")}
        className={btnClass(currentLocale === "ko")}
        aria-pressed={currentLocale === "ko"}
      >
        {labels.ko}
      </button>
      <button
        type="button"
        onClick={() => switchTo("en")}
        className={btnClass(currentLocale === "en")}
        aria-pressed={currentLocale === "en"}
      >
        {labels.en}
      </button>
    </div>
  );
}
