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
      className="flex w-full items-center gap-2 rounded-xl border border-zinc-200 bg-white p-1.5 shadow-sm transition focus-within:border-zinc-400 focus-within:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:focus-within:border-zinc-600"
    >
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="예) 아급성기 뇌졸중 환자에서 상지 로봇치료의 효과"
        autoFocus
        disabled={loading}
        className="flex-1 bg-transparent px-3 py-2 text-base outline-none placeholder:text-zinc-400 disabled:opacity-60"
        aria-label="자연어 검색어"
      />
      <button
        type="submit"
        disabled={loading || value.trim().length === 0}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {loading ? "검색 중…" : "검색"}
      </button>
    </form>
  );
}
