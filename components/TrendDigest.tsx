"use client";

// 저널 최근 트렌드 — Gemini가 abstract 모음을 보고 만든 headline + 5-7 bullet.
// 분석 대상이 된 논문 목록도 함께 노출 (master-detail).

import { useEffect, useMemo, useState } from "react";
import JournalPaginationView from "@/components/JournalPagination";
import JournalPaperList from "@/components/JournalPaperList";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import type { Paper } from "@/types";

interface Props {
  issn: string;
  journalName: string;
}

interface JournalTrend {
  headline: string;
  bullets: string[];
}

interface TrendResponse {
  query: string;
  papers: Paper[];
  total: number;
  trend: JournalTrend;
  issn: string;
  months: number;
  periodLabel: string;
}

const MONTH_OPTIONS = [
  { v: 3, label: "최근 3개월" },
  { v: 6, label: "최근 6개월" },
  { v: 12, label: "최근 12개월" },
];

const PAGE_SIZE = 20;

export default function TrendDigest({ issn, journalName }: Props) {
  const [months, setMonths] = useState<number>(6);
  const [page, setPage] = useState(1);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [trend, setTrend] = useState<JournalTrend>({ headline: "", bullets: [] });
  const [periodLabel, setPeriodLabel] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWithKeys = useFetchWithKeys();
  const fetchKey = `${issn}::trend::${months}::${page}`;

  // 기간 또는 issn 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1);
  }, [issn, months]);

  // dedupe ref 가드는 의도적으로 사용하지 않는다 — Strict Mode mount cycle에서 무한
  // loading + 새 응답이 cancelled로 차단되어 화면 갱신 안 됨 (PaperDetailPanel 패턴 동일).
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    // 새 fetch 시작 시 이전 trend는 비워둠 — loading skeleton이 보이도록.
    setTrend({ headline: "", bullets: [] });

    (async () => {
      try {
        const params = new URLSearchParams({
          issn,
          journalName,
          months: String(months),
        });
        const res = await fetchWithKeys(
          `/api/journal/trend?${params.toString()}`,
          { signal: controller.signal }
        );
        const rawText = await res.text();
        let json: TrendResponse | { error?: string } | null = null;
        try {
          json = JSON.parse(rawText);
        } catch {
          // ignore
        }
        if (cancelled) return;
        if (!res.ok || !json || !("trend" in json)) {
          const msg =
            json && "error" in json && json.error
              ? json.error
              : rawText
                ? `트렌드 분석 실패 (${res.status}): ${rawText.slice(0, 240)}`
                : `트렌드 분석 실패 (${res.status})`;
          setError(msg);
          setPapers([]);
          setTotal(0);
          setTrend({ headline: "", bullets: [] });
          setPeriodLabel("");
          return;
        }
        setPapers(json.papers);
        setTotal(json.total);
        setTrend(json.trend);
        setPeriodLabel(json.periodLabel);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "트렌드 분석 실패");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fetchKey, issn, journalName, months, fetchWithKeys]);

  // 80건을 받아 클라이언트가 페이지 단위로 슬라이스
  const pagedPapers = useMemo(
    () => papers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [papers, page]
  );
  const totalPages = Math.max(1, Math.ceil(papers.length / PAGE_SIZE));
  const showFrom = papers.length > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showTo =
    papers.length > 0 ? (page - 1) * PAGE_SIZE + pagedPapers.length : 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
        <div role="radiogroup" className="flex gap-1.5" aria-label="기간">
          {MONTH_OPTIONS.map((opt) => {
            const active = months === opt.v;
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setMonths(opt.v)}
                className={[
                  "rounded-md border px-3 py-1 text-xs transition",
                  active
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {periodLabel ? (
          <span className="text-xs text-zinc-500">
            기간 {periodLabel} · {total.toLocaleString()}건 분석 대상 (상위{" "}
            {papers.length}건 중 {showFrom}–{showTo}건 표시)
          </span>
        ) : null}
      </div>

      {/* 트렌드 카드 */}
      {loading && trend.bullets.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="h-4 w-3/5 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-3 space-y-2">
            <div className="h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-3 w-11/12 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
            <div className="h-3 w-9/12 animate-pulse rounded bg-zinc-100 dark:bg-zinc-900" />
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Gemini가 최근 abstract 모음을 분석 중… 30~60초 정도 걸립니다.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : trend.bullets.length > 0 ? (
        <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
          {trend.headline ? (
            <p className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
              {trend.headline}
            </p>
          ) : null}
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
            {trend.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-zinc-400">
            아래는 분석 대상이 된 논문들 — 카드를 누르면 풀텍스트·요약·TTS로
            바로 들어갑니다.
          </p>
        </article>
      ) : !loading ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
          이 기간에는 분석할 abstract가 충분하지 않습니다.
        </div>
      ) : null}

      <JournalPaperList
        papers={pagedPapers}
        loading={loading && papers.length === 0}
        error={null}
        fetchKey={fetchKey}
        footer={
          !loading && papers.length > 0 ? (
            <JournalPaginationView
              page={page}
              totalPages={totalPages}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          ) : null
        }
      />
    </section>
  );
}
