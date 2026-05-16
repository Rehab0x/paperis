// 사용자 locale 감지/검증 헬퍼.
// Google profile.locale은 "ko" 또는 "ko-KR" 같은 BCP47 형식 — 우리 앱은 ko/en 둘만 지원.

import type { Language } from "@/types";

/**
 * Google OAuth profile에서 받은 locale 문자열을 ko/en으로 정규화.
 * 모호하거나 미지원 locale은 ko default.
 */
export function parseGoogleLocale(raw: unknown): Language {
  if (typeof raw !== "string") return "ko";
  const lower = raw.toLowerCase();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("ko")) return "ko";
  return "ko";
}

/** DB users.locale 컬럼 값을 ko/en로 정규화. */
export function normalizeUserLocale(raw: string | null | undefined): Language {
  if (raw === "en") return "en";
  return "ko";
}
