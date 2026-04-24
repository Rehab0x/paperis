"use client";

import { useState, type FormEvent } from "react";
import type { NeedFilter } from "@/types";

const FILTERS: { value: NeedFilter; label: string; hint: string }[] = [
  { value: "balanced", label: "균형", hint: "전체 분야 골고루" },
  { value: "treatment", label: "치료", hint: "중재·치료 위주" },
  { value: "diagnosis", label: "진단", hint: "평가·진단 위주" },
  { value: "trend", label: "동향", hint: "리뷰·메타분석" },
];

interface Props {
  initialQuery?: string;
  initialFilter?: NeedFilter;
  disabled?: boolean;
  onSearch: (query: string, filter: NeedFilter) => void;
}

export default function SearchBar({
  initialQuery = "",
  initialFilter = "balanced",
  disabled = false,
  onSearch,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState<NeedFilter>(initialFilter);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    onSearch(trimmed, filter);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="예: stroke rehabilitation, spasticity, gait training"
          disabled={disabled}
          className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
        />
        <button
          type="submit"
          disabled={disabled || !query.trim()}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {disabled ? "검색 중…" : "검색"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              title={f.hint}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition " +
                (active
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-500")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>
    </form>
  );
}
