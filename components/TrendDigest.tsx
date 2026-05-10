"use client";

// 저널 트렌드 — docs/TREND_IMPROVEMENT.md v2 UI.
//
// 변경:
//   - 기간 단위: rolling N개월 → 연도 탭 + 분기(all/Q1~Q4)
//   - 결과: bullets[80자] → themes (direction/insight/대표 PMID) + methodologyShift
//     + clinicalImplication + narrationScript
//   - 의미 단위 캐싱 + 진행 중/완료 구분
//
// TTS 청취 + 재생목록 추가는 후속 PR에서 (audio-library에 trend 트랙 타입 추가
// 분량이 별도라 분리). 현재는 narrationScript 표시만.

import { useEffect, useState } from "react";
import JournalPaperList from "@/components/JournalPaperList";
import TrendTtsButton from "@/components/TrendTtsButton";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import type { Paper } from "@/types";

interface Props {
  issn: string;
  journalName: string;
  /** 라이브러리에서 점프 등으로 들어올 때 초기값. null이면 default(현재 연도/all) */
  initialYear?: number | null;
  initialQuarter?: "all" | "Q1" | "Q2" | "Q3" | "Q4" | null;
}

type Quarter = "all" | "Q1" | "Q2" | "Q3" | "Q4";
type Direction = "increasing" | "new" | "debated" | "ongoing";

const DIRECTION_LABEL: Record<Direction, string> = {
  increasing: "↑ 증가",
  new: "🆕 신규",
  debated: "⚡ 논쟁",
  ongoing: "→ 지속",
};

interface TrendTheme {
  topic: string;
  direction: Direction;
  insight: string;
  representativePmids: string[];
}

interface JournalTrend {
  headline: string;
  themes: TrendTheme[];
  methodologyShift: string;
  clinicalImplication: string;
  narrationScript: string;
}

interface TrendResponse {
  query: string;
  papers: Paper[];
  total: number;
  trend: JournalTrend;
  issn: string;
  year: number;
  quarter: Quarter;
  periodLabel: string;
  isComplete: boolean;
}

const QUARTERS: { v: Quarter; label: string; months: [number, number] | null }[] =
  [
    { v: "all", label: "연간", months: null },
    { v: "Q1", label: "Q1", months: [1, 3] },
    { v: "Q2", label: "Q2", months: [4, 6] },
    { v: "Q3", label: "Q3", months: [7, 9] },
    { v: "Q4", label: "Q4", months: [10, 12] },
  ];

const NOW = new Date();

function buildYearOptions(): number[] {
  const cur = NOW.getFullYear();
  const out: number[] = [];
  for (let y = cur; y >= cur - 5; y--) out.push(y);
  return out;
}

/** 분기가 미래(현재 시점에 시작도 안 함)이면 비활성화 — 분석할 abstract가 없음 */
function isFutureQuarter(year: number, q: Quarter): boolean {
  if (q === "all") return false;
  const conf = QUARTERS.find((x) => x.v === q);
  if (!conf || !conf.months) return false;
  const fromMonth = conf.months[0];
  const startMs = new Date(year, fromMonth - 1, 1).getTime();
  return startMs > Date.now();
}

/**
 * representativePmids 클릭 시 페이지 내 PaperCard(id=`paper-{pmid}`)로 smooth
 * scroll + 짧은 highlight ring. 카드가 *현재 페이지에 없을 때*는 PubMed 외부 링크
 * 새 탭으로 fallback.
 *
 * JournalPaperList가 클라 페이지네이션이라 80건 중 1페이지(20건)에 없으면 카드가
 * DOM에 없음 — PubMed fallback이 자연스러움.
 */
function jumpToPaper(pmid: string): void {
  if (typeof window === "undefined") return;
  const el = document.getElementById(`paper-${pmid}`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // 짧게 ring highlight — 사용자가 어느 카드인지 즉시 인지
    el.classList.add(
      "ring-2",
      "ring-paperis-accent",
      "ring-offset-2",
      "transition"
    );
    setTimeout(() => {
      el.classList.remove(
        "ring-2",
        "ring-paperis-accent",
        "ring-offset-2",
        "transition"
      );
    }, 1800);
    return;
  }
  // 페이지 내에 없음 — PubMed 새 탭
  window.open(
    `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(pmid)}/`,
    "_blank",
    "noopener,noreferrer"
  );
}

