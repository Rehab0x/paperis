"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import AudioLibrary from "@/components/AudioLibrary";
import { useAppMessages } from "@/components/useAppMessages";
import type { AudioTrackMeta } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
}

// 드로어는 PlayerBar 위에서 끝나도록 — bottom은 PlayerBar가 ResizeObserver로
// 노출하는 CSS 변수 --player-bar-h에 맞춰 동적으로 변한다 (모바일에서 컨트롤이
// 두 줄로 늘어나면 자동으로 더 높게 잘림). 플레이어 없을 땐 0px.

// 우측에서 슬라이드되는 라이브러리 드로어.
// 메인 검색 화면 위에 떠 있어 닫으면 검색 결과/스크롤이 그대로 보존된다.
// 트랙의 "📄" 클릭 시 ?pmid=… 로 URL을 갱신 + 드로어 자동 닫음 →
// 메인 페이지의 paperSnapshot fallback이 디테일 패널을 띄운다.
//
// 디자인 노트:
//   - mount는 항상, transform/opacity로 표시 상태만 토글 → CSS transition 동작
//   - max-w-3xl로 v2.0.1 보다 넓게 (트랙 메타가 한 줄에 더 잘 들어감)
//   - body 스크롤 락은 open일 때만
export default function LibraryDrawer({ open, onClose }: Props) {
  const m = useAppMessages();
  const router = useRouter();
  const searchParams = useSearchParams();
  // SSR-safe portal target — 헤더의 backdrop-filter가 fixed 자식의 containing block이
  // 되어 드로어가 헤더 영역 안에 갇히는 CSS 사양 회피용. body에 직접 마운트한다.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  function handleOpenPaper(track: AudioTrackMeta) {
    // 트렌드 브리핑 트랙은 PaperDetailPanel이 아니라 원래 트렌드 페이지로 — pmid
    // 형식 "trend:{issn}:{year}:{quarter}"를 파싱해 /journal/{issn}?tab=trend&...로.
    // 그 페이지가 Redis 캐시 hit이면 Gemini 호출 0으로 즉시 결과 표시.
    const trendMatch = /^trend:([^:]+):(\d{4}):(all|Q[1-4])$/.exec(track.pmid);
    if (trendMatch) {
      const [, issn, year, quarter] = trendMatch;
      const qs = new URLSearchParams({ tab: "trend", year, quarter });
      router.push(`/journal/${encodeURIComponent(issn)}?${qs.toString()}`, {
        scroll: false,
      });
      onClose();
      return;
    }
    // 일반 paper 트랙 — 메인 페이지의 PaperDetailPanel이 paperSnapshot fallback으로 띄움
    const params = new URLSearchParams(searchParams.toString());
    params.set("pmid", track.pmid);
    router.push(`/app?${params.toString()}`, { scroll: false });
    onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <>
      {/* backdrop — 페이드 */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className={[
          "fixed inset-0 z-30 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        ].join(" ")}
      />
      {/* panel — 우측에서 슬라이드. PlayerBar 위에서 끝나 ▶/📜 컨트롤이 항상 노출. */}
      <aside
        role="dialog"
        aria-label={m.library.drawerAria}
        aria-hidden={!open}
        style={{ bottom: "var(--player-bar-h, 0px)" }}
        className={[
          "fixed right-0 top-0 z-40 flex w-full max-w-5xl flex-col border-l border-paperis-border bg-paperis-bg shadow-[0_0_60px_-12px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
      >
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-paperis-border bg-paperis-bg/95 px-5 py-3 backdrop-blur-xl">
          <h2 className="font-serif text-xl font-medium tracking-tight text-paperis-text">
            Audio Library
            <span className="text-paperis-accent">.</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
            aria-label={m.library.drawerCloseAria}
            title="ESC"
          >
            {m.library.drawerCloseLabel}
          </button>
        </header>
        <div className="flex-1 overflow-auto px-5 py-4 pb-8">
          <AudioLibrary onOpenPaper={handleOpenPaper} />
        </div>
      </aside>
    </>,
    document.body
  );
}
