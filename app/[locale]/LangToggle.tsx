"use client";

import { useEffect, useRef } from "react";
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
//
// 추가: 마운트 시 현재 페이지 locale을 cookie에 자동 sync. 사용자가 /en을 직접
// 접속했거나 미들웨어 자동 분기로 도착한 경우(토글 클릭 없음)에도 그 locale을
// "사용자의 의사 표명"으로 간주 — 다음 /app 진입에서 useLocale(클라)와
// getRequestLanguage(서버 API)가 모두 cookie로 영어 모드를 일관되게 인식.
export default function LangToggle({ currentLocale, labels }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const syncedRef = useRef<Locale | null>(null);

  useEffect(() => {
    // 같은 locale이면 set 반복 안 함 (Set-Cookie 헤더 트래픽 절약)
    if (syncedRef.current === currentLocale) return;
    document.cookie = `${LOCALE_COOKIE}=${currentLocale}; Path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE}; SameSite=Lax`;
    syncedRef.current = currentLocale;
  }, [currentLocale]);

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
