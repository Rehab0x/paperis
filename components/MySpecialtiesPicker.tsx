"use client";

// 홈 화면 — 사용자의 "내 임상과"를 칩 형태로 노출. 각 칩 → /journal/specialty/[id].
// 빈 상태(localStorage 미설정) → 카탈로그 처음 3개를 default로 보여줘 첫 진입자도
// 자연스럽게 임상과 단위 큐레이션을 탐색하게 함. /journal 페이지의 grid와 동일한
// 정책(MySpecialtiesGrid).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getMySpecialties,
  subscribeMySpecialties,
} from "@/lib/specialty-prefs";
import localCatalog from "@/data/journals.json";

interface SpecialtyMeta {
  id: string;
  name: string;
}

const ALL: SpecialtyMeta[] = (
  localCatalog as { specialties: SpecialtyMeta[] }
).specialties;
const DEFAULT_VISIBLE = 3;

export default function MySpecialtiesPicker() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    function load() {
      const stored = getMySpecialties();
      setIds(stored ?? null);
      setHydrated(true);
    }
    load();
    return subscribeMySpecialties(load);
  }, []);

  if (!hydrated) {
    return (
      <section className="mb-6">
        <div className="h-10 animate-pulse rounded-xl bg-paperis-surface-2" />
      </section>
    );
  }

  // 사용자가 한 번도 저장 안 했으면 카탈로그 처음 3개를 default로 (MySpecialtiesGrid와 동일 정책)
  const visibleIds = ids && ids.length > 0 ? ids : ALL.slice(0, DEFAULT_VISIBLE).map((s) => s.id);
  const isUsingDefault = !ids || ids.length === 0;

  const byId = new Map(ALL.map((s) => [s.id, s]));
  const visible = visibleIds
    .map((id) => byId.get(id))
    .filter((s): s is SpecialtyMeta => Boolean(s));

  if (visible.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-paperis-text-2">
          🩺 내 임상과
        </h2>
        <Link
          href="/journal"
          className="text-xs text-paperis-text-3 transition hover:text-paperis-text"
        >
          {isUsingDefault ? "선택 →" : "관리"}
        </Link>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto scroll-px-4 px-4 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visible.map((s) => (
          <Link
            key={s.id}
            href={`/journal/specialty/${encodeURIComponent(s.id)}`}
            className="inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border border-paperis-border bg-paperis-surface px-4 py-2 text-sm text-paperis-text transition hover:-translate-y-0.5 hover:border-paperis-text-3"
          >
            <span aria-hidden className="text-paperis-text-3">
              ›
            </span>
            <span>{s.name}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
