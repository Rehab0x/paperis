"use client";

import MiniSummaryView from "@/components/MiniSummary";
import type { MiniSummary, Paper } from "@/types";

interface Props {
  paper: Paper;
  index: number;
  selected: boolean;
  miniSummary: MiniSummary | undefined;
  miniLoading: boolean;
  onSelect: (pmid: string) => void;
  onLoadMini: (pmid: string) => void;
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} et al.`;
}

function formatCitations(n: number | undefined): string {
  if (n == null) return "";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function isReview(paper: Paper): boolean {
  return paper.publicationTypes.some((t) =>
    /Review|Meta-Analysis|Systematic/i.test(t)
  );
}

export default function PaperCard({
  paper,
  index,
  selected,
  miniSummary,
  miniLoading,
  onSelect,
  onLoadMini,
}: Props) {
  const cited = formatCitations(paper.citedByCount);

  return (
    <article
      // 트렌드의 representativePmids가 anchor scroll로 점프할 때 타깃 id로 사용
      id={`paper-${paper.pmid}`}
      onClick={() => onSelect(paper.pmid)}
      className={[
        "group cursor-pointer rounded-xl border p-4 transition",
        selected
          ? "border-zinc-900 bg-zinc-50 shadow-sm dark:border-zinc-100 dark:bg-zinc-900"
          : "border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600",
      ].join(" ")}
      aria-current={selected ? "true" : undefined}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-xs font-mono text-zinc-400">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
            {paper.title || "(제목 없음)"}
          </h3>
          <p className="mt-1.5 text-xs text-zinc-500">
            {formatAuthors(paper.authors)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            <span className="italic">{paper.journal || "—"}</span>
            {paper.year ? <span>· {paper.year}</span> : null}
            {paper.access === "open" ? (
              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                Open Access
              </span>
            ) : null}
            {cited ? <span className="text-zinc-400">· 인용 {cited}</span> : null}
            {isReview(paper) ? (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-400">
                Review
              </span>
            ) : null}
          </p>

          {miniSummary || miniLoading ? (
            <MiniSummaryView
              summary={miniSummary}
              loading={miniLoading}
              onRequest={() => onLoadMini(paper.pmid)}
            />
          ) : paper.abstract ? (
            <>
              <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
                {paper.abstract}
              </p>
              <MiniSummaryView
                summary={undefined}
                loading={false}
                onRequest={() => onLoadMini(paper.pmid)}
              />
            </>
          ) : (
            <p className="mt-2.5 text-xs italic text-zinc-400">
              초록이 제공되지 않습니다.
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
