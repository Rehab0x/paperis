"use client";

import { useEffect } from "react";
import PaperCard from "./PaperCard";
import type { Paper } from "@/types";

interface Props {
  paper: Paper;
  onClose: () => void;
}

export default function PaperModal({ paper, onClose }: Props) {
  // ESC로 닫기
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="논문 상세"
    >
      <div
        className="relative my-8 w-full max-w-2xl px-4 sm:px-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-zinc-300">PMID {paper.pmid}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-8 items-center gap-1 rounded-full bg-white/90 px-3 text-xs font-medium text-zinc-700 backdrop-blur transition hover:bg-white dark:bg-zinc-900/90 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            닫기 ✕
          </button>
        </div>
        <PaperCard paper={paper} rank={0} />
      </div>
    </div>
  );
}
