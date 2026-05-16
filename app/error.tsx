"use client";

// 일반 라우트 에러 바운더리. Next App Router 컨벤션 — 자식 컴포넌트에서 throw된
// 에러를 잡고 UI 대체. /app, /journal 등 대부분 페이지의 런타임 에러를 커버.
//
// Next 16: error 컴포넌트는 layout 안쪽에 mount → 헤더·푸터는 그대로, 페이지 본문만 교체.
// global-error.tsx는 layout 자체가 깨졌을 때만 (root 폴백).

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vercel Logs에 자동 캡처되지만 명시적으로도 (Sentry 통합 시 여기 hook)
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-4 px-4 py-16 pb-32">
      <div className="text-3xl" aria-hidden>
        ⚠️
      </div>
      <h1 className="font-serif text-2xl font-medium tracking-tight text-paperis-text">
        문제가 발생했어요
      </h1>
      <p className="text-sm text-paperis-text-2">
        페이지를 그리는 중 예상치 못한 오류가 났습니다. 다시 시도하거나 홈으로 돌아가세요.
        문제가 계속되면 잠시 후 다시 들러주세요.
      </p>
      {error.digest ? (
        <p className="font-mono text-[10px] text-paperis-text-3">
          오류 ID: {error.digest}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-9 items-center rounded-lg bg-paperis-accent px-4 text-sm font-medium text-paperis-bg transition hover:opacity-90"
        >
          다시 시도
        </button>
        <Link
          href="/app"
          className="inline-flex h-9 items-center rounded-lg border border-paperis-border bg-paperis-surface px-4 text-sm font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
        >
          홈으로
        </Link>
      </div>
    </main>
  );
}
