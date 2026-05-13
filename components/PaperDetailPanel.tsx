"use client";

import { useEffect, useRef, useState } from "react";
import FullTextView from "@/components/FullTextView";
import PdfUpload from "@/components/PdfUpload";
import TtsButton from "@/components/TtsButton";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { useLocale } from "@/components/useLocale";
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
  const locale = useLocale();
  const [ft, setFt] = useState<FullTextState>(initial);
  const [summary, setSummary] = useState<string>("");
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

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

    const sourceLabel =
      ft.status === "ready" && ft.source ? SOURCE_LABEL[ft.source] : undefined;
    const fullText = ft.status === "ready" ? ft.text : null;

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
    <div className="rounded-2xl border border-paperis-border bg-paperis-surface p-5 lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-auto">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1 rounded-lg border border-paperis-border px-2 py-1 text-xs text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text lg:hidden"
        >
          ← 결과 목록으로
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

      <section className="mt-4 space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          풀텍스트
        </h3>
        {ft.status === "loading" ? (
          <div className="rounded-lg border border-paperis-border bg-paperis-surface-2 p-3 text-xs text-paperis-text-3">
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
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
            긴 요약
          </h3>
          <button
            type="button"
            onClick={handleSummarize}
            disabled={summarizing}
            className="rounded-lg bg-paperis-accent px-2.5 py-1 text-xs font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {summarizing ? "요약 중…" : summary ? "다시 생성" : "요약 시작"}
          </button>
        </div>
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
            {ft.status === "ready"
              ? `${SOURCE_LABEL[ft.source as FullTextSource]} 기반으로 요약합니다.`
              : "Abstract만으로 요약합니다 (전체 본문 미확보)."}
          </p>
        ) : null}
      </section>

      <section className="mt-5">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-2">
          청취
        </h3>
        <div className="mt-2">
          <TtsButton
            paper={paper}
            language={locale}
            fullText={ft.status === "ready" ? ft.text : null}
            sourceLabel={
              ft.status === "ready" && ft.source
                ? SOURCE_LABEL[ft.source]
                : undefined
            }
          />
          <p className="mt-2 text-[11px] text-paperis-text-3">
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
    <div className="rounded-lg border border-paperis-border bg-paperis-surface-2 p-3 text-xs">
      <p className="mb-1.5 font-medium text-paperis-text">
        풀텍스트 자동 확보 실패 — 단계별 결과:
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
