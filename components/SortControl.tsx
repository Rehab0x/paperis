"use client";

import { useAppMessages } from "@/components/useAppMessages";
import type { SortMode } from "@/types";

interface Props {
  value: SortMode;
  onChange: (next: SortMode) => void;
  disabled?: boolean;
}

export default function SortControl({ value, onChange, disabled }: Props) {
  const m = useAppMessages();
  const OPTIONS: ReadonlyArray<{ value: SortMode; label: string; hint: string }> = [
    { value: "relevance", label: m.sort.relevance, hint: m.sort.relevanceHint },
    { value: "recency", label: m.sort.recency, hint: m.sort.recencyHint },
    { value: "citations", label: m.sort.citations, hint: m.sort.citationsHint },
  ];

  return (
    <div
      role="radiogroup"
      aria-label={m.sort.aria}
      className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-paperis-border bg-paperis-surface p-1 text-sm"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.hint}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={[
              "rounded-lg px-3 py-1.5 transition",
              active
                ? "bg-paperis-accent text-paperis-bg"
                : "text-paperis-text-2 hover:bg-paperis-surface-2 hover:text-paperis-text",
              disabled ? "cursor-not-allowed opacity-50" : "",
            ].join(" ")}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
