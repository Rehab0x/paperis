"use client";

// 저널 호 탐색 — year/month picker + 결과 master-detail.
// 메인 page.tsx의 패턴을 그대로 차용 — PaperCard / ResultsList / PaperDetailPanel
// 그대로 재사용. 미니 요약 자동 batch (상위 3건) + 클릭 시 단일도 그대로.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PaperDetailPanel from "@/components/PaperDetailPanel";
import ResultsList from "@/components/ResultsList";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import type {
  MiniSummary,
  Paper,
  SummarizeMiniRequest,
  SummarizeMiniResponse,
} from "@/types";

interface Props {
  issn: string;
  journalName: string;
}

interface IssuesResponse {
  query: string;
  papers: Paper[];
  total: number;
  year: number;
  month: number;
}

const NOW = new Date();
// PubMed 인덱싱 지연을 감안해 기본은 "지난 달"
function defaultYearMonth(): { year: number; month: number } {
  const m = NOW.getMonth(); // 0-base
  if (m === 0) return { year: NOW.getFullYear() - 1, month: 12 };
  return { year: NOW.getFullYear(), month: m }; // m이 0-base이므로 -1된 1-base 효과
}

function buildYearOptions(): number[] {
  const current = NOW.getFullYear();
  const out: number[] = [];
  for (let y = current; y >= current - 6; y--) out.push(y);
  return out;
}

const MONTH_OPTIONS = [
  { v: 1, label: "1월" },
  { v: 2, label: "2월" },
  { v: 3, label: "3월" },
  { v: 4, label: "4월" },
  { v: 5, label: "5월" },
  { v: 6, label: "6월" },
  { v: 7, label: "7월" },
  { v: 8, label: "8월" },
  { v: 9, label: "9월" },
  { v: 10, label: "10월" },
  { v: 11, label: "11월" },
  { v: 12, label: "12월" },
];

export default function IssueExplorer({ issn, journalName }: Props) {
  const init = useMemo(defaultYearMonth, []);
  const [year, setYear] = useState<number>(init.year);
  const [month, setMonth] = useState<number>(init.month);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedPmid, setSelectedPmid] = useState<string | null>(null);
  const [miniSummaries, setMiniSummaries] = useState<Map<string, MiniSummary>>(
    () => new Map()
  );
  const [miniLoading, setMiniLoading] = useState<Set<string>>(() => new Set());

  const fetchWithKeys = useFetchWithKeys();

  // 검색 키 (issn + year + month) 기준으로 자동 미니요약 배치 1회만
  const fetchKey = `${issn}::${year}::${month}`;
  const autoMiniKeyRef = useRef<string>("");
  const lastFetchKeyRef = useRef<string>("");

  const yearOptions = useMemo(buildYearOptions, []);

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
            "[issue-explorer] mini summary 실패",
            res.status,
            json && "error" in json ? json.error : rawText.slice(0, 200)
          );
        }
      } catch (err) {
        console.warn("[issue-explorer] mini summary 네트워크 오류", err);
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

  // year/month 바뀌면 호 fetch
  useEffect(() => {
    if (lastFetchKeyRef.current === fetchKey) return;
    lastFetchKeyRef.current = fetchKey;

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setSelectedPmid(null);
    setMiniSummaries(new Map());
    setMiniLoading(new Set());
    autoMiniKeyRef.current = "";

    (async () => {
      try {
        const params = new URLSearchParams({
          issn,
          year: String(year),
          month: String(month),
        });
        const res = await fetchWithKeys(
          `/api/journal/issues?${params.toString()}`,
          { signal: controller.signal }
        );
        const rawText = await res.text();
        let json: IssuesResponse | { error?: string } | null = null;
        try {
          json = JSON.parse(rawText);
        } catch {
          // ignore
        }
        if (cancelled) return;
        if (!res.ok || !json || !("papers" in json)) {
          const msg =
            json && "error" in json && json.error
              ? json.error
              : rawText
                ? `호 탐색 실패 (${res.status}): ${rawText.slice(0, 240)}`
                : `호 탐색 실패 (${res.status})`;
          setError(msg);
          setPapers([]);
          setTotal(0);
          return;
        }
        setPapers(json.papers);
        setTotal(json.total);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "호 탐색 실패");
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
    // fetchKey가 issn+year+month를 합친 식별자
  }, [fetchKey, issn, year, month, fetchWithKeys]);

  // 결과 도착 후 상위 3건 자동 미니 요약
  useEffect(() => {
    if (loading || papers.length === 0) return;
    if (autoMiniKeyRef.current === fetchKey) return;
    autoMiniKeyRef.current = fetchKey;
    void requestMiniSummary(papers.slice(0, 3));
  }, [loading, papers, fetchKey, requestMiniSummary]);

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

  return (
    <section className="flex w-full flex-col gap-6 lg:flex-row">
      <div
        className={[
          "min-w-0 flex-1",
          selectedPaper ? "hidden lg:block" : "block",
        ].join(" ")}
      >
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <span>연도</span>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-500">
            <span>월</span>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-md border border-zinc-200 bg-white px-2 py-1 text-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m.v} value={m.v}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          {!loading && total > 0 ? (
            <span className="text-xs text-zinc-500">
              {year}년 {month}월 호 — {total.toLocaleString()}건 (상위{" "}
              {papers.length}건 표시)
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {!loading && papers.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
            <p>이 달({year}년 {month}월)에는 PubMed 인덱스에 논문이 없습니다.</p>
            <p className="mt-1 text-xs text-zinc-400">
              {journalName}는 발행 주기 또는 PubMed 인덱싱 지연으로 결과가 비어
              있을 수 있습니다.
            </p>
          </div>
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
    </section>
  );
}
