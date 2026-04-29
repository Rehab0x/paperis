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
      className="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 text-sm dark:border-zinc-800 dark:bg-zinc-900"
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
              "rounded-md px-3 py-1.5 transition",
              active
                ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800",
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
