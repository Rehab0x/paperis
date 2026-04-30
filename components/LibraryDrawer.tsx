"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AudioLibrary from "@/components/AudioLibrary";
import type { AudioTrack } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

// 우측에서 슬라이드되는 라이브러리 드로어.
// 메인 검색 화면 위에 떠 있어 닫으면 검색 결과/스크롤 상태가 그대로 보존된다.
// 트랙의 "📄" 클릭 시 ?pmid=… 로 URL을 갱신 + 드로어 자동 닫음 →
// 메인 페이지의 paperSnapshot fallback이 디테일 패널을 띄운다.
export default function LibraryDrawer({ open, onClose }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // body 스크롤 락
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  function handleOpenPaper(track: AudioTrack) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pmid", track.pmid);
    router.push(`/?${params.toString()}`, { scroll: false });
    onClose();
  }

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-30 bg-black/30 dark:bg-black/60"
        aria-hidden="true"
      />
      <aside
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-xl flex-col bg-white shadow-2xl dark:bg-zinc-950"
        role="dialog"
        aria-label="오디오 라이브러리"
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-5 py-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            🎧 오디오 라이브러리
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="라이브러리 닫기 (ESC)"
            title="ESC"
          >
            닫기 ✕
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4 pb-32">
          <AudioLibrary onOpenPaper={handleOpenPaper} />
        </div>
      </aside>
    </>
  );
}
