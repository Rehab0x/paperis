"use client";

import { useEffect, useState } from "react";
import LibraryDrawer from "@/components/LibraryDrawer";
import { countTracks, subscribeAudioLibrary } from "@/lib/audio-library";

export default function LibraryLink({ className }: { className?: string }) {
  const [count, setCount] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

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
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="오디오 라이브러리 열기"
        title="오디오 라이브러리"
        className={
          className ??
          "relative inline-flex items-center justify-center rounded-md p-1.5 text-lg text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        }
      >
        🎧
        {typeof count === "number" && count > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-zinc-900 px-1 py-0.5 text-[9px] font-medium leading-none text-white dark:bg-zinc-100 dark:text-zinc-900">
            {count}
          </span>
        ) : null}
      </button>
      <LibraryDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
