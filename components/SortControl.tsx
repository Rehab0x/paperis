"use client";

import type { SortMode } from "@/types";

interface Props {
  value: SortMode;
  onChange: (next: SortMode) => void;
  disabled?: boolean;
}

const OPTIONS: ReadonlyArray<{ value: SortMode; label: string; hint: string }> = [
  { value: "relevance", label: "적합도순", hint: "PubMed 관련도 점수 (기본)" },
  { value: "recency", label: "최신순", hint: "발행일 내림차순" },
  {
    value: "citations",
    label: "인용수순",
    hint: "이 페이지 결과 안에서만 인용수로 재정렬",
  },
];

export default function SortControl({ value, onChange, disabled }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="정렬"
      className="flex flex-wrap items-center gap-1 rounded-xl border border-paperis-border bg-paperis-surface p-1 text-sm"
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
