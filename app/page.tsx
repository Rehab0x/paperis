"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthMenu from "@/components/AuthMenu";
import JournalEntryLink from "@/components/JournalEntryLink";
import { useAutoMiniSummary } from "@/components/useAutoMiniSummary";
import LibraryLink from "@/components/LibraryLink";
import PaperDetailPanel from "@/components/PaperDetailPanel";
import ResultsList from "@/components/ResultsList";
import SearchBar from "@/components/SearchBar";
import SettingsLink from "@/components/SettingsLink";
import SortControl from "@/components/SortControl";
import TtsQueueBadge from "@/components/TtsQueueBadge";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { getTrackByPmid } from "@/lib/audio-library";
import {
  getClientCachedQuery,
  setClientCachedQuery,
} from "@/lib/client-cache";
import type {
  MiniSummary,
  Paper,
  SearchRequest,
  SearchResponse,
  SortMode,
  SummarizeMiniRequest,
  SummarizeMiniResponse,
} from "@/types";

const VALID_SORTS: SortMode[] = ["relevance", "recency", "citations"];

function parseSort(value: string | null): SortMode {
  if (value && (VALID_SORTS as string[]).includes(value)) {
    return value as SortMode;
  }
  return "relevance";
}

const PAGE_SIZE = 20;

