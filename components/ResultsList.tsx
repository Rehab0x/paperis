"use client";

import PaperCard from "@/components/PaperCard";
import type { MiniSummary, Paper } from "@/types";

interface Props {
  papers: Paper[];
  loading: boolean;
  selectedPmid: string | null;
  miniSummaries: Map<string, MiniSummary>;
  miniLoading: Set<string>;
  onSelect: (pmid: string) => void;
  onLoadMini: (pmid: string) => void;
}

function Skeleton() {
  return (
    <div className="rounded-2xl border border-paperis-border bg-paperis-surface p-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 h-3 w-6 rounded bg-paperis-surface-2" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-4/5 rounded bg-paperis-surface-2" />
          <div className="h-3 w-3/5 rounded bg-paperis-border" />
          <div className="h-3 w-2/5 rounded bg-paperis-border" />
          <div className="mt-2 h-3 w-full rounded bg-paperis-border" />
          <div className="h-3 w-11/12 rounded bg-paperis-border" />
        </div>
      </div>
    </div>
  );
}

export default function ResultsList({
  papers,
  loading,
  selectedPmid,
  miniSummaries,
  miniLoading,
  onSelect,
  onLoadMini,
}: Props) {
  if (loading && papers.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} />
        ))}
      </div>
    );
  }

  if (!loading && papers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {papers.map((paper, idx) => (
        <PaperCard
          key={paper.pmid}
          paper={paper}
          index={idx}
          selected={selectedPmid === paper.pmid}
          miniSummary={miniSummaries.get(paper.pmid)}
          miniLoading={miniLoading.has(paper.pmid)}
          onSelect={onSelect}
          onLoadMini={onLoadMini}
        />
      ))}
    </div>
  );
}
