"use client";

import { useTtsQueue } from "@/components/TtsQueueProvider";

export default function TtsCompletionToast() {
  const { completionToast, dismissCompletionToast } = useTtsQueue();
  if (!completionToast) return null;
  return (
    <div
      className="fixed left-1/2 top-4 z-40 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/80 px-4 py-2.5 text-sm text-paperis-accent shadow-lg backdrop-blur-xl"
      role="status"
      aria-live="polite"
    >
      <span className="text-base">🎉</span>
      <span className="flex-1">{completionToast}</span>
      <button
        type="button"
        onClick={dismissCompletionToast}
        className="text-paperis-accent/70 transition hover:text-paperis-accent"
        aria-label="알림 닫기"
      >
        ✕
      </button>
    </div>
  );
}
