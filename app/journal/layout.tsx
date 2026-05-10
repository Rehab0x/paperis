import { Suspense } from "react";
import Link from "next/link";
import AuthMenu from "@/components/AuthMenu";
import LibraryLink from "@/components/LibraryLink";
import SettingsLink from "@/components/SettingsLink";
import TtsQueueBadge from "@/components/TtsQueueBadge";
import UsageBanner from "@/components/UsageBanner";

// /journal/* 라우트의 공통 헤더. 메인(/) 헤더와 똑같은 라이브러리/설정/큐 배지를
// 그대로 노출 — 저널 큐레이션 흐름에서도 청취/큐 상태가 끊김 없이 보여야 한다.
//
// PlayerBar / PlayerProvider / TtsQueueProvider 등 모든 글로벌 provider는
// app/layout.tsx에서 이미 wrapping되어 있다. 여기서는 시각적 헤더만 추가.
//
// TtsQueueBadge / LibraryDrawer가 useSearchParams를 사용 → server component 페이지
// 정적 prerender 중 Suspense boundary 강제. 헤더 client 영역을 Suspense로 감싼다.
export default function JournalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Paperis
            <span className="ml-1.5 align-text-top text-[10px] font-mono text-zinc-400">
              v3
            </span>
          </Link>
          <Suspense fallback={null}>
            <div className="flex items-center gap-1">
              <TtsQueueBadge />
              <LibraryLink />
              <SettingsLink />
              <AuthMenu />
            </div>
          </Suspense>
        </div>
      </header>
      <UsageBanner />
      {children}
    </div>
  );
}
