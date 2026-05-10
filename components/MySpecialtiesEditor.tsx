"use client";

// 설정 패널의 "내 임상과" 섹션.
// 카탈로그(data/journals.json)에서 가져온 임상과 pool에서 사용자가 선택,
// 순서 변경(위/아래), 삭제. localStorage 기반.

import { useEffect, useMemo, useState } from "react";
import localCatalog from "@/data/journals.json";
import type { JournalCatalog, Specialty } from "@/lib/journals";
import {
  addSpecialty,
  getMySpecialties,
  moveSpecialty,
  removeSpecialty,
  setMySpecialties,
  subscribeMySpecialties,
} from "@/lib/specialty-prefs";

const catalog = localCatalog as JournalCatalog;

export default function MySpecialtiesEditor() {
  const [selected, setSelected] = useState<string[] | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const apply = () => setSelected(getMySpecialties());
    apply();
    return subscribeMySpecialties(apply);
  }, []);

  const byId = useMemo(
    () => new Map(catalog.specialties.map((s) => [s.id, s])),
    []
  );

  // 사용자가 한 번도 안 건드린 상태(null) — 카탈로그 처음 3개를 default로 보여주되
  // "리셋"이라는 별도 동작 없이 그대로 추가/삭제하면 그때부터 사용자 선택으로 전환.
  const effectiveIds: string[] =
    selected && selected.length > 0
      ? selected
      : catalog.specialties.slice(0, 3).map((s) => s.id);
  const isUsingDefault = !selected || selected.length === 0;

  const visible: Specialty[] = effectiveIds
    .map((id) => byId.get(id))
    .filter((s): s is Specialty => Boolean(s));

  // "추가하기" 후보 — 아직 선택 안 한 임상과
  const candidates: Specialty[] = catalog.specialties.filter(
    (s) => !effectiveIds.includes(s.id)
  );

  function handleAdd(id: string) {
    if (isUsingDefault) {
      // default 상태에서 첫 추가 → 현재 보이는 default + 새 항목으로 사용자 선택 확정
      setMySpecialties([...effectiveIds, id]);
    } else {
      addSpecialty(id);
    }
  }

  function handleRemove(id: string) {
    if (isUsingDefault) {
      // default 상태에서 삭제 → 나머지 default를 사용자 선택으로 전환
      setMySpecialties(effectiveIds.filter((x) => x !== id));
    } else {
      removeSpecialty(id);
    }
  }

  function handleMove(from: number, to: number) {
    if (isUsingDefault) {
      // default 상태에서 순서 변경 → 사용자 선택으로 전환
      const next = [...effectiveIds];
      if (from < 0 || from >= next.length || to < 0 || to >= next.length)
        return;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setMySpecialties(next);
    } else {
      moveSpecialty(from, to);
    }
  }

  return (
    <div className="space-y-2">
      {isUsingDefault ? (
        <p className="rounded-lg border border-paperis-border bg-paperis-surface-2 px-2.5 py-1.5 text-[11px] text-paperis-text-3">
          기본 임상과(처음 {visible.length}개)를 보고 있습니다. 추가·삭제·순서
          변경하면 자동으로 내 선택이 됩니다.
        </p>
      ) : null}

      <ul className="space-y-1">
        {visible.map((s, i) => (
          <li
            key={s.id}
            className="flex items-center gap-1 rounded-lg border border-paperis-border bg-paperis-surface px-2 py-1.5"
          >
            <span className="font-mono text-[10px] tabular-nums text-paperis-text-3">
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-paperis-text">
                {s.name}
              </span>
              <span className="block truncate text-[11px] text-paperis-text-3">
                {s.nameEn}
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleMove(i, i - 1)}
              disabled={i === 0}
              aria-label="위로"
              title="위로"
              className="rounded p-1 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => handleMove(i, i + 1)}
              disabled={i === visible.length - 1}
              aria-label="아래로"
              title="아래로"
              className="rounded p-1 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-30"
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => handleRemove(s.id)}
              aria-label="삭제"
              title="삭제"
              className="rounded p-1 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {candidates.length > 0 ? (
        <div className="pt-1">
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="rounded-lg border border-paperis-border px-2.5 py-1 text-xs text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
          >
            {adding ? "닫기" : `+ 임상과 추가 (${candidates.length}개 가능)`}
          </button>
          {adding ? (
            <ul className="mt-2 max-h-60 space-y-1 overflow-auto">
              {candidates.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => handleAdd(s.id)}
                    className="flex w-full items-center gap-2 rounded-lg border border-paperis-border bg-paperis-surface px-2 py-1.5 text-left transition hover:border-paperis-text-3 hover:bg-paperis-surface-2"
                  >
                    <span className="text-xs text-paperis-accent">＋</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-paperis-text">
                        {s.name}
                      </span>
                      <span className="block truncate text-[11px] text-paperis-text-3">
                        {s.nameEn}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="pt-1 text-[11px] text-paperis-text-3">
          카탈로그의 모든 임상과({catalog.specialties.length}개)를 추가했습니다.
        </p>
      )}
    </div>
  );
}
