import Link from "next/link";

// /legal/* 공통 헤더 — 결제·약관 페이지는 가벼운 레이아웃 (저널 헤더 X).
// 푸터에서 link되는 정적 페이지들이 모여있다.

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="border-b border-paperis-border bg-paperis-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
          <Link
            href="/"
            className="font-serif text-2xl font-medium tracking-tight text-paperis-text"
          >
            Paperis
            <span className="text-paperis-accent">.</span>
          </Link>
          <nav className="flex items-center gap-3 text-xs text-paperis-text-3">
            <Link href="/legal/terms" className="transition hover:text-paperis-text">
              이용약관
            </Link>
            <Link
              href="/legal/privacy"
              className="transition hover:text-paperis-text"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/legal/refund"
              className="transition hover:text-paperis-text"
            >
              환불 정책
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
