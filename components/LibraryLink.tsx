"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { countTracks, subscribeAudioLibrary } from "@/lib/audio-library";

export default function LibraryLink({ className }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const n = await countTracks();
        if (!cancelled) setCount(n);
      } catch {
        // 라이브러리 접근 실패 시 카운트만 숨김
      }
    }
    void refresh();
    const unsub = subscribeAudioLibrary(() => {
      void refresh();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  return (
    <Link
      href="/library"
      className={
        className ??
        "rounded-md px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }
    >
      🎧 라이브러리
      {typeof count === "number" && count > 0 ? (
        <span className="ml-1 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
