// 관리자 권한 — env ADMIN_EMAILS (콤마 구분)에 등록된 이메일.
//
// 관리자는:
//   - 모든 LLM 호출 무제한 (Free 한도 우회)
//   - BYOK UI 활성 (API 키 입력 / AI provider 선택)
//   - 입력 키 없으면 서버 env 키 (우리 prod 키) 사용
//
// 결제 흐름과 무관 — admin은 DB subscriptions가 아닌 환경변수 기반.
// BYOK/Pro 결제는 그대로 가능 (admin이 결제해도 무료지만 흐름 검증용).

import { auth } from "@/auth";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

/**
 * 현재 세션 사용자가 관리자인지 — 라우트가 BYOK 게이트와 함께 체크.
 * auth() 호출 비용은 미미하므로 매번 호출 OK.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const session = await auth();
    return isAdminEmail(session?.user?.email);
  } catch {
    return false;
  }
}

/**
 * /admin/* 페이지 가드 — 관리자 아니면 notFound() (404). /admin URL 존재 자체를 숨김.
 * 호출자가 session 정보 필요 시 await auth() 추가로 호출 (이 함수는 boolean만).
 */
export async function requireAdmin(): Promise<void> {
  const { notFound } = await import("next/navigation");
  if (!(await isCurrentUserAdmin())) {
    notFound();
  }
}
