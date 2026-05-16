import { Suspense } from "react";
import Link from "next/link";
import AuthMenu from "@/components/AuthMenu";
import LibraryLink from "@/components/LibraryLink";
import SettingsLink from "@/components/SettingsLink";
import TtsQueueBadge from "@/components/TtsQueueBadge";
import { requireAdmin } from "@/lib/admin";

// /admin/* 공통 헤더 — 관리자 전용. layout 자체에서 가드해 자식 페이지 모두 차단.
// 비관리자가 /admin* URL 진입 시 notFound() (404 페이지) — 존재 자체를 숨김.
//
// UsageBanner는 노출 안 함 (관리자는 한도 우회).

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-paperis-border bg-paperis-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="font-serif text-2xl font-medium tracking-tight text-paperis-text"
            >
              Paperis
              <span className="text-paperis-accent">.</span>
            </Link>
            <span className="rounded-full bg-paperis-accent-dim/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-paperis-accent">
              Admin
            </span>
          </div>
          <Suspense fallback={null}>
            <div className="flex items-center gap-0.5">
              <TtsQueueBadge />
              <LibraryLink className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text" />
              <SettingsLink className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text" />
              <AuthMenu />
            </div>
          </Suspense>
        </div>
      </header>
      {children}
    </div>
  );
}
