"use client";

import { useTtsQueue } from "@/components/TtsQueueProvider";

export default function TtsCompletionToast() {
  const { completionToast, dismissCompletionToast } = useTtsQueue();
  if (!completionToast) return null;
  return (
    <div
      className="fixed left-1/2 top-4 z-40 flex max-w-md -translate-x-1/2 items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 shadow-lg dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
      role="status"
      aria-live="polite"
    >
      <span className="text-base">🎉</span>
      <span className="flex-1">{completionToast}</span>
      <button
        type="button"
        onClick={dismissCompletionToast}
        className="text-emerald-700/70 hover:text-emerald-900 dark:text-emerald-300/70 dark:hover:text-emerald-100"
        aria-label="알림 닫기"
      >
        ✕
      </button>
    </div>
  );
}
