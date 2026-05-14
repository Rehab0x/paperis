"use client";

// 저널 호 탐색 — year/month picker + 결과 목록.
// 한 호 전체(최대 200건)를 한 번에 받고 JournalPaperList가 클라 페이지네이션 +
// OA 우선 정렬을 처리. 페이지 이동 시 server 호출 없이 즉시 + OA 토글이 전체
// 결과 단위로 동작.

import { useEffect, useMemo, useState } from "react";
import JournalPaperList from "@/components/JournalPaperList";
import { useAppMessages } from "@/components/useAppMessages";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { fmt } from "@/lib/i18n";
import { countNoise, isSubstantivePaper } from "@/lib/paper-filter";
import type { Paper } from "@/types";

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

// 한 번에 받을 최대치. PubMed efetch cap 200.
const FETCH_LIMIT = 200;

const NOW = new Date();
function defaultYearMonth(): { year: number; month: number } {
  // PubMed 인덱싱 지연을 감안해 기본은 "지난 달"
  const m = NOW.getMonth();
  if (m === 0) return { year: NOW.getFullYear() - 1, month: 12 };
  return { year: NOW.getFullYear(), month: m };
}

function buildYearOptions(): number[] {
  const current = NOW.getFullYear();
  const out: number[] = [];
  for (let y = current; y >= current - 6; y--) out.push(y);
  return out;
}

export default function IssueExplorer({ issn, journalName }: Props) {
  const m = useAppMessages();
  const MONTH_OPTIONS = m.journal.issue.months.map((label, i) => ({
    v: i + 1,
    label,
  }));
  const init = useMemo(defaultYearMonth, []);
  const [year, setYear] = useState<number>(init.year);
  const [month, setMonth] = useState<number>(init.month);

  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // noise 필터 — 기본 ON. 호 탐색에선 editorial/letter/erratum이 흔히 같이 잡혀
  // 사용자 시선 부담. 토글로 모두 보기 가능 (DOI로 직접 들어가 보고 싶을 때).
  const [includeNoise, setIncludeNoise] = useState(false);

  const fetchWithKeys = useFetchWithKeys();
  const fetchKey = `${issn}::${year}::${month}`;
  const yearOptions = useMemo(buildYearOptions, []);

  // 필터링·noise 카운트는 papers 변할 때만 재계산.
  const filteredPapers = useMemo(
    () => (includeNoise ? papers : papers.filter(isSubstantivePaper)),
    [papers, includeNoise]
  );
  const noiseCount = useMemo(() => countNoise(papers), [papers]);
  // JournalPaperList는 fetchKey가 바뀌면 페이지/선택 리셋 — 토글 변화도 새 키에
  // 포함시켜 1페이지로 자연스럽게 돌아가게.
  const listKey = `${fetchKey}::${includeNoise ? "all" : "sub"}`;

  // dedupe ref 가드는 의도적으로 사용하지 않는다 — Strict Mode 무한 loading 회피.
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const params = new URLSearchParams({
          issn,
          year: String(year),
          month: String(month),
          retmax: String(FETCH_LIMIT),
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
                ? `${fmt(m.journal.issue.failedStatus, { status: res.status })}: ${rawText.slice(0, 240)}`
                : fmt(m.journal.issue.failedStatus, { status: res.status });
          setError(msg);
          setPapers([]);
          setTotal(0);
          return;
        }
        setPapers(json.papers);
        setTotal(json.total);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : m.journal.issue.failed);
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
  }, [fetchKey, issn, year, month, fetchWithKeys]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-paperis-border bg-paperis-surface p-3">
        <label className="flex items-center gap-2 text-xs text-paperis-text-3">
          <span>{m.journal.issue.year}</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-md border border-paperis-border bg-paperis-surface px-2 py-1 text-sm text-paperis-text"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-paperis-text-3">
          <span>{m.journal.issue.month}</span>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="rounded-md border border-paperis-border bg-paperis-surface px-2 py-1 text-sm text-paperis-text"
          >
            {MONTH_OPTIONS.map((opt) => (
              <option key={opt.v} value={opt.v}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        {!loading && total > 0 ? (
          <span className="text-xs text-paperis-text-3">
            {fmt(m.journal.issue.header, {
              year,
              month,
              monthName: m.journal.issue.months[month - 1],
              total: total.toLocaleString(),
            })}{" "}
            {fmt(m.journal.issue.headerSub, { n: papers.length })}
            {!includeNoise && noiseCount > 0 ? (
              <span className="ml-1 text-paperis-text-3">
                {fmt(m.journal.issue.filteredCount, { n: noiseCount })}
              </span>
            ) : null}
          </span>
        ) : null}
        {/* noise 토글 — Editorial/Letter/Erratum 등 substantive 아닌 paper 표시 여부.
            default OFF (필터 ON) — 호 탐색의 기본은 깨끗한 결과. 사용자가 토글 ON 시
            모든 paper 표시 (DOI 직접 진입 등 의도된 사용 case 지원). */}
        {!loading && papers.length > 0 ? (
          <button
            type="button"
            onClick={() => setIncludeNoise((v) => !v)}
            aria-pressed={includeNoise}
            title={m.journal.issue.includeNoiseTitle}
            className={[
              "rounded-full border px-3 py-1 text-xs transition",
              includeNoise
                ? "border-paperis-accent bg-paperis-accent-dim/40 text-paperis-accent"
                : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3",
            ].join(" ")}
          >
            {includeNoise ? "✓ " : ""}{m.journal.issue.includeNoise}
          </button>
        ) : null}
      </div>

      <JournalPaperList
        papers={filteredPapers}
        loading={loading}
        error={error}
        fetchKey={listKey}
        emptyMessage={
          <div className="rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-8 text-center text-sm text-paperis-text-3">
            <p>
              {fmt(m.journal.issue.empty, {
                year,
                month,
                monthName: m.journal.issue.months[month - 1],
              })}
            </p>
            <p className="mt-1 text-xs text-paperis-text-3">
              {fmt(m.journal.issue.emptyHint, { journalName })}
            </p>
          </div>
        }
      />
    </section>
  );
}
