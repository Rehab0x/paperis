"use client";

// 설정 패널의 "차단된 저널" 섹션.
// PR4-2에서 임상과별로 ✕ "이 임상과에서 숨기기"로 차단한 저널들을 임상과별로
// 그룹지어 표시하고, 개별 복구(unblock) 버튼 제공.
//
// 저널 메타(이름 등)는 차단 시점 데이터를 저장하지 않았으므로 OpenAlex ID만 표시.
// 미래에 "이름까지 함께 저장" 또는 OpenAlex로 즉시 lookup하는 방식 검토 가능.

import { useEffect, useMemo, useState } from "react";
import localCatalog from "@/data/journals.json";
import type { JournalCatalog } from "@/lib/journals";
import {
  getAllJournalBlocks,
  subscribeJournalBlocks,
  unblockJournal,
} from "@/lib/journal-blocks";

const catalog = localCatalog as JournalCatalog;

export default function JournalBlocksManager() {
  const [blocks, setBlocks] = useState<Record<string, string[]>>({});

  useEffect(() => {
    const apply = () => setBlocks(getAllJournalBlocks());
    apply();
    return subscribeJournalBlocks(apply);
  }, []);

  const specialtyById = useMemo(
    () => new Map(catalog.specialties.map((s) => [s.id, s])),
    []
  );

  const groups = Object.entries(blocks).filter(
    ([, list]) => Array.isArray(list) && list.length > 0
  );

  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        차단된 저널이 없습니다. 임상과 페이지에서 카드 우상단 ✕로 숨길 수
        있습니다.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([specialtyId, journalIds]) => {
        const specialty = specialtyById.get(specialtyId);
        const label = specialty ? specialty.name : `임상과 (${specialtyId})`;
        return (
          <section key={specialtyId}>
            <h4 className="mb-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {label}{" "}
              <span className="font-normal text-zinc-400">
                · {journalIds.length}개
              </span>
            </h4>
            <ul className="space-y-1">
              {journalIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-zinc-500">
                    {id}
                  </span>
                  <button
                    type="button"
                    onClick={() => unblockJournal(specialtyId, id)}
                    className="rounded-md border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    복구
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
