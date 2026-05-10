"use client";

import { useEffect, useState } from "react";

interface Props {
  initialValue: string;
  loading: boolean;
  onSubmit: (value: string) => void;
}

export default function SearchBar({ initialValue, loading, onSubmit }: Props) {
  const [value, setValue] = useState(initialValue);

  // URL이 바뀌면(예: 뒤로가기) 입력값도 동기화. master 패턴.
  useEffect(() => {
    setValue(initialValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full items-center gap-2 rounded-2xl border border-paperis-border bg-paperis-surface p-1.5 transition focus-within:border-paperis-accent/60"
    >
      <span aria-hidden className="pl-2.5 text-paperis-text-3">
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="자연어로 논문 검색..."
        autoFocus
        disabled={loading}
        className="flex-1 bg-transparent px-1 py-2 text-base text-paperis-text outline-none placeholder:text-paperis-text-3 disabled:opacity-60"
        aria-label="자연어 검색어"
      />
      <button
        type="submit"
        disabled={loading || value.trim().length === 0}
        className="rounded-xl bg-paperis-accent px-4 py-2 text-sm font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "검색 중…" : "검색"}
      </button>
    </form>
  );
}
