import Link from "next/link";

// /help/* 공통 헤더 — 가벼운 정적 가이드 페이지 (저널 헤더 X).
// 현재는 /help/api-keys 하나뿐이지만 추후 일반 사용 가이드 등 추가 여지.

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="border-b border-paperis-border bg-paperis-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
          <Link
            href="/app"
            className="font-serif text-2xl font-medium tracking-tight text-paperis-text"
          >
            Paperis
            <span className="text-paperis-accent">.</span>
          </Link>
        </div>
      </header>
      {children}
    </div>
  );
}
