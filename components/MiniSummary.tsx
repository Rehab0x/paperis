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
      <ul className="mt-2.5 space-y-1 text-sm leading-relaxed text-paperis-text-2">
        {summary.bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-paperis-accent" />
            <span>{b}</span>
          </li>
        ))}
        <li className="pt-1 text-[10px] uppercase tracking-[0.06em] text-paperis-text-3">
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
            className="h-3 rounded bg-paperis-border"
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
      className="mt-2 inline-flex items-center gap-1 rounded-lg border border-paperis-border bg-paperis-surface px-2 py-1 text-xs font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
    >
      📋 한눈에 요약
    </button>
  );
}
