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
        <div className="h-44 animate-pulse rounded-2xl bg-paperis-surface-2" />
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-6">
        <h2 className="font-serif text-base font-medium text-paperis-text">
          📚 관심 저널을 등록해보세요
        </h2>
        <p className="mt-1.5 text-xs text-paperis-text-2">
          임상과를 고르고 저널을 즐겨찾기(⭐)하면, 새 호를 한눈에 볼 수 있습니다.
        </p>
        <Link
          href="/journal"
          className="mt-3 inline-flex h-9 items-center rounded-lg bg-paperis-accent px-3 text-xs font-medium text-paperis-bg transition hover:opacity-90"
        >
          저널 등록하기 →
        </Link>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-paperis-text-2">
          📬 내 저널
        </h2>
        <Link
          href="/journal"
          className="text-xs text-paperis-text-3 transition hover:text-paperis-text"
        >
          전체 보기
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
              className="relative flex h-44 w-36 shrink-0 snap-start flex-col justify-between rounded-2xl border border-paperis-border bg-paperis-surface p-4 transition hover:-translate-y-0.5 hover:border-paperis-text-3"
            >
              {isFavorite ? (
                <span
                  aria-hidden
                  className="absolute right-3 top-3 h-2 w-2 rounded-full bg-paperis-accent shadow-[0_0_0_4px_rgb(255_91_58/0.18)]"
                />
              ) : null}
              <div className="line-clamp-3 font-serif text-base font-medium leading-tight tracking-tight text-paperis-text">
                {j.name}
              </div>
              <div>
                <div className="font-mono text-[11px] tabular-nums text-paperis-text-2">
                  {issn}
                </div>
                {j.publisher ? (
                  <div className="mt-0.5 truncate text-[11px] text-paperis-text-3">
                    {j.publisher}
                  </div>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