function parsePage(value: string | null): number {
  const n = value ? Number(value) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";
  const sort = parseSort(searchParams.get("sort"));
  const page = parsePage(searchParams.get("page"));
  const selectedPmid = searchParams.get("pmid");

  const [papers, setPapers] = useState<Paper[]>([]);
  const [translated, setTranslated] = useState<{
    query: string;
    note: string;
  } | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQueryDetail, setShowQueryDetail] = useState(false);

  const [miniSummaries, setMiniSummaries] = useState<Map<string, MiniSummary>>(
    () => new Map()
  );
  const [miniLoading, setMiniLoading] = useState<Set<string>>(() => new Set());

  // 라이브러리에서 트랙 → 📄 논문 클릭으로 들어왔을 때 papers에 없는 pmid를
  // IndexedDB의 paperSnapshot으로 복원해 디테일 패널을 띄운다.
  const [librarySnapshot, setLibrarySnapshot] = useState<Paper | null>(null);

  const fetchWithKeys = useFetchWithKeys();
  const autoMiniEnabled = useAutoMiniSummary();

  // 같은 (q, sort) 조합을 중복 호출하지 않도록 마지막 키를 기억
  const lastFetchedRef = useRef<string>("");
  // 자동으로 미니 요약을 시도한 검색 키(중복 자동요청 방지)
  const autoMiniKeyRef = useRef<string>("");

  const updateUrl = useCallback(
    (next: {
      q?: string;
      sort?: SortMode;
      pmid?: string | null;
      page?: number | null;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.q !== undefined) {
        if (next.q) params.set("q", next.q);
        else params.delete("q");
      }
      if (next.sort !== undefined) params.set("sort", next.sort);
      if (next.pmid !== undefined) {
        if (next.pmid) params.set("pmid", next.pmid);
        else params.delete("pmid");
      }
      if (next.page !== undefined) {
        if (next.page && next.page > 1) params.set("page", String(next.page));
        else params.delete("page");
      }
      router.push(`/?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSearchSubmit = useCallback(
    (value: string) => {
      // 새 검색을 시작하면 기존 선택과 페이지는 리셋
      updateUrl({ q: value, sort, pmid: null, page: 1 });
    },
    [updateUrl, sort]
  );

  const handleSortChange = useCallback(
    (next: SortMode) => {
      if (next === sort) return;
      // 정렬 바뀌면 첫 페이지부터
      updateUrl({ sort: next, page: 1, pmid: null });
    },
    [updateUrl, sort]
  );

  const handlePageChange = useCallback(
    (next: number) => {
      if (next < 1) return;
      // 페이지 이동 시 카드 선택은 풀어줌 (해당 pmid가 새 페이지에 없을 수 있음)
      updateUrl({ page: next, pmid: null });
    },
    [updateUrl]
  );

  const handleSelect = useCallback(
    (pmid: string) => {
      updateUrl({ pmid: pmid === selectedPmid ? null : pmid });
    },
    [updateUrl, selectedPmid]
  );

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
        } catch (parseErr) {
          console.warn(
            "[paperis] mini summary 응답 JSON parse 실패",
            res.status,
            rawText.slice(0, 200),
            parseErr
          );
        }
        if (res.ok && json && "summaries" in json) {
          setMiniSummaries((prev) => {
            const next = new Map(prev);
            for (const s of json.summaries) next.set(s.pmid, s);
            return next;
          });
        } else {
          console.warn(
            "[paperis] mini summary 실패",
            res.status,
            json && "error" in json ? json.error : rawText.slice(0, 200)
          );
        }
      } catch (err) {
        console.warn("[paperis] mini summary 네트워크 오류", err);
      } finally {
        setMiniLoading((prev) => {
          const next = new Set(prev);
          for (const p of remaining) next.delete(p.pmid);
          return next;
        });
      }
    },
    [miniSummaries, miniLoading]
  );

  const handleLoadMini = useCallback(
    (pmid: string) => {
      const target = papers.find((p) => p.pmid === pmid);
      if (!target) return;
      void requestMiniSummary([target]);
    },
    [papers, requestMiniSummary]
  );

  // q + sort + page 변화에 따라 /api/search 호출
  useEffect(() => {
    const trimmed = q.trim();
    const fetchKey = `${trimmed}::${sort}::${page}`;
    if (!trimmed) {
      setPapers([]);
      setTranslated(null);
      setTotal(0);
      setError(null);
      setMiniSummaries(new Map());
      setMiniLoading(new Set());
      lastFetchedRef.current = "";
      autoMiniKeyRef.current = "";
      return;
    }
    if (lastFetchedRef.current === fetchKey) return;
    lastFetchedRef.current = fetchKey;
    // 새 검색 또는 새 페이지 → 이전 미니 요약 비움
    setMiniSummaries(new Map());
    setMiniLoading(new Set());
    autoMiniKeyRef.current = "";

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const body: SearchRequest = {
          q: trimmed,
          sort,
          retmax: PAGE_SIZE,
          retstart: (page - 1) * PAGE_SIZE,
        };
        const res = await fetchWithKeys("/api/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (cancelled) return;
        // 응답 본문은 한 번만 소비 가능. 먼저 텍스트로 받아 안전하게 처리한 뒤
        // 별도로 JSON.parse 시도 — 502/500의 본문이 JSON이 아닌 경우(예: HTML
        // 에러 페이지, 또는 raw 텍스트)에도 사용자에게 진짜 메시지를 보여준다.
        const rawText = await res.text();
        let json: SearchResponse | { error?: string } | null = null;
        try {
          json = JSON.parse(rawText);
        } catch {
          // JSON 파싱 실패 — rawText로 fallback
        }
        if (!res.ok || !json || !("papers" in json)) {
          const msg =
            json && "error" in json && json.error
              ? json.error
              : rawText
                ? `검색 실패 (${res.status}): ${rawText.slice(0, 240)}`
                : `검색 실패 (${res.status})`;
          setError(msg);
          setPapers([]);
          setTranslated(null);
          setTotal(0);
          return;
        }
        setPapers(json.papers);
        setTranslated({ query: json.query, note: json.note });
        setTotal(json.total);
        setClientCachedQuery(trimmed, json.query, json.note);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "검색 실패");
        setPapers([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [q, sort, page]);

  // 입력 중 캐시된 변환식이 있으면 미리 보여준다 (선택, 시각적 힌트만)
  useEffect(() => {
    if (!q.trim()) {
      setTranslated(null);
      return;
    }
    if (translated) return;
    const cached = getClientCachedQuery(q);
    if (cached) setTranslated(cached);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // 결과가 도착하면 상위 3개 미니 요약을 자동으로 batch 호출 (검색 키당 1회).
  // default OFF — 사용자가 설정에서 토글 on해야 동작 (Gemini quota + layout shift 절약).
  useEffect(() => {
    if (!autoMiniEnabled) return;
    if (loading || papers.length === 0) return;
    const fetchKey = lastFetchedRef.current;
    if (!fetchKey || autoMiniKeyRef.current === fetchKey) return;
    autoMiniKeyRef.current = fetchKey;
    void requestMiniSummary(papers.slice(0, 3));
  }, [autoMiniEnabled, loading, papers, requestMiniSummary]);

  // selectedPmid가 papers에 없는데 라이브러리에는 있을 수 있다 (트랙 → 📄)
  useEffect(() => {
    if (!selectedPmid) {
      setLibrarySnapshot(null);
      return;
    }
    if (papers.find((p) => p.pmid === selectedPmid)) {
      setLibrarySnapshot(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const t = await getTrackByPmid(selectedPmid);
        if (!cancelled && t) {
          setLibrarySnapshot(t.paperSnapshot);
        }
      } catch {
        // 무시 — 디테일 패널 placeholder가 뜸
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPmid, papers]);

  const selectedPaper: Paper | null =
    selectedPmid != null
      ? papers.find((p) => p.pmid === selectedPmid) ?? librarySnapshot
      : null;

  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
            >
              Paperis
              <span className="ml-1.5 align-text-top text-[10px] font-mono text-zinc-400">
                v2
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <TtsQueueBadge />
              <JournalEntryLink />
              <LibraryLink />
              <SettingsLink />
              <AuthMenu />
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex-1">
              <SearchBar
                initialValue={q}
                loading={loading}
                onSubmit={handleSearchSubmit}
              />
            </div>
            <SortControl
              value={sort}
              onChange={handleSortChange}
              disabled={loading}
            />
          </div>
          {translated && q.trim() ? (
            <div className="text-xs text-zinc-500">
              <button
                type="button"
                onClick={() => setShowQueryDetail((v) => !v)}
                className="font-mono text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                title="변환된 검색식 보기/숨기기"
              >
                {showQueryDetail ? "▾" : "▸"} 검색식
              </button>
              {showQueryDetail ? (
                <span className="ml-2 break-all font-mono text-zinc-500 dark:text-zinc-400">
                  {translated.query}
                </span>
              ) : null}
              {translated.note ? (
                <span className="ml-2 italic text-zinc-400">
                  · {translated.note}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 pb-32">
        {/* 결과 목록: lg 미만에서 패널이 떠 있을 땐 숨김 (단일 컬럼 흐름) */}
        <section
          className={[
            "min-w-0 flex-1",
            selectedPaper ? "hidden lg:block" : "block",
          ].join(" ")}
        >
          {error ? (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          ) : null}
          {!q.trim() && !loading ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center dark:border-zinc-700 dark:bg-zinc-950">
              <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-100">
                자연어로 PubMed를 검색하세요
              </h1>
              <p className="mt-2 text-sm text-zinc-500">
                질문을 그대로 입력하면 Gemini가 검색식으로 바꿔
                돌립니다.
              </p>
            </div>
          ) : null}

          {q.trim() && !loading && papers.length === 0 && !error ? (
            <p className="text-sm text-zinc-500">검색 결과가 없습니다.</p>
          ) : null}

          {(papers.length > 0 || loading) && (
            <>
              {!loading && total > 0 ? (
                <p className="mb-3 text-xs text-zinc-500">
                  PubMed 전체 결과 {total.toLocaleString()}건 중{" "}
                  {(page - 1) * PAGE_SIZE + 1}–
                  {(page - 1) * PAGE_SIZE + papers.length}건 표시
                </p>
              ) : null}
              <ResultsList
                papers={papers}
                loading={loading}
                selectedPmid={selectedPmid}
                miniSummaries={miniSummaries}
                miniLoading={miniLoading}
                onSelect={handleSelect}
                onLoadMini={handleLoadMini}
              />
              {!loading && papers.length > 0 && total > PAGE_SIZE ? (
                <Pagination
                  page={page}
                  totalPages={Math.ceil(total / PAGE_SIZE)}
                  onChange={handlePageChange}
                />
              ) : null}
            </>
          )}
        </section>

        {/* 디테일 패널:
            - lg+ : 항상 보이고 (선택 안되어 있으면 placeholder), 사이드 컬럼
            - lg 미만 : 선택된 논문이 있을 때만 보이고 메인 영역 통째로 차지 */}
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
              onBack={() => updateUrl({ pmid: null })}
            />
          ) : (
            <div className="sticky top-32 rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
              왼쪽 카드를 클릭하면 상세 정보가 여기에 표시됩니다.
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (next: number) => void;
}) {
  const safeTotal = Math.max(1, Math.min(totalPages, 9999));
  const isFirst = page <= 1;
  const isLast = page >= safeTotal;
  return (
    <nav
      aria-label="페이지 이동"
      className="mt-6 flex items-center justify-between gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={isFirst}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        ← 이전 20건
      </button>
      <span className="text-xs text-zinc-500">
        {page.toLocaleString()} / {safeTotal.toLocaleString()} 페이지
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={isLast}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        다음 20건 →
      </button>
    </nav>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
