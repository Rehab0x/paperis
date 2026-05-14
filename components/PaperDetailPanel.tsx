"use client";

import { useEffect, useRef, useState } from "react";
import FullTextView from "@/components/FullTextView";
import PdfUpload from "@/components/PdfUpload";
import TtsButton from "@/components/TtsButton";
import { useAppMessages } from "@/components/useAppMessages";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { useLocale } from "@/components/useLocale";
import { fmt } from "@/lib/i18n";
import type {
  FullTextAttempt,
  FullTextResponse,
  FullTextSource,
  Paper,
  SummarizeReadRequest,
} from "@/types";

interface Props {
  paper: Paper;
  /** 모바일/좁은 화면에서 결과 목록으로 돌아가기 (lg+ 에서는 표시 안 됨) */
  onBack?: () => void;
}

interface FullTextState {
  status: "idle" | "loading" | "ready" | "missing";
  text: string;
  source: FullTextSource | null;
  sourceUrl?: string | null;
  charCount: number;
  attempted: FullTextAttempt[];
}

const initial: FullTextState = {
  status: "idle",
  text: "",
  source: null,
  charCount: 0,
  attempted: [],
};

const SOURCE_LABEL: Record<FullTextSource, string> = {
  unpaywall: "Unpaywall full text",
  openalex: "OpenAlex OA full text",
  europepmc: "Europe PMC full text",
  pmc: "PMC full text",
  s2: "Semantic Scholar OA PDF",
  medrxiv: "medRxiv preprint (not peer-reviewed)",
  pdf: "User-uploaded PDF",
};

