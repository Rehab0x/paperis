"use client";

// 저널 큐레이션 흐름의 공통 페이지네이션. v2 main page의 inline Pagination과
// 동일 시맨틱 — 이전/다음 + 현재 페이지 표시.

import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";

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
  const m = useAppMessages();
  const safeTotal = Math.max(1, Math.min(totalPages, 9999));
  const isFirst = page <= 1;
  const isLast = page >= safeTotal;
  if (safeTotal <= 1) return null;
  return (
    <nav
      aria-label={m.journal.pagination.aria}
      className="mt-6 flex items-center justify-between gap-3 border-t border-paperis-border pt-4"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={isFirst}
        className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-30"
      >
        {fmt(m.journal.pagination.prev, { n: pageSize })}
      </button>
      <span className="text-xs text-paperis-text-3">
        {fmt(m.journal.pagination.pageOf, {
          page: page.toLocaleString(),
          total: safeTotal.toLocaleString(),
        })}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={isLast}
        className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-30"
      >
        {fmt(m.journal.pagination.next, { n: pageSize })}
      </button>
    </nav>
  );
}
