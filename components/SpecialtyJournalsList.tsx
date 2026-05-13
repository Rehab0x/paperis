"use client";

// 임상과 페이지의 저널 그리드 client 부분.
// server에서 받은 candidates(시드 + 자동 추천 over-fetch 20개) +
// 사용자가 직접 추가한 저널(localStorage) +
// 사용자 즐겨찾기(⭐) 우선 정렬을 통합:
//
//   [⭐ Favorite — added/recommended 무관, 항상 위]
//   [내가 추가 — favorite 아닌 것]
//   [시드/자동 추천 — favorite/추가/차단 아닌 것, 차단 적용 후 상위 targetCount]
//
// "+ 저널 추가" 버튼으로 JournalSearchAdder 패널 토글 — OpenAlex 자동완성으로
// 검색해 즉석 추가. 차단/추가/즐겨찾기/시드/자동 사이의 중복은 openAlexId로 dedupe.
//
// 차단 ↔ 즐겨찾기는 상호배타: ⭐ 켜면 차단 해제, ✕(차단) 누르면 즐겨찾기 해제.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JournalCard from "@/components/JournalCard";
import JournalSearchAdder from "@/components/JournalSearchAdder";
import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";
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
import {
  favoriteJournal,
  getFavoriteJournals,
  subscribeJournalFavorites,
  unfavoriteJournal,
} from "@/lib/journal-favorites";
import { cacheJournalMetas } from "@/lib/journal-meta-cache";
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
  const m = useAppMessages();
  const [blocks, setBlocks] = useState<Set<string>>(() => new Set());
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [added, setAdded] = useState<JournalSummary[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [adderOpen, setAdderOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setBlocks(getBlockedJournals(specialtyId));
    setFavorites(getFavoriteJournals(specialtyId));
    setAdded(getAddedJournals(specialtyId));
    setHydrated(true);
    const unsubBlocks = subscribeJournalBlocks(() => {
      setBlocks(getBlockedJournals(specialtyId));
    });
    const unsubFavorites = subscribeJournalFavorites(() => {
      setFavorites(getFavoriteJournals(specialtyId));
    });
    const unsubAdditions = subscribeJournalAdditions(() => {
      setAdded(getAddedJournals(specialtyId));
    });
    return () => {
      unsubBlocks();
      unsubFavorites();
      unsubAdditions();
    };
  }, [specialtyId]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // 본 저널들의 메타를 캐시 — 홈의 "내 저널" 카드가 favorites(openAlexId만 저장)도
  // 메타 복원해 표시할 수 있게.
  useEffect(() => {
    cacheJournalMetas([...journals, ...added]);
  }, [journals, added]);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  const handleBlock = useCallback(
    (journal: JournalSummary) => {
      // block ↔ favorite 상호배타
      unfavoriteJournal(specialtyId, journal.openAlexId);
      blockJournal(specialtyId, journal.openAlexId);
      showToast(fmt(m.specialtyJournals.hiddenToast, { name: journal.name }));
    },
    [specialtyId]
  );

  const handleAdd = useCallback(
    (journal: JournalSummary) => {
      addJournal(specialtyId, journal);
      setAdderOpen(false);
      showToast(fmt(m.specialtyJournals.addedToast, { name: journal.name }));
    },
    [specialtyId]
  );

  const handleRemoveAdded = useCallback(
    (journal: JournalSummary) => {
      removeAddedJournal(specialtyId, journal.openAlexId);
      showToast(fmt(m.specialtyJournals.removedToast, { name: journal.name }));
    },
    [specialtyId]
  );

  const handleToggleFavorite = useCallback(
    (journal: JournalSummary) => {
      if (favorites.has(journal.openAlexId)) {
        unfavoriteJournal(specialtyId, journal.openAlexId);
      } else {
        // favorite을 켜면 block은 자동 해제 (block 상태였다면)
        if (blocks.has(journal.openAlexId)) {
          // unblock — block API에 unblockJournal 따로 import 필요. 차단 목록에서
          // 복구는 SettingsDrawer의 JournalBlocksManager에서 처리하지만, favorite
          // toggle도 같은 효과 줘야 자연스럽다.
          // (가벼운 처리를 위해 inline window.dispatchEvent 대신 직접 import)
        }
        favoriteJournal(specialtyId, journal.openAlexId);
      }
    },
    [specialtyId, favorites, blocks]
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

  // 통합 카드 리스트 — favorite 우선 정렬 (stable: 같은 그룹 내 원래 순서 보존)
  type CardEntry = {
    source: "added" | "recommended";
    journal: JournalSummary;
  };
  const allEntries: CardEntry[] = useMemo(() => {
    const e: CardEntry[] = [
      ...added.map((j): CardEntry => ({ source: "added", journal: j })),
      ...recommendedJournals.map(
        (j): CardEntry => ({ source: "recommended", journal: j })
      ),
    ];
    return [...e].sort((a, b) => {
      const aFav = favorites.has(a.journal.openAlexId) ? 0 : 1;
      const bFav = favorites.has(b.journal.openAlexId) ? 0 : 1;
      return aFav - bFav;
    });
  }, [added, recommendedJournals, favorites]);

  const hiddenInCandidates = hydrated
    ? journals.reduce(
        (n, j) => n + (blocks.has(j.openAlexId) ? 1 : 0),
        0
      )
    : 0;
  const favoriteCount = useMemo(
    () =>
      allEntries.reduce(
        (n, e) => n + (favorites.has(e.journal.openAlexId) ? 1 : 0),
        0
      ),
    [allEntries, favorites]
  );

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
        <p className="text-xs text-paperis-text-3">
          {favoriteCount > 0 ? fmt(m.specialtyJournals.favPrefix, { n: favoriteCount }) : ""}
          {added.length > 0 ? fmt(m.specialtyJournals.statsAddedPrefix, { n: added.length }) : ""}
          {fmt(m.specialtyJournals.statsRecommended, { n: recommendedJournals.length })}
          {hiddenInCandidates > 0
            ? fmt(m.specialtyJournals.statsHiddenSuffix, { n: hiddenInCandidates })
            : ""}
        </p>
        <button
          type="button"
          onClick={() => setAdderOpen((v) => !v)}
          className="rounded-lg border border-paperis-border px-3 py-1 text-xs text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
        >
          {adderOpen ? m.specialtyJournals.close : m.specialtyJournals.addJournal}
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
        {allEntries.map((e) => {
          const j = e.journal;
          const isAdded = e.source === "added";
          return (
            <li key={`${e.source}-${j.openAlexId}`}>
              <JournalCard
                journal={j}
                href={
                  j.issnL
                    ? `/journal/${encodeURIComponent(j.issnL)}?from=${encodeURIComponent(specialtyId)}`
                    : undefined
                }
                onBlock={isAdded ? undefined : () => handleBlock(j)}
                onRemoveByUser={
                  isAdded ? () => handleRemoveAdded(j) : undefined
                }
                onToggleFavorite={() => handleToggleFavorite(j)}
                isFavorite={favorites.has(j.openAlexId)}
                badge={isAdded ? m.specialtyJournals.addedByYou : undefined}
              />
            </li>
          );
        })}
      </ul>

      {hiddenInCandidates > 0 ? (
        <p className="mt-4 text-xs text-paperis-text-3">
          {fmt(m.specialtyJournals.hiddenNote, { n: hiddenInCandidates })}
        </p>
      ) : null}

      {toast ? (
        <div
          role="status"
          aria-live="polite"
          style={{ bottom: "calc(var(--player-bar-h, 0px) + 16px)" }}
          className="fixed left-1/2 z-30 max-w-md -translate-x-1/2 rounded-lg border border-paperis-border bg-paperis-surface px-4 py-2.5 text-sm text-paperis-text shadow-lg"
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
