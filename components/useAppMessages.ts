"use client";

import { getMessages, type Messages } from "@/lib/i18n";
import { useLocale } from "@/components/useLocale";

// 앱 UI 메시지 훅. useLocale로 현재 locale 얻고, messages/{ko,en}.json의 app.* 네임스페이스 반환.
// 사용:
//   const m = useAppMessages();
//   return <button>{m.tts.convert}</button>;
//
// SSR/hydration:
//   - useLocale이 첫 렌더 "ko"로 시작 → useEffect에서 cookie 읽어 swap.
//   - i18n.ts의 messages는 정적 import라 동기. locale만 swap되면 메시지도 자동.
//
// 서버 컴포넌트는 직접 getMessages(locale).app 호출.
export function useAppMessages(): Messages["app"] {
  const locale = useLocale();
  return getMessages(locale).app;
}
