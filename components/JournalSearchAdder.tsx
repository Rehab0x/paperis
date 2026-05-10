"use client";

// 임상과 페이지의 "+ 저널 추가" 패널.
// /api/journal/search 자동완성 — 사용자가 저널 이름 일부 입력하면 250ms debounce
// 후 OpenAlex 검색 → 결과 목록에서 클릭으로 추가.

import { useEffect, useRef, useState } from "react";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import type { JournalSummary } from "@/lib/openalex";

interface Props {
  /** 추가 클릭 시 호출 — 부모가 localStorage 저장 + toast */
  onSelect: (journal: JournalSummary) => void;
  /** 이미 보이는 저널들의 openAlexId set (시드/자동/사용자추가 포함) — 중복 방지 */
  excludeIds: Set<string>;
  onClose: () => void;
}

interface SearchResponse {
  journals: JournalSummary[];
}

export default function JournalSearchAdder({
  onSelect,
  excludeIds,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JournalSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWithKeys = useFetchWithKeys();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // 패널 열릴 때 input 자동 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // query 변경 시 250ms debounce 후 fetch
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setError(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSearch(trimmed);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  async function doSearch(q: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q, perPage: "10" });
      const res = await fetchWithKeys(`/api/journal/search?${params}`);
      const rawText = await res.text();
      let json: SearchResponse | { error?: string } | null = null;
      try {
        json = JSON.parse(rawText);
      } catch {
        // ignore
      }
      if (!res.ok || !json || !("journals" in json)) {
        const msg =
          json && "error" in json && json.error
            ? json.error
            : `검색 실패 (${res.status})`;
        setError(msg);
        setResults([]);
        return;
      }
      setResults(json.journals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "검색 실패");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-paperis-border bg-paperis-surface p-4">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="저널 이름으로 검색 — 예: 'Lancet', 'Stroke'"
          className="min-w-0 flex-1 rounded-lg border border-paperis-border bg-paperis-surface px-3 py-2 text-sm text-paperis-text placeholder:text-paperis-text-3"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
          aria-label="닫기 (ESC)"
        >
          닫기
        </button>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-xs text-paperis-accent">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-3 text-xs text-paperis-text-3">검색 중…</p>
      ) : null}

      {!loading && query.trim() && results.length === 0 && !error ? (
        <p className="mt-3 text-xs text-paperis-text-3">
          매칭되는 저널이 없습니다. 영어 표기로 시도해 보세요.
        </p>
      ) : null}

      {results.length > 0 ? (
        <ul className="mt-3 max-h-80 space-y-1 overflow-auto">
          {results.map((j) => {
            const already = excludeIds.has(j.openAlexId);
            return (
              <li key={j.openAlexId}>
                <button
                  type="button"
                  onClick={() => {
                    if (already) return;
                    onSelect(j);
                  }}
                  disabled={already}
                  className={[
                    "flex w-full items-center gap-2 rounded-lg border border-paperis-border bg-paperis-surface px-3 py-2 text-left transition",
                    already
                      ? "cursor-not-allowed opacity-50"
                      : "hover:border-paperis-text-3 hover:bg-paperis-surface-2",
                  ].join(" ")}
                >
                  <span className="text-xs text-paperis-accent">＋</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-serif text-sm font-medium text-paperis-text">
                      {j.name}
                    </span>
                    <span className="block truncate text-[11px] text-paperis-text-3">
                      {[
                        j.publisher,
                        j.issnL ? `ISSN-L ${j.issnL}` : null,
                        typeof j.twoYearMeanCitedness === "number"
                          ? `2yr ${j.twoYearMeanCitedness.toFixed(2)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {already ? (
                    <span className="shrink-0 text-[10px] text-paperis-text-3">
                      이미 있음
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!query.trim() ? (
        <p className="mt-3 text-[11px] text-paperis-text-3">
          OpenAlex 카탈로그에서 검색 — 영문 저널명이 가장 정확합니다.
        </p>
      ) : null}
    </div>
  );
}
