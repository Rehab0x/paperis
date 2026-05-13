"use client";

import MiniSummaryView from "@/components/MiniSummary";
import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";
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
  const m = useAppMessages();
  const cited = formatCitations(paper.citedByCount);

  return (
    <article
      // 트렌드의 representativePmids가 anchor scroll로 점프할 때 타깃 id로 사용
      id={`paper-${paper.pmid}`}
      onClick={() => onSelect(paper.pmid)}
      className={[
        "group cursor-pointer rounded-2xl border p-4 transition",
        selected
          ? "border-paperis-accent bg-paperis-surface-2"
          : "border-paperis-border bg-paperis-surface hover:border-paperis-text-3",
      ].join(" ")}
      aria-current={selected ? "true" : undefined}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-mono text-xs tabular-nums text-paperis-text-3">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-medium leading-snug tracking-tight text-paperis-text">
            {paper.title || m.paper.noTitle}
          </h3>
          <p className="mt-1.5 text-xs text-paperis-text-3">
            {formatAuthors(paper.authors)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-paperis-text-3">
            <span className="italic">{paper.journal || "—"}</span>
            {paper.year ? <span>· {paper.year}</span> : null}
            {paper.access === "open" ? (
              <span className="rounded bg-paperis-accent-dim/40 px-1.5 py-0.5 text-[10px] font-medium text-paperis-accent">
                Open Access
              </span>
            ) : null}
            {cited ? <span>· {fmt(m.paper.cited, { n: cited })}</span> : null}
            {isReview(paper) ? (
              <span className="rounded bg-paperis-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-paperis-text-2">
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
              <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-paperis-text-2">
                {paper.abstract}
              </p>
              <MiniSummaryView
                summary={undefined}
                loading={false}
                onRequest={() => onLoadMini(paper.pmid)}
              />
            </>
          ) : (
            <p className="mt-2.5 text-xs italic text-paperis-text-3">
              {m.paper.noAbstract}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
