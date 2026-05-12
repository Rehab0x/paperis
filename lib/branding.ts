// Paperis 브랜딩/법인 정보 — 한 곳에서 관리.
//
// COMPANY_NAME은 placeholder. 사업자등록 후 실제 법인명 정해지면 이 한 줄만
// 갱신하면 footer, legal 페이지, 영수증 등 모든 표기가 일괄 변경된다.
//
// 다국어는 lib/i18n.ts 메시지 키로 분리하지 않고 그대로 표기 — 회사명은
// 모든 언어에서 동일하게 노출되는 게 일반적.

export const COMPANY_NAME = "Neokuns";

// 저작권 표시 시작 연도. 현재 연도와 다르면 "2024 — 2026" 같은 범위 표기 가능.
// 단일 연도면 "© 2026 Company" 형태.
export const COPYRIGHT_YEAR_START = 2026;

export function getCopyrightYears(): string {
  const now = new Date().getFullYear();
  return now > COPYRIGHT_YEAR_START
    ? `${COPYRIGHT_YEAR_START}–${now}`
    : String(COPYRIGHT_YEAR_START);
}