export default function PaperDetailPanel({ paper, onBack }: Props) {
  const m = useAppMessages();
  const locale = useLocale();
  const [ft, setFt] = useState<FullTextState>(initial);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // 풀텍스트 ready일 때 입력 source 선택 — default = fulltext (정보 풍부).
  // abstract도 선택 가능해야 한다는 사용자 요구: 우리 앱 포인트는 짧은 청취라
  // 풀텍스트가 있어도 abstract만 듣고 싶을 때가 있음.
  const [summarySource, setSummarySource] = useState<"fulltext" | "abstract">(
    "fulltext"
  );

  const summaryAbortRef = useRef<AbortController | null>(null);
  const fetchWithKeys = useFetchWithKeys();

  // 새 논문 선택 시 풀텍스트 자동 시도.
  // key={pmid}로 부모가 remount를 보장하므로 별도 dedupe ref 불필요.
  // 오히려 그런 가드를 두면 React 19/Next 16 Strict Mode의 mount→cleanup→mount 루틴에서
  // 두 번째 mount가 가드에 막혀 fetch가 새로 안 일어나고, 첫 mount의 응답은 cancelled=true로 버려져
  // status=loading이 영원히 안 풀린다.
  useEffect(() => {
    setFt({ ...initial, status: "loading" });
    setSummary("");
    setSummaryError(null);
    summaryAbortRef.current?.abort();

    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithKeys("/api/fulltext", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            pmid: paper.pmid,
            doi: paper.doi,
            pmcId: paper.pmcId,
          }),
        });
        const json = (await res.json()) as FullTextResponse;
        if (cancelled) return;
        if (json.ok) {
          setFt({
            status: "ready",
            text: json.text,
            source: json.source,
            sourceUrl: json.sourceUrl,
            charCount: json.charCount,
            attempted: [],
          });
        } else {
          setFt({
            status: "missing",
            text: "",
            source: null,
            charCount: 0,
            attempted: json.attempted,
          });
        }
      } catch (err) {
        if (cancelled) return;
        console.warn("[paperis] fulltext error", err);
        setFt({
          status: "missing",
          text: "",
          source: null,
          charCount: 0,
          attempted: [],
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [paper.pmid, paper.doi, paper.pmcId]);

  function handlePdfExtracted(text: string) {
    setFt({
      status: "ready",
      text,
      source: "pdf",
      sourceUrl: null,
      charCount: text.length,
      attempted: [],
    });
  }

  async function handleSummarize() {
    setSummarizing(true);
    setSummary("");
    setSummaryError(null);

    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;

    // 사용자가 abstract를 선택했거나 풀텍스트 미확보면 abstract 기반.
    // 그 외(풀텍스트 ready + summarySource="fulltext")만 fullText 전달.
    const useFullText =
      ft.status === "ready" && summarySource === "fulltext";
    const sourceLabel =
      useFullText && ft.source ? SOURCE_LABEL[ft.source] : undefined;
    const fullText = useFullText ? ft.text : null;

    const body: SummarizeReadRequest & { fullText?: string } = {
      paper,
      language: locale,
      sourceLabel,
      ...(fullText ? { fullText } : {}),
    };

    try {
      const res = await fetchWithKeys("/api/summarize/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        setSummaryError(txt || `${m.detail.summaryFailed} (${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        setSummary(buf);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setSummaryError(err instanceof Error ? err.message : m.detail.summaryFailed);
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-paperis-border bg-paperis-surface p-5 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-auto">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 rounded-lg border border-paperis-border px-2 py-1 text-xs text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text lg:hidden"
        >
          {m.detail.backToResults}
        </button>
      ) : null}
      <h2 className="font-serif text-lg font-medium leading-snug tracking-tight text-paperis-text">
        {paper.title}
      </h2>
      <p className="mt-1 text-xs text-paperis-text-3">
        {paper.journal} · {paper.year} · PMID {paper.pmid}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border border-paperis-border px-2 py-1 text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
        >
          PubMed ↗
        </a>
        {paper.doi ? (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-paperis-border px-2 py-1 text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
          >
            DOI ↗
          </a>
        ) : null}
      </div>

      {/* Abstract 원문 — 사용자가 TTS·요약 받기 전에 원문을 가독성 있게 확인할 수
          있도록. PubMed abstract는 보통 단일 paragraph 또는 OBJECTIVE/METHODS/...
          구조의 줄바꿈 텍스트. whitespace-pre-line + 단락 split으로 둘 다 자연스러움. */}
      <section className="mt-4 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          {m.detail.abstract}
        </h3>
        {paper.abstract ? (
          <details className="group rounded-lg border border-paperis-border bg-paperis-surface" open>
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] text-paperis-text-3 transition hover:text-paperis-text">
              <span className="group-open:hidden">{m.fulltextView.expand}</span>
              <span className="hidden group-open:inline">{m.fulltextView.collapse}</span>
            </summary>
            <div className="max-h-[40vh] space-y-3 overflow-auto border-t border-paperis-border px-3 py-3 text-sm leading-relaxed text-paperis-text-2">
              {paper.abstract
                .split(/\n\s*\n/)
                .map((p) => p.trim())
                .filter(Boolean)
                .map((para, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {para}
                  </p>
                ))}
            </div>
          </details>
        ) : (
          <p className="rounded-lg border border-paperis-border bg-paperis-surface-2 px-3 py-2 text-xs italic text-paperis-text-3">
            {m.detail.abstractEmpty}
          </p>
        )}
      </section>

      <section className="mt-4 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          {m.detail.fulltext}
        </h3>
        {ft.status === "loading" ? (
          <div className="rounded-lg border border-paperis-border bg-paperis-surface-2 p-3 text-xs text-paperis-text-3">
            {m.detail.fulltextSearching}
          </div>
        ) : ft.status === "ready" ? (
          <FullTextView
            text={ft.text}
            source={ft.source as FullTextSource}
            sourceUrl={ft.sourceUrl ?? undefined}
            charCount={ft.charCount}
          />
        ) : ft.status === "missing" ? (
          <div className="space-y-2">
            <FullTextDiagnostic attempts={ft.attempted} />
            <PdfUpload onExtracted={handlePdfExtracted} />
          </div>
        ) : null}
      </section>

      <section className="mt-5 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
            {m.detail.longSummary}
          </h3>
          <button
            type="button"
            onClick={handleSummarize}
            disabled={summarizing}
            className="rounded-lg bg-paperis-accent px-2.5 py-1 text-xs font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {summarizing ? m.detail.summarizing : summary ? m.detail.regenerate : m.detail.startSummary}
          </button>
        </div>
        {/* 풀텍스트 ready 상태일 때만 입력 source 토글 노출. abstract만 있으면
            선택지가 abstract 하나라 토글 의미 X. 토글은 긴 요약·청취 둘 다 영향. */}
        {ft.status === "ready" ? (
          <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-paperis-border bg-paperis-surface p-1 text-[11px]">
            <button
              type="button"
              onClick={() => setSummarySource("fulltext")}
              className={[
                "rounded-md px-2 py-0.5 transition",
                summarySource === "fulltext"
                  ? "bg-paperis-accent text-paperis-bg"
                  : "text-paperis-text-2 hover:bg-paperis-surface-2",
              ].join(" ")}
            >
              {m.detail.useFullText}
            </button>
            <button
              type="button"
              onClick={() => setSummarySource("abstract")}
              className={[
                "rounded-md px-2 py-0.5 transition",
                summarySource === "abstract"
                  ? "bg-paperis-accent text-paperis-bg"
                  : "text-paperis-text-2 hover:bg-paperis-surface-2",
              ].join(" ")}
            >
              {m.detail.useAbstract}
            </button>
          </div>
        ) : null}
        {summaryError ? (
          <div className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/30 p-2 text-xs text-paperis-accent">
            {summaryError}
          </div>
        ) : null}
        {summary ? (
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-paperis-border bg-paperis-surface-2 p-3 font-sans text-[13px] leading-relaxed text-paperis-text">
            {summary}
          </pre>
        ) : !summarizing ? (
          <p className="text-xs text-paperis-text-3">
            {ft.status === "ready" && summarySource === "fulltext"
              ? fmt(m.detail.summaryBasedOn, {
                  label: SOURCE_LABEL[ft.source as FullTextSource],
                })
              : m.detail.summaryAbstractOnly}
          </p>
        ) : null}
      </section>

      <section className="mt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          {m.detail.listen}
        </h3>
        <div className="mt-2">
          <TtsButton
            paper={paper}
            language={locale}
            fullText={
              ft.status === "ready" && summarySource === "fulltext"
                ? ft.text
                : null
            }
            sourceLabel={
              ft.status === "ready" &&
              summarySource === "fulltext" &&
              ft.source
                ? SOURCE_LABEL[ft.source]
                : undefined
            }
          />
          <p className="mt-2 text-[11px] text-paperis-text-3">
            {m.detail.listenHint}
          </p>
        </div>
      </section>
    </div>
  );
}

function FullTextDiagnostic({ attempts }: { attempts: FullTextAttempt[] }) {
  const m = useAppMessages();
  if (attempts.length === 0) return null;
  return (
    <div className="rounded-lg border border-paperis-border bg-paperis-surface-2 p-3 text-xs">
      <p className="mb-1.5 font-medium text-paperis-text">
        {m.detail.fulltextFailed}
      </p>
      <ul className="space-y-1 text-paperis-text-3">
        {attempts.map((a, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-[10px] uppercase text-paperis-text-3">
              {SOURCE_LABEL[a.source]}
            </span>
            <span className="flex-1">
              {a.skipReason ? (
                <span>⊘ {a.skipReason}</span>
              ) : a.failReason ? (
                <span>× {a.failReason}</span>
              ) : (
                <span>—</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
