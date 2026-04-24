import type { Paper } from "@/types";
import PaperCard from "./PaperCard";

interface Props {
  papers: Paper[];
  /** PMID → 추천 이유. 포함된 PMID는 "AI 추천" 카드로 강조 */
  recommendations?: Record<string, { reason: string; rank: number }>;
  /** 카드 번호 시작값 (기본 1) */
  startRank?: number;
  /** true면 카드가 목록 전용(컴팩트). 선택 시 onSelect(pmid) 호출. */
  compact?: boolean;
  onSelect?: (pmid: string) => void;
  /** 하이라이트할 pmid (현재 선택된 것). */
  selectedPmid?: string | null;
}

export default function PaperList({
  papers,
  recommendations,
  startRank = 1,
  compact = false,
  onSelect,
  selectedPmid,
}: Props) {
  if (papers.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {papers.map((paper, idx) => {
        const rec = recommendations?.[paper.pmid];
        const isSelected = selectedPmid === paper.pmid;
        return (
          <div
            key={paper.pmid}
            className={
              isSelected && compact
                ? "rounded-2xl ring-2 ring-zinc-900 ring-offset-2 ring-offset-zinc-50 dark:ring-zinc-100 dark:ring-offset-black"
                : ""
            }
          >
            <PaperCard
              paper={paper}
              rank={startRank + idx}
              recommendationReason={rec?.reason}
              recommendationRank={rec?.rank}
              compact={compact}
              onSelect={onSelect ? () => onSelect(paper.pmid) : undefined}
            />
          </div>
        );
      })}
    </div>
  );
}
