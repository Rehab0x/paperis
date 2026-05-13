"use client";

import { useEffect, useState } from "react";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n";

// 클라이언트가 현재 사용자의 출력 언어를 알아야 할 때(예: TTS 큐 식별자, 명시 body
// 전송) 쓰는 훅. 미들웨어와 동일하게 paperis.locale 쿠키를 진실의 원천으로.
//
// SSR/hydration:
//   - 첫 렌더는 default "ko" — SSR 결과와 일치 보장. cookie는 클라이언트에서만 읽음.
//   - useEffect에서 실제 cookie 값으로 swap. 두 번째 렌더에서 정확한 값 적용.
//   - hydration warning 회피 위해 cookie 의존 UI는 mounted state로 가드하거나, 첫
//     렌더 차이가 시각적으로 큰 영향 없을 때만 사용.
//
// TtsButton 같은 클릭 시점 동작은 useEffect가 항상 먼저 돌므로 안전.
export function useLocale(): Locale {
  const [locale, setLocale] = useState<Locale>("ko");
  useEffect(() => {
    const match = document.cookie.match(
      new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=([^;]+)`)
    );
    const value = match?.[1];
    if (isLocale(value)) setLocale(value);
  }, []);
  return locale;
}
