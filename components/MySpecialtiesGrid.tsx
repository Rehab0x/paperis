"use client";

// /journal 페이지의 클라이언트 그리드.
// server에서 받은 카탈로그를 그대로 두고, localStorage의 사용자 선택만 visible.
// 선택이 비어 있으면 카탈로그 처음 3개를 default로 노출.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAppMessages } from "@/components/useAppMessages";
import { useLocale } from "@/components/useLocale";
import {
  getMySpecialties,
  reconcileWithCatalog,
  subscribeMySpecialties,
} from "@/lib/specialty-prefs";
import type { JournalCatalog, Specialty } from "@/lib/journals";

interface Props {
  catalog: JournalCatalog;
}

const DEFAULT_VISIBLE_COUNT = 3;

export default function MySpecialtiesGrid({ catalog }: Props) {
  const m = useAppMessages();
  const locale = useLocale();
  const allIds = catalog.specialties.map((s) => s.id);
  const defaultIds = allIds.slice(0, DEFAULT_VISIBLE_COUNT);
  const byId = new Map(catalog.specialties.map((s) => [s.id, s]));

  const [selectedIds, setSelectedIds] = useState<string[]>(defaultIds);
  const [usingDefault, setUsingDefault] = useState(true);

  useEffect(() => {
    // 카탈로그에서 제거된 id가 있으면 정리
    reconcileWithCatalog(allIds);
    const apply = () => {
      const stored = getMySpecialties();
      if (stored && stored.length > 0) {
        setSelectedIds(stored);
        setUsingDefault(false);
      } else {
        setSelectedIds(defaultIds);
        setUsingDefault(true);
      }
    };
    apply();
    return subscribeMySpecialties(apply);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog]);

  const visible: Specialty[] = selectedIds
    .map((id) => byId.get(id))
    .filter((s): s is Specialty => Boolean(s));

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => (
          <li key={s.id}>
            <Link
              href={`/journal/specialty/${s.id}`}
              className="block h-full rounded-2xl border border-paperis-border bg-paperis-surface p-5 transition hover:-translate-y-0.5 hover:border-paperis-text-3"
            >
              <h2 className="font-serif text-lg font-medium tracking-tight text-paperis-text">
                {locale === "en" ? s.nameEn : s.name}
              </h2>
              {locale === "en" ? null : (
                <p className="mt-0.5 text-xs text-paperis-text-3">{s.nameEn}</p>
              )}
              {s.suggestedTopics.length > 0 ? (
                <p className="mt-3 text-xs leading-relaxed text-paperis-text-3">
                  {m.specialtyManage.suggestedTopics} ·{" "}
                  {s.suggestedTopics.slice(0, 3).join(" / ")}
                  {s.suggestedTopics.length > 3 ? " …" : ""}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-[11px] text-paperis-text-3">
        {usingDefault
          ? m.specialtyManage.gridDefaultHint
          : m.specialtyManage.gridCustomHint}
      </p>
    </>
  );
}
