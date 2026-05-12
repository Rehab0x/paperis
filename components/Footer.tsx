import Link from "next/link";
import { COMPANY_NAME, getCopyrightYears } from "@/lib/branding";

// 글로벌 footer — root layout에 마운트되어 모든 페이지에 자동 노출.
// PlayerBar는 fixed bottom이라 footer가 그 아래 가려질 수 있으므로 footer
// 자체 padding-bottom에 --player-bar-h를 더해 PlayerBar 위에서 끝나도록.
export default function Footer() {
  const years = getCopyrightYears();
  return (
    <footer
      className="mt-auto border-t border-paperis-border bg-paperis-bg px-6 py-6 sm:px-8"
      style={{ paddingBottom: "calc(1.5rem + var(--player-bar-h, 0px))" }}
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <div className="font-serif text-base text-paperis-text-3">
            Paperis<span className="text-paperis-accent">.</span>
          </div>
          <p className="text-[11px] text-paperis-text-3">
            © {years} {COMPANY_NAME}. All rights reserved.
          </p>
        </div>
        <nav className="flex gap-5 text-[11px] text-paperis-text-3">
          <Link href="/legal/terms" className="transition hover:text-paperis-text-2">
            Terms
          </Link>
          <Link
            href="/legal/privacy"
            className="transition hover:text-paperis-text-2"
          >
            Privacy
          </Link>
          <Link
            href="/legal/refund"
            className="transition hover:text-paperis-text-2"
          >
            Refund
          </Link>
        </nav>
      </div>
    </footer>
  );
}
