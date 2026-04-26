"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import SearchBar from "@/components/SearchBar";
import PaperList from "@/components/PaperList";
import PaperCard from "@/components/PaperCard";
import RecommendWeights from "@/components/RecommendWeights";
import Pagination from "@/components/Pagination";
import CartPanel from "@/components/CartPanel";
import AuthMenu from "@/components/AuthMenu";
import { getCart, subscribeCart, type CartItem } from "@/lib/cart";
import {
  getStoredWeights,
  subscribeWeights,
  weightsAreEqual,
} from "@/lib/weights-store";
import {
  DEFAULT_RECOMMEND_WEIGHTS,
  type NeedFilter,
  type Paper,
  type PubmedSearchResponse,
  type RecommendResponse,
  type RecommendWeights as RecommendWeightsType,
} from "@/types";

type Status = "idle" | "loading" | "success" | "error";
type RecommendStatus = "idle" | "loading" | "ready" | "error";
type RecMap = Record<string, { reason: string; rank: number }>;

const PAGE_SIZE = 20;
const ALLOWED_FILTERS: NeedFilter[] = ["treatment", "diagnosis", "trend", "balanced"];

const SUGGESTIONS: { label: string; query: string; filter: NeedFilter }[] = [
  { label: "뇌졸중 재활 치료", query: "stroke rehabilitation", filter: "treatment" },
  { label: "보행 분석 평가", query: "gait analysis post stroke", filter: "diagnosis" },
  { label: "경직 최신 동향", query: "post stroke spasticity", filter: "trend" },
  { label: "CIMT 중재", query: "constraint induced movement therapy", filter: "treatment" },
];

function parseFilter(raw: string | null): NeedFilter {
  if (raw && (ALLOWED_FILTERS as string[]).includes(raw)) return raw as NeedFilter;
  return "balanced";
}

function parsePage(raw: string | null): number {
  const n = raw ? Math.trunc(Number(raw)) : 1;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 500);
}

