"use client";

// 임상과 페이지의 저널 그리드 client 부분.
// server에서 받은 candidates(시드 + 자동 추천 over-fetch 20개) +
// 사용자가 직접 추가한 저널(localStorage)을 합쳐서 표시:
//
//   [사용자 추가 저널들 — 항상 위, "내가 추가" 배지]
//   [시드/자동 추천 — 차단된 것 제외 후 상위 targetCount]
//
// "+ 저널 추가" 버튼으로 JournalSearchAdder 패널 토글 — OpenAlex 자동완성으로
// 검색해 즉석 추가. 차단/추가/시드/자동 사이의 중복은 openAlexId로 dedupe.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JournalCard from "@/components/JournalCard";
import JournalSearchAdder from "@/components/JournalSearchAdder";
import {
  blockJournal,
  getBlockedJournals,
  subscribeJournalBlocks,
} from "@/lib/journal-blocks";
import {
  addJournal,
  getAddedJournals,
  removeAddedJournal,
  subscribeJournalAdditions,
} from "@/lib/journal-additions";
import type { JournalSummary } from "@/lib/openalex";

interface Props {
  /** server에서 over-fetched된 후보들 (시드 + 자동 추천) */
  journals: JournalSummary[];
  specialtyId: string;
  /** 시드/자동 추천 영역의 표시 한도. 차단으로 줄어든 자리는 다음 후보로 보충 */
  targetCount: number;
}

export default function SpecialtyJournalsList({
  journals,
  specialtyId,
  targetCount,
}: Props) {
  const [blocks, setBlocks] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState<JournalSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [adderOpen, setAdderOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBlocks(getBlockedJournals(specialtyId));
    setAdded(getAddedJournals(specialtyId));
    setHydrated(true);
    const unsubBlocks = subscribeJournalBlocks(() => {
      setBlocks(getBlockedJournals(specialtyId));
    });
    const unsubAdditions = subscribeJournalAdditions(() => {
      setAdded(getAddedJournals(specialtyId));
    });
    return () => {
      unsubBlocks();
      unsubAdditions();
    };
  }, [specialtyId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  const handleBlock = useCallback(
    (journal: JournalSummary) => {
      blockJournal(specialtyId, journal.openAlexId);
      showToast(
        `"${journal.name}"을(를) 이 임상과에서 숨겼습니다. (설정 → 차단 목록에서 복구)`
      );
    },
    [specialtyId]
  );

  const handleAdd = useCallback(
    (journal: JournalSummary) => {
      addJournal(specialtyId, journal);
      setAdderOpen(false);
      showToast(`"${journal.name}"을(를) 추가했습니다.`);
    },
    [specialtyId]
  );

  const handleRemoveAdded = useCallback(
    (journal: JournalSummary) => {
      removeAddedJournal(specialtyId, journal.openAlexId);
      showToast(`"${journal.name}"을(를) 추가 목록에서 제거했습니다.`);
    },
    [specialtyId]
  );

  // 사용자 추가 저널의 ID — 자동 추천 영역에서 dedupe 용
  const addedIds = useMemo(
    () => new Set(added.map((j) => j.openAlexId)),
    [added]
  );

  // 시드/자동 추천 후보에서 (a) 차단된 것 제거 (b) 사용자 추가와 중복인 것 제거
  // → 상위 targetCount만 표시.
  // SSR(hydrated=false) 시점엔 차단/추가 정보가 없으니 후보 상위만.
  const recommendedJournals = hydrated
    ? journals
        .filter(
          (j) => !blocks.has(j.openAlexId) && !addedIds.has(j.openAlexId)
        )
        .slice(0, targetCount)
    : journals.slice(0, targetCount);

  const hiddenInCandidates = hydrated
    ? journals.reduce(
        (n, j) => n + (blocks.has(j.openAlexId) ? 1 : 0),
        0
      )
    : 0;

  // adder의 excludeIds — 이미 어딘가 보이는 저널 (사용자 추가 + 추천 + 차단)
  const excludeIds = useMemo(() => {
    const set = new Set<string>();
    for (const j of added) set.add(j.openAlexId);
    for (const j of recommendedJournals) set.add(j.openAlexId);
    for (const id of blocks) set.add(id);
    return set;
  }, [added, recommendedJournals, blocks]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {added.length > 0 ? `내 추가 ${added.length}개 + ` : ""}
          추천 {recommendedJournals.length}개
          {hiddenInCandidates > 0 ? ` · ${hiddenInCandidates}개 숨김` : ""}
        </p>
        <button
          type="button"
          onClick={() => setAdderOpen((v) => !v)}
          className="rounded-md border border-zinc-200 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          {adderOpen ? "닫기" : "+ 저널 추가"}
        </button>
      </div>

      {adderOpen ? (
        <div className="mb-4">
          <JournalSearchAdder
            onSelect={handleAdd}
            excludeIds={excludeIds}
            onClose={() => setAdderOpen(false)}
          />
        </div>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {added.map((j) => (
          <li key={`added-${j.openAlexId}`}>
            <JournalCard
              journal={j}
              href={
                j.issnL
                  ? `/journal/${encodeURIComponent(j.issnL)}?from=${encodeURIComponent(specialtyId)}`
                  : undefined
              }
              onRemoveByUser={() => handleRemoveAdded(j)}
              badge="내가 추가"
            />
          </li>
        ))}
        {recommendedJournals.map((j) => (
          <li key={`rec-${j.openAlexId}`}>
            <JournalCard
              journal={j}
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
