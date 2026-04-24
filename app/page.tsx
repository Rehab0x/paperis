"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import PaperList from "@/components/PaperList";
import PaperCard from "@/components/PaperCard";
import type {
  NeedFilter,
  Paper,
  PubmedSearchResponse,
  RecommendResponse,
} from "@/types";

type Status = "idle" | "loading" | "success" | "error";
type RecommendStatus = "idle" | "loading" | "ready" | "error";
type RecMap = Record<string, { reason: string; rank: number }>;

const SUGGESTIONS: { label: string; query: string; filter: NeedFilter }[] = [
  { label: "뇌졸중 재활 치료", query: "stroke rehabilitation", filter: "treatment" },
  { label: "보행 분석 평가", query: "gait analysis post stroke", filter: "diagnosis" },
  { label: "경직 최신 동향", query: "post stroke spasticity", filter: "trend" },
  { label: "CIMT 중재", query: "constraint induced movement therapy", filter: "treatment" },
];

function HomeImpl() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedPmid = searchParams.get("pmid");

  const [status, setStatus] = useState<Status>("idle");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [lastQuery, setLastQuery] = useState<{ q: string; filter: NeedFilter } | null>(null);

  const [recStatus, setRecStatus] = useState<RecommendStatus>("idle");
  const [recMap, setRecMap] = useState<RecMap>({});
  const recAbortRef = useRef<AbortController | null>(null);

  function updateSelection(pmid: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (pmid) params.set("pmid", pmid);
    else params.delete("pmid");
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  async function fetchRecommendations(fetchedPapers: Paper[], filter: NeedFilter) {
    recAbortRef.current?.abort();
    const ac = new AbortController();
    recAbortRef.current = ac;

    setRecMap({});
    setRecStatus("loading");

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ papers: fetchedPapers, filter }),
        signal: ac.signal,
      });
      if (!res.ok) {
        setRecStatus("error");
        return;
      }
      const data = (await res.json()) as RecommendResponse;
      const next: RecMap = {};
      data.recommendations.forEach((r, idx) => {
        next[r.pmid] = { reason: r.reason, rank: idx + 1 };
      });
      setRecMap(next);
      setRecStatus(data.recommendations.length > 0 ? "ready" : "error");
    } catch (err) {
      if (ac.signal.aborted) return;
      console.error("[recommend]", err);
      setRecStatus("error");
    }
  }

  async function runSearch(query: string, filter: NeedFilter) {
    recAbortRef.current?.abort();
    setStatus("loading");
    setErrorMessage("");
    setLastQuery({ q: query, filter });
    setRecMap({});
    setRecStatus("idle");
    updateSelection(null);

    try {
      const params = new URLSearchParams({ q: query, filter });
      const res = await fetch(`/api/pubmed?${params.toString()}`);
      const data = (await res.json()) as PubmedSearchResponse | { error: string };

      if (!res.ok || "error" in data) {
        const msg = "error" in data ? data.error : `HTTP ${res.status}`;
        setErrorMessage(msg);
        setPapers([]);
        setStatus("error");
        return;
      }

      setPapers(data.papers);
      setStatus("success");

      if (data.papers.length > 0) {
        void fetchRecommendations(data.papers, filter);
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "네트워크 오류");
      setPapers([]);
      setStatus("error");
    }
  }

  const loading = status === "loading";

  // 추천/일반 섹션 분리
  const { recommendedPapers, otherPapers } = useMemo(() => {
    if (recStatus !== "ready") {
      return { recommendedPapers: [] as Paper[], otherPapers: papers };
    }
    const byPmid = new Map(papers.map((p) => [p.pmid, p] as const));
    const orderedPmids = Object.entries(recMap)
      .sort((a, b) => a[1].rank - b[1].rank)
      .map(([pmid]) => pmid);
    const rec: Paper[] = [];
    for (const pmid of orderedPmids) {
      const p = byPmid.get(pmid);
      if (p) rec.push(p);
    }
    const recSet = new Set(orderedPmids);
    const rest = papers.filter((p) => !recSet.has(p.pmid));
    return { recommendedPapers: rec, otherPapers: rest };
  }, [papers, recMap, recStatus]);

  const selectedPaper = useMemo(() => {
    if (!selectedPmid) return null;
    return papers.find((p) => p.pmid === selectedPmid) ?? null;
  }, [papers, selectedPmid]);

  // 선택한 pmid가 현재 결과에 없으면(검색 결과 변경 등) URL 정리
  useEffect(() => {
    if (selectedPmid && status === "success" && !selectedPaper) {
      updateSelection(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPmid, status, selectedPaper]);

  const hasSelection = Boolean(selectedPaper);

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/80 backdrop-blur dark:border-zinc-800 dark:bg-black/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
              P
            </span>
            <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              Paperis
            </span>
            <span className="ml-auto hidden text-xs text-zinc-500 dark:text-zinc-400 sm:inline">
              From papers to practice
            </span>
          </div>
          <SearchBar disabled={loading} onSearch={runSearch} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-6 md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] md:gap-6">
          {/* 목록 패널 */}
          <section
            className={
              "flex flex-col gap-4 " +
              (hasSelection ? "hidden md:flex" : "flex")
            }
          >
            {status === "idle" ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs uppercase tracking-wide text-zinc-400">
                  추천 검색
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => runSearch(s.query, s.filter)}
                      className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-600"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {loading ? (
              <div className="flex flex-col gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 animate-pulse rounded-2xl border border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60"
                  />
                ))}
              </div>
            ) : null}

            {status === "error" ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {errorMessage || "검색 중 문제가 발생했습니다."}
              </div>
            ) : null}

            {status === "success" ? (
              <>
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    검색 결과{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {papers.length}
                    </span>
                    건
                  </h2>
                  {lastQuery ? (
                    <span className="text-xs text-zinc-400">
                      “{lastQuery.q}” · {lastQuery.filter}
                    </span>
                  ) : null}
                </div>

                {papers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                    결과가 없습니다. 다른 키워드로 검색해 보세요.
                  </div>
                ) : (
                  <>
                    <section className="flex flex-col gap-3">
                      <div className="flex items-baseline justify-between">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                          AI 추천 3편
                        </h3>
                        {recStatus === "loading" ? (
                          <span className="text-[11px] text-zinc-400">분석 중…</span>
                        ) : recStatus === "error" ? (
                          <button
                            type="button"
                            onClick={() =>
                              lastQuery && fetchRecommendations(papers, lastQuery.filter)
                            }
                            className="text-[11px] text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                          >
                            추천 다시 시도
                          </button>
                        ) : null}
                      </div>

                      {recStatus === "loading" ? (
                        <div className="flex flex-col gap-3">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="h-20 animate-pulse rounded-2xl border border-amber-200/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
                            />
                          ))}
                        </div>
                      ) : recStatus === "ready" && recommendedPapers.length > 0 ? (
                        <PaperList
                          papers={recommendedPapers}
                          recommendations={recMap}
                          compact
                          onSelect={updateSelection}
                          selectedPmid={selectedPmid}
                        />
                      ) : null}
                    </section>

                    <section className="flex flex-col gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {recStatus === "ready" ? "전체 결과" : "검색 결과"}
                      </h3>
                      <PaperList
                        papers={recStatus === "ready" ? otherPapers : papers}
                        startRank={recStatus === "ready" ? recommendedPapers.length + 1 : 1}
                        compact
                        onSelect={updateSelection}
                        selectedPmid={selectedPmid}
                      />
                    </section>
                  </>
                )}
              </>
            ) : null}
          </section>

          {/* 상세 패널 */}
          <aside
            className={
              "md:sticky md:top-[132px] md:h-[calc(100vh-148px)] md:overflow-y-auto md:pr-1 " +
              (hasSelection ? "block" : "hidden md:block")
            }
          >
            {selectedPaper ? (
              <>
                <div className="mb-3 flex items-center justify-between md:hidden">
                  <button
                    type="button"
                    onClick={() => updateSelection(null)}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    ← 목록
                  </button>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    PMID {selectedPaper.pmid}
                  </span>
                </div>
                <PaperCard
                  key={selectedPaper.pmid}
                  paper={selectedPaper}
                  rank={
                    papers.findIndex((p) => p.pmid === selectedPaper.pmid) + 1
                  }
                  recommendationReason={recMap[selectedPaper.pmid]?.reason}
                  recommendationRank={recMap[selectedPaper.pmid]?.rank}
                />
              </>
            ) : (
              <div className="hidden h-full items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 md:flex">
                {status === "success" && papers.length > 0
                  ? "목록에서 논문을 고르면 여기에 상세 내용이 표시됩니다."
                  : "검색하면 결과가 왼쪽에 나타납니다."}
              </div>
            )}
          </aside>
        </div>

        <footer className="mt-10 text-center text-xs text-zinc-400">
          Data from PubMed / NCBI E-utilities · Paperis MVP
        </footer>
      </main>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeImpl />
    </Suspense>
  );
}
