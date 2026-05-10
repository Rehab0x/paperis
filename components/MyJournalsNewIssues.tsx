"use client";

// 홈 첫 화면 — 사용자의 "내 저널" 가로 스크롤 carousel.
//
// 데이터 소스 (union, openAlexId로 dedupe, favorite 우선 → added 다음):
//   1. journal_favorites (specialty → openAlexId[]). 메타가 없어 journal_meta_cache
//      에서 복원. SpecialtyJournalsList가 본 적 있는 저널은 메타가 캐시됨.
//   2. journal_additions (specialty → JournalSummary[]). 메타가 그대로 저장됨.
//
// 둘 다 0개면 onboarding-style 등록 유도 카드.
// favorite이 있는데 메타 캐시에 없는 경우(아직 /journal에 진입한 적 없는 사용자):
// 그 항목은 표시 안 함 — 다음 번 임상과 진입 시 메타가 채워지면 자동 노출.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getAllAddedJournals,
  subscribeJournalAdditions,
} from "@/lib/journal-additions";
import {
  getAllJournalFavorites,
  subscribeJournalFavorites,
} from "@/lib/journal-favorites";
import { getJournalMetas } from "@/lib/journal-meta-cache";
import type { JournalSummary } from "@/lib/openalex";

interface DisplayItem {
  meta: JournalSummary;
  isFavorite: boolean;
}

export default function MyJournalsNewIssues() {
  const [items, setItems] = useState<DisplayItem[] | null>(null);

  useEffect(() => {
    function load() {
      // 1. favorites — openAlexId 모음 (specialty 무관하게 union)
      const favsBySpecialty = getAllJournalFavorites();
      const favIds = new Set<string>();
      for (const ids of Object.values(favsBySpecialty)) {
        for (const id of ids) favIds.add(id);
      }
      // 메타 복원
      const favoriteMetas = getJournalMetas(Array.from(favIds));

      // 2. additions — 메타 그대로 (union)
      const addsBySpecialty = getAllAddedJournals();
      const addedMap = new Map<string, JournalSummary>();
      for (const list of Object.values(addsBySpecialty)) {
        for (const j of list) {
          if (!addedMap.has(j.openAlexId)) addedMap.set(j.openAlexId, j);
        }
      }

      // 3. union — favorite을 위로
      const seen = new Set<string>();
      const out: DisplayItem[] = [];
      for (const j of favoriteMetas) {
        if (seen.has(j.openAlexId)) continue;
        seen.add(j.openAlexId);
        out.push({ meta: j, isFavorite: true });
      }
      for (const [id, j] of addedMap) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ meta: j, isFavorite: false });
      }
      setItems(out);
    }
    load();
    const u1 = subscribeJournalAdditions(load);
    const u2 = subscribeJournalFavorites(load);
    return () => {
      u1();
      u2();
    };
  }, []);

  if (items === null) {
    return (
      <section className="mb-6">
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          📚 관심 저널을 등록해보세요
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          임상과를 고르고 저널을 즐겨찾기(⭐)하면, 새 호를 한눈에 볼 수 있습니다.
        </p>
        <Link
          href="/journal"
          className="mt-3 inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          저널 등록하기 →
        </Link>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-zinc-700 dark:text-zinc-300">
          📬 내 저널
        </h2>
        <Link
          href="/journal"
          className="text-[11px] text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          전체 →
        </Link>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map(({ meta: j, isFavorite }) => {
          const issn = j.issnL ?? j.issns[0] ?? null;
          if (!issn) return null;
          return (
            <Link
              key={j.openAlexId}
              href={`/journal/${encodeURIComponent(issn)}?tab=issue`}
              className="block w-44 shrink-0 snap-start rounded-2xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <div className="flex items-start gap-1.5">
                {isFavorite ? (
                  <span aria-hidden className="text-amber-500">
                    ⭐
                  </span>
                ) : null}
                <div className="line-clamp-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {j.name}
                </div>
              </div>
              <div className="mt-2 truncate font-mono text-[10px] text-zinc-500">
                {issn}
              </div>
              {j.publisher ? (
                <div className="mt-0.5 truncate text-[10px] text-zinc-500">
                  {j.publisher}
                </div>
              ) : null}
              <div className="mt-3 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                최신 호 보기 →
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
