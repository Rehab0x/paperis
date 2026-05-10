"use client";

// 홈 첫 화면 — 사용자가 추가한 저널들을 가로 스크롤 carousel로.
//
// 데이터 출처: localStorage `paperis.journal_additions` (사용자가 직접 추가). 메타가
// 없는 favorites(seed 카탈로그 즐겨찾기)는 catalog server fetch가 필요해 일단 skip
// — MVP는 additions만. 사용자가 0개면 onboarding-style 안내 카드로 대체.
//
// "신규 호" 빨간 점 표시는 reading history가 필요해 후순위 (3순위에서 reading-history
// DB 추가 시 합류).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getAllAddedJournals,
  subscribeJournalAdditions,
} from "@/lib/journal-additions";
import type { JournalSummary } from "@/lib/openalex";

export default function MyJournalsNewIssues() {
  const [journals, setJournals] = useState<JournalSummary[] | null>(null);

  useEffect(() => {
    function load() {
      const adds = getAllAddedJournals();
      const map = new Map<string, JournalSummary>();
      for (const list of Object.values(adds)) {
        for (const j of list) {
          if (!map.has(j.openAlexId)) map.set(j.openAlexId, j);
        }
      }
      setJournals(Array.from(map.values()));
    }
    load();
    const unsub = subscribeJournalAdditions(load);
    return () => unsub();
  }, []);

  if (journals === null) {
    return (
      <section className="mb-6">
        <div className="h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
      </section>
    );
  }

  if (journals.length === 0) {
    return (
      <section className="mb-6 rounded-2xl border border-dashed border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-950">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          📚 관심 저널을 등록해보세요
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          임상과를 고르고 저널을 즐겨찾기하면, 새 호를 한눈에 볼 수 있습니다.
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
        {journals.map((j) => {
          const issn = j.issnL ?? j.issns[0] ?? null;
          if (!issn) return null;
          return (
            <Link
              key={j.openAlexId}
              href={`/journal/${encodeURIComponent(issn)}?tab=issue`}
              className="block w-44 shrink-0 snap-start rounded-2xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <div className="line-clamp-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {j.name}
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
