"use client";

// 임상과 페이지의 저널 그리드 client 부분.
// server에서 받은 journals 배열을 그대로 표시하되, 사용자가 "✕ 이 임상과에서
// 숨기기"한 저널은 localStorage 기반으로 필터링해 안 보여준다.

import { useCallback, useEffect, useRef, useState } from "react";
import JournalCard from "@/components/JournalCard";
import {
  blockJournal,
  getBlockedJournals,
  subscribeJournalBlocks,
} from "@/lib/journal-blocks";
import type { JournalSummary } from "@/lib/openalex";

interface Props {
  /** server에서 over-fetched된 후보들 (시드 + 자동 추천 합친 결과) */
  journals: JournalSummary[];
  specialtyId: string;
  /** 화면에 표시할 최대 개수 — 차단으로 줄어든 자리는 다음 후보로 보충된다 */
  targetCount: number;
}

export default function SpecialtyJournalsList({
  journals,
  specialtyId,
  targetCount,
}: Props) {
  const [blocks, setBlocks] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBlocks(getBlockedJournals(specialtyId));
    setHydrated(true);
    return subscribeJournalBlocks(() => {
      setBlocks(getBlockedJournals(specialtyId));
    });
  }, [specialtyId]);

  // unmount 시 toast 타이머 정리
  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleBlock = useCallback(
    (journal: JournalSummary) => {
      blockJournal(specialtyId, journal.openAlexId);
      setToast(
        `"${journal.name}"을(를) 이 임상과에서 숨겼습니다. (설정 → 차단 목록에서 복구 예정)`
      );
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 3500);
    },
    [specialtyId]
  );

  // SSR 시점엔 차단 목록을 모르니 over-fetched 결과 중 상위 targetCount만 표시.
  // hydrate 후엔 차단된 후보를 거른 다음 다시 상위 targetCount → 자리가 자동 보충.
  const visibleJournals = (
    hydrated ? journals.filter((j) => !blocks.has(j.openAlexId)) : journals
  ).slice(0, targetCount);
  // 사용자가 이 임상과에서 차단한 저널 수 (실제로 화면 후보 안에 있던 것 기준)
  const hiddenInCandidates = hydrated
    ? journals.reduce((n, j) => n + (blocks.has(j.openAlexId) ? 1 : 0), 0)
    : 0;

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleJournals.map((j) => (
          <li key={j.openAlexId}>
            <JournalCard
              journal={j}
              // ?from=... 으로 referrer 임상과를 전달 → 저널 홈의 주제 탐색이
              // 해당 임상과의 추천 태그만 노출하도록 한다 (atrial fibrillation이
              // 재활의학과 저널에 뜨는 등의 무관 태그 노이즈 제거).
              href={
                j.issnL
                  ? `/journal/${encodeURIComponent(j.issnL)}?from=${encodeURIComponent(specialtyId)}`
                  : undefined
              }
              onBlock={() => handleBlock(j)}
            />
          </li>
        ))}
      </ul>
      {hiddenInCandidates > 0 ? (
        <p className="mt-4 text-xs text-zinc-400">
          이 임상과에서 {hiddenInCandidates}개 저널이 숨겨져 있습니다 — 빈 자리는
          다음 후보로 채워졌어요.
        </p>
      ) : null}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{ bottom: "calc(var(--player-bar-h, 0px) + 16px)" }}
          className="fixed left-1/2 z-30 max-w-md -translate-x-1/2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 shadow-lg dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
