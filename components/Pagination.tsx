"use client";

interface Props {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

// 페이지 번호 시퀀스 빌드: 처음/끝 + 현재 주변 윈도우, 중간엔 ellipsis(0).
// 총 7개 슬롯 안팎으로 압축.
function buildPages(current: number, total: number): (number | "…")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const out: (number | "…")[] = [];
  const window = 1; // 현재 주변 ±1

  out.push(1);
  if (current - window > 2) out.push("…");

  const start = Math.max(2, current - window);
  const end = Math.min(total - 1, current + window);
  for (let i = start; i <= end; i++) out.push(i);

  if (current + window < total - 1) out.push("…");
  out.push(total);
  return out;
}

export default function Pagination({ page, totalPages, onChange }: Props) {
  if (totalPages <= 1) return null;
  const pages = buildPages(page, totalPages);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <nav
      aria-label="페이지 네비게이션"
      className="mt-2 flex flex-wrap items-center justify-center gap-1 rounded-2xl border border-zinc-200 bg-white px-2 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={!canPrev}
        aria-label="이전 페이지"
        className="inline-flex h-8 min-w-8 items-center rounded-lg px-2 font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        ←
      </button>

      {pages.map((p, idx) =>
        p === "…" ? (
          <span
            key={`ellipsis-${idx}`}
            className="inline-flex h-8 min-w-8 items-center justify-center text-zinc-400"
            aria-hidden
          >
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            aria-current={p === page ? "page" : undefined}
            aria-label={`${p} 페이지`}
            className={
              "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 font-medium transition " +
              (p === page
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800")
            }
          >
            {p}
          </button>
        )
      )}

      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={!canNext}
        aria-label="다음 페이지"
        className="inline-flex h-8 min-w-8 items-center rounded-lg px-2 font-medium text-zinc-700 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        →
      </button>
    </nav>
  );
}