// direction별 칩 톤 — paperis 단일 액센트 안에서 강도(채도/투명도)로 구분.
// 4가지 방향이 있지만 따뜻한 단일 액센트 시스템에서는 색상 다양성보다
// 같은 톤 안의 강약으로 구분하는 게 에디토리얼 분위기와 일치한다.
const DIRECTION_COLOR: Record<Direction, string> = {
  increasing:
    "border-paperis-accent bg-paperis-accent/10 text-paperis-accent",
  new: "border-paperis-accent/60 bg-paperis-accent-dim/40 text-paperis-accent",
  debated:
    "border-paperis-accent/40 bg-paperis-accent-dim/20 text-paperis-text",
  ongoing:
    "border-paperis-border bg-paperis-surface-2 text-paperis-text-2",
};

export default function TrendDigest({
  issn,
  journalName,
  initialYear,
  initialQuarter,
}: Props) {
  const [year, setYear] = useState<number>(initialYear ?? NOW.getFullYear());
  const [quarter, setQuarter] = useState<Quarter>(initialQuarter ?? "all");

  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [trend, setTrend] = useState<JournalTrend>({
    headline: "",
    themes: [],
    methodologyShift: "",
    clinicalImplication: "",
    narrationScript: "",
  });
  const [periodLabel, setPeriodLabel] = useState<string>("");
  const [isComplete, setIsComplete] = useState<boolean>(false);
  const [skipped, setSkipped] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWithKeys = useFetchWithKeys();
  const fetchKey = `${issn}::trend::${year}::${quarter}`;
  const yearOptions = buildYearOptions();

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError(null);
    setSkipped(null);
    setTrend({
      headline: "",
      themes: [],
      methodologyShift: "",
      clinicalImplication: "",
      narrationScript: "",
    });

    (async () => {
      try {
        const params = new URLSearchParams({
          issn,
          journalName,
          year: String(year),
          quarter,
        });
        const res = await fetchWithKeys(
          `/api/journal/trend?${params.toString()}`,
          { signal: controller.signal }
        );
        const skippedHeader = res.headers.get("x-trend-skipped");
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
          return;
        }
        setPapers(json.papers);
        setTotal(json.total);
        setTrend(json.trend);
        setPeriodLabel(json.periodLabel);
        setIsComplete(json.isComplete);
        if (skippedHeader) setSkipped(skippedHeader);
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
  }, [fetchKey, issn, journalName, year, quarter, fetchWithKeys]);

  return (
    <section className="flex flex-col gap-4">
      {/* 연도 탭 + 분기 버튼 */}
      <div className="flex flex-col gap-2 rounded-2xl border border-paperis-border bg-paperis-surface p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-paperis-text-3">연도</span>
          {yearOptions.map((y) => {
            const active = year === y;
            return (
              <button
                key={y}
                type="button"
                onClick={() => setYear(y)}
                className={[
                  "rounded-md border px-2.5 py-1 text-xs transition",
                  active
                    ? "border-paperis-accent bg-paperis-accent text-paperis-bg"
                    : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3",
                ].join(" ")}
              >
                {y}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-paperis-text-3">기간</span>
          {QUARTERS.map((opt) => {
            const active = quarter === opt.v;
            const future = isFutureQuarter(year, opt.v);
            return (
              <button
                key={opt.v}
                type="button"
                onClick={() => setQuarter(opt.v)}
                disabled={future}
                title={future ? "아직 시작 전입니다" : opt.label}
                className={[
                  "rounded-md border px-2.5 py-1 text-xs transition",
                  active
                    ? "border-paperis-accent bg-paperis-accent text-paperis-bg"
                    : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3",
                  future ? "cursor-not-allowed opacity-30" : "",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {periodLabel ? (
          <p className="mt-1 text-xs text-paperis-text-3">
            {periodLabel} · {total.toLocaleString()}건 분석 대상 (상위{" "}
            {papers.length}건 표시)
            {isComplete ? null : (
              <span className="ml-1 text-paperis-accent">(진행 중)</span>
            )}
          </p>
        ) : null}
      </div>

      {/* 트렌드 카드 */}
      {loading && trend.themes.length === 0 ? (
        <div className="rounded-2xl border border-paperis-border bg-paperis-surface p-5">
          <div className="h-5 w-3/5 animate-pulse rounded bg-paperis-surface-2" />
          <div className="mt-4 space-y-3">
            <div className="h-4 w-11/12 animate-pulse rounded bg-paperis-border" />
            <div className="h-4 w-9/12 animate-pulse rounded bg-paperis-border" />
            <div className="h-4 w-10/12 animate-pulse rounded bg-paperis-border" />
          </div>
          <p className="mt-4 text-xs text-paperis-text-3">
            Gemini가 abstract 모음을 themes 단위로 분석 중… 30~90초 정도 걸립니다.
          </p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-sm text-paperis-accent">
          {error}
        </div>
      ) : skipped ? (
        <div className="rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-8 text-center text-sm text-paperis-text-3">
          이 기간에는 분석할 논문이 충분하지 않습니다 ({total}건).
          <p className="mt-1 text-xs text-paperis-text-3">
            연간(all)으로 보거나 다른 분기를 선택해보세요.
          </p>
        </div>
      ) : trend.themes.length > 0 ? (
        <article className="space-y-5 rounded-2xl border border-paperis-border bg-paperis-surface p-5">
          {trend.headline ? (
            <p className="font-serif text-lg font-medium leading-snug tracking-tight text-paperis-text">
              {trend.headline}
            </p>
          ) : null}

          <ul className="space-y-3.5">
            {trend.themes.map((t, i) => (
              <li
                key={i}
                className="rounded-xl border border-paperis-border bg-paperis-surface-2 p-3.5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${DIRECTION_COLOR[t.direction] ?? DIRECTION_COLOR.ongoing}`}
                  >
                    {DIRECTION_LABEL[t.direction] ?? DIRECTION_LABEL.ongoing}
                  </span>
                  <span className="font-serif text-sm font-medium text-paperis-text">
                    {t.topic}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-paperis-text-2">
                  {t.insight}
                </p>
                {t.representativePmids.length > 0 ? (
                  <p className="mt-2 text-[11px] text-paperis-text-3">
                    대표 논문 PMID:{" "}
                    {t.representativePmids.map((pmid, idx) => (
                      <span key={pmid}>
                        {idx > 0 ? ", " : ""}
                        <button
                          type="button"
                          onClick={() => jumpToPaper(pmid)}
                          title="페이지 내 논문 카드로 이동 (없으면 PubMed 새 탭)"
                          className="cursor-pointer rounded font-mono underline transition hover:text-paperis-text"
                        >
                          {pmid}
                        </button>
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>

          {trend.methodologyShift ? (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
                방법론 변화
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-paperis-text-2">
                {trend.methodologyShift}
              </p>
            </div>
          ) : null}

          {trend.clinicalImplication ? (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
                임상 시사점
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-paperis-text-2">
                {trend.clinicalImplication}
              </p>
            </div>
          ) : null}

          {trend.narrationScript ? (
            <div className="space-y-3">
              <TrendTtsButton
                narrationScript={trend.narrationScript}
                issn={issn}
                journalName={journalName}
                year={year}
                quarter={quarter}
                periodLabel={periodLabel}
                headline={trend.headline}
              />
              <details className="group rounded-lg border border-paperis-border bg-paperis-surface">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="text-paperis-text-2">
                    📻 트렌드 브리핑 스크립트 (
                    {trend.narrationScript.length.toLocaleString()}자)
                  </span>
                  <span className="text-xs text-paperis-text-3 group-open:hidden">
                    펼치기
                  </span>
                  <span className="hidden text-xs text-paperis-text-3 group-open:inline">
                    접기
                  </span>
                </summary>
                <div className="border-t border-paperis-border px-3 py-3">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-paperis-text-2">
                    {trend.narrationScript}
                  </p>
                </div>
              </details>
            </div>
          ) : null}

          <p className="text-[11px] text-paperis-text-3">
            아래는 분석 대상이 된 논문들 — 카드를 누르면 풀텍스트·요약·TTS로 바로
            들어갑니다.
          </p>
        </article>
      ) : !loading && papers.length > 0 ? (
        <div className="rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-8 text-center text-sm text-paperis-text-3">
          이 기간에는 themes를 추출할 만큼의 패턴이 보이지 않습니다.
        </div>
      ) : null}

      <JournalPaperList
        papers={papers}
        loading={loading && papers.length === 0}
        error={null}
        fetchKey={fetchKey}
      />
    </section>
  );
}
