"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import AuthMenu from "@/components/AuthMenu";
import { useAutoMiniSummary } from "@/components/useAutoMiniSummary";
import LibraryLink from "@/components/LibraryLink";
import PaperDetailPanel from "@/components/PaperDetailPanel";
import ResultsList from "@/components/ResultsList";
import SearchBar from "@/components/SearchBar";
import SettingsLink from "@/components/SettingsLink";
import SortControl from "@/components/SortControl";
import ContinueListeningCard from "@/components/ContinueListeningCard";
import MyJournalsNewIssues from "@/components/MyJournalsNewIssues";
import MySpecialtiesPicker from "@/components/MySpecialtiesPicker";
import TrendFeaturedCard from "@/components/TrendFeaturedCard";
// JournalEntryLink는 홈이 이제 큐레이션 진입점이라 토픽바에서 제거 (MyJournalsNewIssues
// 안의 "전체 보기" + 빈 상태 CTA가 같은 동선 제공). 다른 페이지의 헤더에는 그대로 유지.
import TtsQueueBadge from "@/components/TtsQueueBadge";
import UsageBanner from "@/components/UsageBanner";
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
  const [oaFirst, setOaFirst] = useState(false);

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
    (
      next: {
        q?: string;
        sort?: SortMode;
        pmid?: string | null;
        page?: number | null;
      },
      mode: "push" | "replace" = "push"
    ) => {
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
      const href = `/?${params.toString()}`;
      if (mode === "replace") router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
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
      // 모바일 뒤로가기 자연 동작:
      //   - 새 paper 열기 → push (back으로 패널 닫기 가능)
      //   - 같은 카드 클릭 = 토글 닫기 → replace (history 정리)
      //   - 다른 카드로 전환 → replace (history 폭주 방지)
      if (pmid === selectedPmid) {
        updateUrl({ pmid: null }, "replace");
      } else {
        updateUrl({ pmid }, selectedPmid ? "replace" : "push");
      }
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

  // OA 우선 토글 — 현재 페이지(20편) 안에서 Open Access 논문을 위로.
  // 자연어 검색은 PubMed 서버 페이지네이션(retmax=PAGE_SIZE)이라 "전체 결과 단위"로
  // 정렬하려면 모든 페이지를 fetch해야 해 비용이 큼. 페이지 단위 정렬만으로도 OA
  // 논문이 위로 보여 출퇴근 청취 시나리오에 충분히 도움이 된다.
  const displayedPapers = useMemo<Paper[]>(() => {
    if (!oaFirst) return papers;
    return [...papers].sort((a, b) => {
      const ao = a.access === "open" ? 0 : 1;
      const bo = b.access === "open" ? 0 : 1;
      return ao - bo;
    });
  }, [papers, oaFirst]);
  const oaCountInPage = useMemo(
    () => papers.reduce((n, p) => n + (p.access === "open" ? 1 : 0), 0),
    [papers]
  );

  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-paperis-border bg-paperis-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/"
              className="font-serif text-2xl font-medium tracking-tight text-paperis-text"
            >
              Paperis
              <span className="text-paperis-accent">.</span>
            </Link>
            <div className="flex items-center gap-0.5">
              <TtsQueueBadge />
              <LibraryLink className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text" />
              <SettingsLink className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-base text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text" />
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
            <div className="text-xs text-paperis-text-3">
              <button
                type="button"
                onClick={() => setShowQueryDetail((v) => !v)}
                className="font-mono text-paperis-text-3 transition hover:text-paperis-text-2"
                title="변환된 검색식 보기/숨기기"
              >
                {showQueryDetail ? "▾" : "▸"} 검색식
              </button>
              {showQueryDetail ? (
                <span className="ml-2 break-all font-mono text-paperis-text-2">
                  {translated.query}
                </span>
              ) : null}
              {translated.note ? (
                <span className="ml-2 italic text-paperis-text-3">
                  · {translated.note}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>

      <UsageBanner />

      <main className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 pb-32">
        {/* 결과 목록: lg 미만에서 패널이 떠 있을 땐 숨김 (단일 컬럼 흐름) */}
        <section
          className={[
            "min-w-0 flex-1",
            selectedPaper ? "hidden lg:block" : "block",
          ].join(" ")}
        >
          {error ? (
            <div className="mb-4 rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-sm text-paperis-accent">
              {error}
            </div>
          ) : null}
          {!q.trim() && !loading ? (
            <div className="paperis-stagger">
              <ContinueListeningCard />
              <MySpecialtiesPicker />
              <TrendFeaturedCard />
              <MyJournalsNewIssues />
              <div className="mt-2 rounded-2xl border border-dashed border-paperis-border bg-paperis-surface/50 p-5 text-center">
                <p className="text-sm text-paperis-text-2">
                  또는, 위 검색창에 자연어로 질문해 보세요.
                </p>
                <p className="mt-1 text-[11px] text-paperis-text-3">
                  Gemini가 PubMed 검색식으로 바꿔 돌립니다.
                </p>
              </div>
            </div>
          ) : null}

          {q.trim() && !loading && papers.length === 0 && !error ? (
            <p className="text-sm text-paperis-text-3">검색 결과가 없습니다.</p>
          ) : null}

          {(papers.length > 0 || loading) && (
            <>
              {!loading && total > 0 ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-paperis-text-3">
                    PubMed 전체 결과 {total.toLocaleString()}건 중{" "}
                    {(page - 1) * PAGE_SIZE + 1}–
                    {(page - 1) * PAGE_SIZE + papers.length}건 표시
                  </p>
                  {papers.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setOaFirst((v) => !v)}
                      aria-pressed={oaFirst}
                      className={[
                        "rounded-full border px-3 py-1 text-xs transition",
                        oaFirst
                          ? "border-paperis-accent bg-paperis-accent-dim/40 text-paperis-accent"
                          : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3",
                      ].join(" ")}
                      title="이 페이지에서 Open Access 논문을 위로 정렬"
                    >
                      {oaFirst ? "✓ " : ""}📖 Open Access 우선{" "}
                      <span className="text-paperis-text-3">
                        ({oaCountInPage}/{papers.length})
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}
              <ResultsList
                papers={displayedPapers}
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
              onBack={() => updateUrl({ pmid: null }, "replace")}
            />
          ) : (
            <div className="sticky top-32 rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-6 text-sm text-paperis-text-3">
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
      className="mt-6 flex items-center justify-between gap-3 border-t border-paperis-border pt-4"
    >
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={isFirst}
        className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-30"
      >
        ← 이전 20건
      </button>
      <span className="text-xs text-paperis-text-3">
        {page.toLocaleString()} / {safeTotal.toLocaleString()} 페이지
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={isLast}
        className="rounded-lg border border-paperis-border px-3 py-1.5 text-sm text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-30"
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
