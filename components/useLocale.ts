"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n";

// 클라이언트가 현재 사용자의 출력 언어를 알아야 할 때(예: TTS 큐 식별자, 명시 body
// 전송) 쓰는 훅. 미들웨어와 동일하게 paperis.locale 쿠키를 진실의 원천으로.
//
// SSR/hydration:
//   - 첫 렌더는 default "ko" — SSR 결과와 일치 보장. cookie는 클라이언트에서만 읽음.
//   - useEffect에서 실제 cookie 값으로 swap. 두 번째 렌더에서 정확한 값 적용.
//
// 변경 reactive — `paperis:locale-change` 커스텀 이벤트 구독. 토글 컴포넌트가 쿠키
// set 직후 dispatchEvent → 모든 useLocale 사용 컴포넌트가 즉시 re-render.

/** locale 변경 broadcast 이벤트명 */
export const LOCALE_CHANGE_EVENT = "paperis:locale-change";

function readLocaleFromCookie(): Locale | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`)
  );
  const value = match?.[1];
  return isLocale(value) ? value : null;
}

export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("ko");
  useEffect(() => {
    const apply = () => {
      const value = readLocaleFromCookie();
      if (value) setLocale(value);
    };
    apply(); // 마운트 직후 쿠키 값으로
    window.addEventListener(LOCALE_CHANGE_EVENT, apply);
    return () => window.removeEventListener(LOCALE_CHANGE_EVENT, apply);
  }, []);
  return locale;
}
