"use client";

import type { MiniSummary } from "@/types";

interface Props {
  summary: MiniSummary | undefined;
  loading: boolean;
  onRequest: () => void;
}

export default function MiniSummaryView({ summary, loading, onRequest }: Props) {
  if (summary) {
    return (
      <ul className="mt-2.5 space-y-1 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        {summary.bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
            <span>{b}</span>
          </li>
        ))}
        <li className="pt-1 text-[10px] uppercase tracking-wide text-zinc-400">
          {summary.paperType === "review" ? "Review" : "Research"} · 미니 요약
        </li>
      </ul>
    );
  }
  if (loading) {
    return (
      <div className="mt-2.5 space-y-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-3 rounded bg-zinc-100 dark:bg-zinc-900"
            style={{ width: `${70 + ((i * 13) % 25)}%` }}
          />
        ))}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRequest();
      }}
      className="mt-2 inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 shadow-sm transition hover:border-zinc-400 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
    >
      📋 한눈에 요약
    </button>
  );
}
