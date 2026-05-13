// Paperis 미들웨어 — 루트(/) 진입 시 랜딩페이지/앱 분기.
//
// 흐름:
//   /  →  세션 쿠키 있으면 /app, 없으면 locale 감지 후 /{locale}
//   /ko, /en  →  그대로 통과 (랜딩페이지 렌더)
//   그 외 (/app, /journal/*, /account 등)  →  matcher가 잡지 않음 → 그대로 통과
//
// Locale 감지 우선순위:
//   1. 사용자가 토글로 저장한 LOCALE_COOKIE
//   2. Vercel GeoIP (x-vercel-ip-country) — KR이면 ko (로컬 dev에는 없음)
//   3. Accept-Language 헤더 — ko 토큰이 어디든 등장하면 ko (parseAcceptLanguage 참고)
//   4. DEFAULT_LOCALE (en)
//
// Feature flag: NEXT_PUBLIC_FEATURE_LANDING=0 이면 랜딩 분기 자체 비활성 → / → /app 강제.
// 라이브 회귀 위험 시 즉시 끌 수 있도록.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  DEFAULT_LOCALE,
  KR_COUNTRY_CODE,
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  isLocale,
  parseAcceptLanguage,
  type Locale,
} from "@/lib/i18n";

// Auth.js v5 (next-auth) 세션 쿠키 이름. https/http 모두 커버 — 둘 중 하나라도 있으면 로그인 간주.
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => Boolean(req.cookies.get(name)));
}

function detectLocale(req: NextRequest): Locale {
  // 1. 명시 토글 쿠키
  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  // 2. GeoIP — 한국 IP면 한국어
  const country = req.headers.get("x-vercel-ip-country");
  if (country === KR_COUNTRY_CODE) return "ko";

  // 3. Accept-Language
  const fromHeader = parseAcceptLanguage(req.headers.get("accept-language"));
  if (fromHeader) return fromHeader;

  // 4. fallback
  return DEFAULT_LOCALE;
}

export function middleware(req: NextRequest) {
  const featureLanding = process.env.NEXT_PUBLIC_FEATURE_LANDING === "1";

  // Feature flag off → 기존 동작 유지 (/ 는 /app으로). 회귀 가드.
  if (!featureLanding) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // 로그인 사용자는 랜딩 건너뛰고 바로 앱으로
  if (hasSessionCookie(req)) {
    return NextResponse.redirect(new URL("/app", req.url));
  }

  // 비로그인 — locale 감지 후 랜딩으로. 감지된 locale을 cookie에도 sync해
  // 다음 진입(예: /en 랜딩에서 /app으로 이동)에서 서버 getRequestLanguage와
  // 클라이언트 useLocale이 모두 같은 값을 보게 한다.
  const locale = detectLocale(req);
  const response = NextResponse.redirect(new URL(`/${locale}`, req.url));
  response.cookies.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return response;
}

// 루트 / 만 가로챈다. 다른 모든 경로(/app, /journal/*, /account, /api/*, 정적
// 파일 등)는 미들웨어 통과 없이 그대로 동작 — 회귀 위험 최소화.
export const config = {
  matcher: ["/"],
};
