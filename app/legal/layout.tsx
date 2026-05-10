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
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Paperis
            <span className="ml-1.5 align-text-top text-[10px] font-mono text-zinc-400">
              v3
            </span>
          </Link>
          <nav className="flex items-center gap-3 text-xs text-zinc-500">
            <Link href="/legal/terms" className="hover:text-zinc-700 dark:hover:text-zinc-300">
              이용약관
            </Link>
            <Link
              href="/legal/privacy"
              className="hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              개인정보처리방침
            </Link>
            <Link
              href="/legal/refund"
              className="hover:text-zinc-700 dark:hover:text-zinc-300"
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