function HomeImpl() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const q = searchParams.get("q")?.trim() ?? "";
  const filter = parseFilter(searchParams.get("filter"));
  const page = parsePage(searchParams.get("page"));
  const selectedPmid = searchParams.get("pmid");

  const [status, setStatus] = useState<Status>("idle");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const [recStatus, setRecStatus] = useState<RecommendStatus>("idle");
  const [recMap, setRecMap] = useState<RecMap>({});
  const recAbortRef = useRef<AbortController | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // 추천 가중치 — localStorage(혹은 서버 동기화로 갱신된 값)에서 복원
  const [weights, setWeights] = useState<RecommendWeightsType>(
    DEFAULT_RECOMMEND_WEIGHTS
  );
  useEffect(() => {
    // 마운트 시 1회 + 외부(서버 동기화)에서 갱신될 때마다 다시 반영.
    // 같은 값이면 prev 그대로 반환해 React 리렌더 차단 — 무한 루프 방지.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWeights(getStoredWeights());
    return subscribeWeights(() => {
      const fresh = getStoredWeights();
      setWeights((prev) => (weightsAreEqual(prev, fresh) ? prev : fresh));
    });
  }, []);

  function pushParams(updates: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

  function onSearch(query: string, nextFilter: NeedFilter) {
    pushParams({ q: query, filter: nextFilter, page: "1", pmid: null });
  }

  function gotoPage(n: number) {
    pushParams({ page: String(n), pmid: null });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectPmid(pmid: string | null) {
    pushParams({ pmid });
  }

  async function fetchRecommendations(
    fetchedPapers: Paper[],
    filterArg: NeedFilter,
    weightsArg: RecommendWeightsType
  ) {
    recAbortRef.current?.abort();
    const ac = new AbortController();
    recAbortRef.current = ac;

    setRecMap({});
    setRecStatus("loading");

    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: fetchedPapers,
          filter: filterArg,
          weights: weightsArg,
        }),
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

  // URL 쿼리(q/filter/page)가 바뀌면 자동으로 검색 실행.
  // 모든 setState는 async 핸들 안에서 호출(이펙트 본문 동기 호출 금지 규칙 준수).
  useEffect(() => {
    searchAbortRef.current?.abort();
    const ac = new AbortController();
    searchAbortRef.current = ac;

    async function run() {
      // 검색어 비어 있으면 초기 상태로 복귀
      if (!q) {
        setStatus("idle");
        setPapers([]);
        setTotal(0);
        setRecMap({});
        setRecStatus("idle");
        return;
      }

      setStatus("loading");
      setErrorMessage("");
      // 페이지 전환 시엔 추천 패널 즉시 비우기 (page=1만 추천 대상)
      setRecMap({});
      setRecStatus("idle");

      const start = (page - 1) * PAGE_SIZE;
      const params = new URLSearchParams({
        q,
        filter,
        retmax: String(PAGE_SIZE),
        start: String(start),
      });

      try {
        const res = await fetch(`/api/pubmed?${params.toString()}`, {
          signal: ac.signal,
        });
        const data = (await res.json()) as PubmedSearchResponse | { error: string };
        if (ac.signal.aborted) return;

        if (!res.ok || "error" in data) {
          const msg = "error" in data ? data.error : `HTTP ${res.status}`;
          setErrorMessage(msg);
          setPapers([]);
          setTotal(0);
          setStatus("error");
          return;
        }

        setPapers(data.papers);
        setTotal(data.total);
        setStatus("success");
        // 추천 트리거는 weights/papers 의존 effect에서 처리 (가중치 변경에도 자동 재요청)
      } catch (err) {
        if (ac.signal.aborted) return;
        setErrorMessage(err instanceof Error ? err.message : "네트워크 오류");
        setPapers([]);
        setTotal(0);
        setStatus("error");
      }
    }

    void run();
    return () => ac.abort();
  }, [q, filter, page]);

  const loading = status === "loading";

  // 추천/일반 섹션 분리 (page=1에서만 의미)
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

  // 카트도 selectedPaper 후보로 — 검색 결과에 없는 카트 항목도 우측 상세에 표시 가능
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  useEffect(() => {
    // localStorage(외부 시스템) 동기화 — 마운트 1회 + 변경 이벤트 구독
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCartItems(getCart());
    return subscribeCart(() => setCartItems(getCart()));
  }, []);

  const selectedPaper = useMemo(() => {
    if (!selectedPmid) return null;
    const fromSearch = papers.find((p) => p.pmid === selectedPmid);
    if (fromSearch) return fromSearch;
    const fromCart = cartItems.find((it) => it.pmid === selectedPmid);
    if (fromCart) return fromCart.paper;
    return null;
  }, [papers, selectedPmid, cartItems]);

  // 추천 트리거: papers / filter / weights 변경 시 1페이지에서만 재호출. debounce 350ms.
  useEffect(() => {
    if (status !== "success" || page !== 1 || papers.length === 0) {
      if (recStatus !== "idle") {
        // 1페이지가 아니거나 결과가 없으면 추천 패널 비움 (state 동기화)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRecStatus("idle");
      }
      return;
    }
    const timer = setTimeout(() => {
      void fetchRecommendations(papers, filter, weights);
    }, 350);
    return () => clearTimeout(timer);
    // fetchRecommendations는 매 렌더 새로 만들어지므로 deps에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [papers, filter, weights, status, page]);

  // 선택한 pmid가 현재 페이지 결과에 없으면 URL 정리
  useEffect(() => {
    if (selectedPmid && status === "success" && !selectedPaper) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("pmid");
      const qs = next.toString();
      router.replace(qs ? `/?${qs}` : "/", { scroll: false });
    }
  }, [selectedPmid, status, selectedPaper, searchParams, router]);

  const hasSelection = Boolean(selectedPaper);
  const totalPages = total > 0 ? Math.min(Math.ceil(total / PAGE_SIZE), 500) : 0;
  const pageStart = (page - 1) * PAGE_SIZE + 1;
  const pageEnd = (page - 1) * PAGE_SIZE + papers.length;

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/80 backdrop-blur dark:border-zinc-800 dark:bg-black/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              aria-label="홈으로"
              className="flex items-center gap-2 rounded-lg outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-zinc-400"
            >
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
                P
              </span>
              <span className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                Paperis
              </span>
              <span className="ml-2 hidden text-xs text-zinc-500 dark:text-zinc-400 sm:inline">
                From papers to practice
              </span>
            </Link>
            <span className="ml-auto flex items-center gap-2">
              <CartPanel />
              <AuthMenu />
            </span>
          </div>
          <SearchBar
            initialQuery={q}
            initialFilter={filter}
            disabled={loading}
            onSearch={onSearch}
          />
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
                      onClick={() => onSearch(s.query, s.filter)}
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
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                    검색 결과{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {total.toLocaleString()}
                    </span>
                    건
                    {totalPages > 0 ? (
                      <span className="ml-1 text-xs text-zinc-400">
                        · {pageStart}–{pageEnd}
                      </span>
                    ) : null}
                  </h2>
                  <span className="text-xs text-zinc-400">
                    “{q}” · {filter}
                  </span>
                </div>

                {papers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                    결과가 없습니다. 다른 키워드로 검색해 보세요.
                  </div>
                ) : (
                  <>
                    {/* 추천 — 1페이지에서만 */}
                    {page === 1 ? (
                      <section className="flex flex-col gap-3">
                        <RecommendWeights value={weights} onChange={setWeights} />
                        <div className="flex items-baseline justify-between">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                            AI 추천 3편
                          </h3>
                          {recStatus === "loading" ? (
                            <span className="text-[11px] text-zinc-400">분석 중…</span>
                          ) : recStatus === "error" ? (
                            <button
                              type="button"
                              onClick={() => fetchRecommendations(papers, filter, weights)}
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
                            onSelect={selectPmid}
                            selectedPmid={selectedPmid}
                          />
                        ) : null}
                      </section>
                    ) : null}

                    <section className="flex flex-col gap-3">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        {page === 1 && recStatus === "ready"
                          ? "전체 결과"
                          : "검색 결과"}
                      </h3>
                      <PaperList
                        papers={page === 1 && recStatus === "ready" ? otherPapers : papers}
                        startRank={
                          (page - 1) * PAGE_SIZE +
                          (page === 1 && recStatus === "ready"
                            ? recommendedPapers.length + 1
                            : 1)
                        }
                        compact
                        onSelect={selectPmid}
                        selectedPmid={selectedPmid}
                      />
                    </section>

                    {/* 페이지네이션 */}
                    <Pagination
                      page={page}
                      totalPages={totalPages}
                      onChange={gotoPage}
                    />
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
                    onClick={() => selectPmid(null)}
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
                    (page - 1) * PAGE_SIZE +
                    papers.findIndex((p) => p.pmid === selectedPaper.pmid) +
                    1
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
