// Paperis i18n — 자체 구현. next-intl 같은 무거운 라이브러리 없이 가볍게.
//
// 사용 흐름:
//   1. 미들웨어가 / 진입 시 쿠키/Accept-Language/GeoIP로 locale 결정 후 /ko 또는 /en 리다이렉트
//   2. app/[locale]/* 페이지가 params.locale을 받아 getMessages(locale) 호출
//   3. 컴포넌트는 messages 객체에서 직접 키 접근 (단순 객체 접근, 별도 t() 함수 불필요)
//
// 영어 서비스 파이프라인(Phase 2-B)에서도 동일 Locale 타입을 lib/* 함수들의
// language 파라미터로 그대로 전달 (이미 'ko' | 'en' 받는 함수들 다수).

import koMessages from "@/messages/ko.json";
import enMessages from "@/messages/en.json";

export type Locale = "ko" | "en";

export const LOCALES: readonly Locale[] = ["ko", "en"] as const;

export const DEFAULT_LOCALE: Locale = "en";

// 한국 IP면 ko, 그 외 영어. v3 한국 사용자가 1순위라 isKR 우선순위 가장 높음
// (Accept-Language보다 위) — 한국 의사가 영문 브라우저 쓰는 경우가 많음.
export const KR_COUNTRY_CODE = "KR";

const messagesMap = {
  ko: koMessages,
  en: enMessages,
} satisfies Record<Locale, unknown>;

export type Messages = typeof koMessages;

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "ko" || value === "en";
}

export function getMessages(locale: Locale): Messages {
  return messagesMap[locale] as Messages;
}

// Accept-Language 헤더에서 우리 지원 locale 추출.
// 한국인 사용자가 영어 우선 브라우저(시스템 영어 + 한국어 추가)를 써도 헤더에
// 'ko'가 어디든 포함될 확률이 매우 높다. 그래서 첫 매치 우선이 아니라
// "ko 포함 여부"를 먼저 본다 — 한국 의사 대상 1순위 정책과 일치.
//   "en-US,en;q=0.9,ko;q=0.8"  →  ko (한국인 추정)
//   "en-US,en;q=0.9"           →  en (한국어 미포함)
export function parseAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const codes = header
    .toLowerCase()
    .split(",")
    .map((t) => t.trim().split(";")[0]?.slice(0, 2));
  if (codes.includes("ko")) return "ko";
  if (codes.includes("en")) return "en";
  return null;
}

// 쿠키 이름 (미들웨어와 클라이언트 토글 모두 사용)
export const LOCALE_COOKIE = "paperis.locale";

// 1년 — 사용자가 한 번 명시적으로 토글하면 오래 유지
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
