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
  journals: JournalSummary[];
  specialtyId: string;
}

export default function SpecialtyJournalsList({ journals, specialtyId }: Props) {
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

  // SSR 시점엔 차단 목록을 모르니 모두 표시. hydrate 후 filter 적용 — 차단된 카드가
  // 한 프레임 보였다가 사라질 수 있으나 localStorage 기반이라 어쩔 수 없는 trade-off.
  const visibleJournals = hydrated
    ? journals.filter((j) => !blocks.has(j.openAlexId))
    : journals;
  const hiddenCount = journals.length - visibleJournals.length;

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visibleJournals.map((j) => (
          <li key={j.openAlexId}>
            <JournalCard
              journal={j}
              href={j.issnL ? `/journal/${encodeURIComponent(j.issnL)}` : undefined}
              onBlock={() => handleBlock(j)}
            />
          </li>
        ))}
      </ul>
      {hiddenCount > 0 ? (
        <p className="mt-4 text-xs text-zinc-400">
          이 임상과에서 {hiddenCount}개 저널이 숨겨져 있습니다.
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
