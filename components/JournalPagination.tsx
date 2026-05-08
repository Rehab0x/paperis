"use client";

// 저널 큐레이션 흐름의 공통 페이지네이션. v2 main page의 inline Pagination과
// 동일 시맨틱 — 이전/다음 + 현재 페이지 표시.

interface Props {
  page: number;
  totalPages: number;
  pageSize: number;
  onChange: (next: number) => void;
}

export default function JournalPagination({
  page,
  totalPages,
  pageSize,
  onChange,
}: Props) {
  const safeTotal = Math.max(1, Math.min(totalPages, 9999));
  const isFirst = page <= 1;
  const isLast = page >= safeTotal;
  if (safeTotal <= 1) return null;
  return (
    <nav
      aria-label="페이지 이동"
      className="mt-6 flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={isFirst}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        ← 이전 {pageSize}건
      </button>
      <span className="text-xs text-zinc-500">
        {page.toLocaleString()} / {safeTotal.toLocaleString()} 페이지
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={isLast}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        다음 {pageSize}건 →
      </button>
    </nav>
  );
}
