"use client";

// 저널 큐레이션 흐름의 공통 master-detail. 호 탐색·주제 탐색·트렌드가 같은 골격.
// 부모는 papers 전체(보통 100-200건)를 한 번에 전달. 이 컴포넌트가 자체적으로:
//   - Open Access 우선 정렬 (전체 결과 단위 — 진정한 "OA 위로")
//   - 페이지네이션 (page state + slice)
//   - 페이지 변경 시 자동 스크롤 top
//   - 미니 요약 자동 batch (옵션, 사용자 설정)
//   - 카드 선택 → PaperDetailPanel
// 페이지네이션은 결과 위·아래 양쪽에 표시 — 스크롤 왕복 안 해도 다음 페이지 가능.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import JournalPaginationView from "@/components/JournalPagination";
import PaperDetailPanel from "@/components/PaperDetailPanel";
import ResultsList from "@/components/ResultsList";
import { useAutoMiniSummary } from "@/components/useAutoMiniSummary";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import type {
  MiniSummary,
  Paper,
  SummarizeMiniRequest,
  SummarizeMiniResponse,
} from "@/types";

interface Props {
  papers: Paper[];
  loading: boolean;
  error?: string | null;
  /** 빈 결과일 때 사용자에게 보여줄 안내. 미지정 시 fallback 메시지 */
  emptyMessage?: React.ReactNode;
  /**
   * fetch 키. 새 검색이 일어났음을 알려줘야 미니요약 자동 batch가 다시 동작한다.
   * (예: `${issn}::${year}::${month}` 또는 `${issn}::${topic}`)
   */
  fetchKey: string;
  /** 한 페이지에 표시할 카드 수 — default 20 */
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 20;

export default function JournalPaperList({
  papers,
  loading,
  error,
  emptyMessage,
  fetchKey,
  pageSize = DEFAULT_PAGE_SIZE,
}: Props) {
  const [selectedPmid, setSelectedPmid] = useState<string | null>(null);
  const [miniSummaries, setMiniSummaries] = useState<Map<string, MiniSummary>>(
    () => new Map()
  );
  const [miniLoading, setMiniLoading] = useState<Set<string>>(() => new Set());
  const [oaFirst, setOaFirst] = useState(false);
  const [page, setPage] = useState(1);

  const fetchWithKeys = useFetchWithKeys();
  const autoMiniKeyRef = useRef<string>("");
  const autoMiniEnabled = useAutoMiniSummary();

  // fetchKey 또는 oaFirst 바뀌면 1페이지로 — 정렬 변경 시 첫 페이지 보는 게 자연스러움
  useEffect(() => {
    setPage(1);
  }, [fetchKey, oaFirst]);

  // fetchKey 바뀌면 선택·요약 캐시 리셋
  useEffect(() => {
    setSelectedPmid(null);
    setMiniSummaries(new Map());
    setMiniLoading(new Set());
    autoMiniKeyRef.current = "";
  }, [fetchKey]);

  // Open Access 우선 정렬 — 전체 papers 단위 (페이지 안에서만이 아니라).
  // 같은 access 안에서는 원래 순서 보존(stable sort).
  const sortedPapers = useMemo(() => {
    if (!oaFirst) return papers;
    return [...papers].sort((a, b) => {
      const aOpen = a.access === "open" ? 0 : 1;
      const bOpen = b.access === "open" ? 0 : 1;
      return aOpen - bOpen;
    });
  }, [papers, oaFirst]);

  const oaCount = useMemo(
    () => papers.reduce((n, p) => n + (p.access === "open" ? 1 : 0), 0),
    [papers]
  );

  // 페이지 슬라이스 — sorted 결과 중 현재 페이지만 표시
  const totalPages = Math.max(1, Math.ceil(sortedPapers.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const pagedPapers = useMemo(
    () => sortedPapers.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sortedPapers, safePage, pageSize]
  );
  const showFrom = sortedPapers.length > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const showTo =
    sortedPapers.length > 0
      ? (safePage - 1) * pageSize + pagedPapers.length
      : 0;

  const handlePageChange = useCallback((next: number) => {
    setPage(next);
    // 페이지 이동 시 자동으로 페이지 상단 — 스크롤 내려서 페이지네이션 누른 후
    // 다시 위로 안 가도 됨
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const requestMiniSummary = useCallback(
    async (targets: Paper[]) => {
      const remaining = targets.filter(
        (p) => !miniSummaries.has(p.pmid) && !miniLoading.has(p.pmid)
      );
      if (remaining.length === 0) return;

      setMiniLoading((prev) => {
        const next = new Set(prev);
        for (const p of remaining) next.add(p.pmid);
        return next;
      });

      try {
        const body: SummarizeMiniRequest = { papers: remaining };
        const res = await fetchWithKeys("/api/summarize", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const rawText = await res.text();
        let json: SummarizeMiniResponse | { error?: string } | null = null;
        try {
          json = JSON.parse(rawText);
        } catch {
          // ignore
        }
        if (res.ok && json && "summaries" in json) {
          setMiniSummaries((prev) => {
            const next = new Map(prev);
            for (const s of json.summaries) next.set(s.pmid, s);
            return next;
          });
        } else {
          console.warn(
            "[journal-list] mini summary 실패",
            res.status,
            json && "error" in json ? json.error : rawText.slice(0, 200)
          );
        }
      } catch (err) {
        console.warn("[journal-list] mini summary 네트워크 오류", err);
      } finally {
        setMiniLoading((prev) => {
          const next = new Set(prev);
          for (const p of remaining) next.delete(p.pmid);
          return next;
        });
      }
    },
    [miniSummaries, miniLoading, fetchWithKeys]
  );

  // 결과 도착 후 *현재 페이지의* 상위 3건 미니 요약 자동 batch.
  // default OFF — 설정에서 사용자가 켜야 동작.
  useEffect(() => {
    if (!autoMiniEnabled) return;
    if (loading || pagedPapers.length === 0) return;
    const autoKey = `${fetchKey}::p${safePage}`;
    if (autoMiniKeyRef.current === autoKey) return;
    autoMiniKeyRef.current = autoKey;
    void requestMiniSummary(pagedPapers.slice(0, 3));
  }, [
    autoMiniEnabled,
    loading,
    pagedPapers,
    fetchKey,
    safePage,
    requestMiniSummary,
  ]);

  const handleSelect = useCallback((pmid: string) => {
    setSelectedPmid((prev) => (prev === pmid ? null : pmid));
  }, []);

  const handleLoadMini = useCallback(
    (pmid: string) => {
      const target = papers.find((p) => p.pmid === pmid);
      if (!target) return;
      void requestMiniSummary([target]);
    },
    [papers, requestMiniSummary]
  );

  const selectedPaper: Paper | null =
    selectedPmid != null
      ? papers.find((p) => p.pmid === selectedPmid) ?? null
      : null;

  // 페이지네이션 노드 — header/footer 양쪽 동일 컴포넌트
  const paginationNode =
    !loading && totalPages > 1 ? (
      <JournalPaginationView
        page={safePage}
        totalPages={totalPages}
        pageSize={pageSize}
        onChange={handlePageChange}
      />
    ) : null;

  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row">
      <div
        className={[
          "min-w-0 flex-1",
          selectedPaper ? "hidden lg:block" : "block",
        ].join(" ")}
      >
        {papers.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-zinc-500">
              총 {sortedPapers.length.toLocaleString()}건 중 {showFrom}–{showTo}건
              표시
            </p>
            <button
              type="button"
              onClick={() => setOaFirst((v) => !v)}
              aria-pressed={oaFirst}
              className={[
                "rounded-full border px-3 py-1 text-xs transition",
                oaFirst
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600",
              ].join(" ")}
              title="Open Access 논문을 전체 결과 상위로 정렬"
            >
              {oaFirst ? "✓ " : ""}📖 Open Access 우선{" "}
              <span className="text-zinc-400">
                ({oaCount}/{papers.length})
              </span>
            </button>
          </div>
        ) : null}

        {/* 페이지네이션 — 결과 위 (스크롤 왕복 안 해도 다음 페이지) */}
        {paginationNode ? <div className="mb-3">{paginationNode}</div> : null}

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {!loading && papers.length === 0 && !error
          ? emptyMessage ?? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
                결과가 없습니다.
              </div>
            )
          : null}

        <ResultsList
          papers={pagedPapers}
          loading={loading}
          selectedPmid={selectedPmid}
          miniSummaries={miniSummaries}
          miniLoading={miniLoading}
          onSelect={handleSelect}
          onLoadMini={handleLoadMini}
        />

        {/* 페이지네이션 — 결과 아래 */}
        {paginationNode}
      </div>

      <aside
        className={[
          "shrink-0 lg:block lg:w-[420px]",
          selectedPaper ? "block w-full" : "hidden",
        ].join(" ")}
      >
        {selectedPaper ? (
          <PaperDetailPanel
            key={selectedPaper.pmid}
            paper={selectedPaper}
            onBack={() => setSelectedPmid(null)}
          />
        ) : (
          <div className="sticky top-32 hidden rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 lg:block">
            왼쪽 카드를 클릭하면 풀텍스트·요약·TTS가 여기에 표시됩니다.
          </div>
        )}
      </aside>
    </div>
  );
}
