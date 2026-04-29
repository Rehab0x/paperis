"use client";

import { useEffect, useRef, useState } from "react";
import FullTextView from "@/components/FullTextView";
import PdfUpload from "@/components/PdfUpload";
import TtsButton from "@/components/TtsButton";
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
  europepmc: "Europe PMC full text",
  pmc: "PMC full text",
  pdf: "User-uploaded PDF",
};

export default function PaperDetailPanel({ paper, onBack }: Props) {
  const [ft, setFt] = useState<FullTextState>(initial);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const summaryAbortRef = useRef<AbortController | null>(null);

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
        const res = await fetch("/api/fulltext", {
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

    const sourceLabel =
      ft.status === "ready" && ft.source ? SOURCE_LABEL[ft.source] : undefined;
    const fullText = ft.status === "ready" ? ft.text : null;

    const body: SummarizeReadRequest & { fullText?: string } = {
      paper,
      language: "ko",
      sourceLabel,
      ...(fullText ? { fullText } : {}),
    };

    try {
      const res = await fetch("/api/summarize/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text();
        setSummaryError(txt || `요약 실패 (${res.status})`);
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
      setSummaryError(err instanceof Error ? err.message : "요약 실패");
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-auto">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 lg:hidden"
        >
          ← 결과 목록으로
        </button>
      ) : null}
      <h2 className="text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
        {paper.title}
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        {paper.journal} · {paper.year} · PMID {paper.pmid}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-zinc-200 px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          PubMed ↗
        </a>
        {paper.doi ? (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-zinc-200 px-2 py-1 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            DOI ↗
          </a>
        ) : null}
      </div>

      <section className="mt-4 space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          풀텍스트
        </h3>
        {ft.status === "loading" ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            Unpaywall → Europe PMC → PMC 순으로 본문을 찾는 중…
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
          <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            긴 요약
          </h3>
          <button
            type="button"
            onClick={handleSummarize}
            disabled={summarizing}
            className="rounded-md bg-zinc-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {summarizing ? "요약 중…" : summary ? "다시 생성" : "요약 시작"}
          </button>
        </div>
        {summaryError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            {summaryError}
          </div>
        ) : null}
        {summary ? (
          <pre className="whitespace-pre-wrap break-words rounded-lg border border-zinc-200 bg-zinc-50 p-3 font-sans text-[13px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {summary}
          </pre>
        ) : !summarizing ? (
          <p className="text-xs text-zinc-500">
            {ft.status === "ready"
              ? `${SOURCE_LABEL[ft.source as FullTextSource]} 기반으로 요약합니다.`
              : "Abstract만으로 요약합니다 (전체 본문 미확보)."}
          </p>
        ) : null}
      </section>

      <section className="mt-5">
        <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          청취
        </h3>
        <div className="mt-2">
          <TtsButton
            paper={paper}
            language="ko"
            fullText={ft.status === "ready" ? ft.text : null}
            sourceLabel={
              ft.status === "ready" && ft.source
                ? SOURCE_LABEL[ft.source]
                : undefined
            }
          />
          <p className="mt-2 text-[11px] text-zinc-400">
            변환된 트랙은 라이브러리 끝에 조용히 추가됩니다 (자동 재생 X).
          </p>
        </div>
      </section>
    </div>
  );
}

function FullTextDiagnostic({ attempts }: { attempts: FullTextAttempt[] }) {
  if (attempts.length === 0) return null;
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs dark:border-zinc-800 dark:bg-zinc-900">
      <p className="mb-1.5 font-medium text-zinc-700 dark:text-zinc-200">
        풀텍스트 자동 확보 실패 — 단계별 결과:
      </p>
      <ul className="space-y-1 text-zinc-500">
        {attempts.map((a, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-[10px] uppercase text-zinc-400">
              {SOURCE_LABEL[a.source]}
            </span>
            <span className="flex-1">
              {a.skipReason ? (
                <span className="text-zinc-500">⊘ {a.skipReason}</span>
              ) : a.failReason ? (
                <span className="text-zinc-500">× {a.failReason}</span>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
