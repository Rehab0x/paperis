"use client";

import type { FullTextSource } from "@/types";

interface Props {
  text: string;
  source: FullTextSource;
  sourceUrl?: string | null;
  charCount: number;
}

const SOURCE_LABEL: Record<FullTextSource, string> = {
  unpaywall: "Unpaywall (OA)",
  openalex: "OpenAlex (OA)",
  europepmc: "Europe PMC",
  pmc: "PMC",
  s2: "Semantic Scholar (OA)",
  medrxiv: "medRxiv 프리프린트",
  pdf: "업로드 PDF",
};

/** 본문이 최종 출판본이 아닌 경우 사용자에게 명시할 안내 */
const SOURCE_CAVEAT: Partial<Record<FullTextSource, string>> = {
  medrxiv:
    "⚠ 프리프린트(peer review 전) 버전입니다 — 최종 출판본과 내용이 다를 수 있습니다.",
};

const PREVIEW_CHARS = 1200;

export default function FullTextView({
  text,
  source,
  sourceUrl,
  charCount,
}: Props) {
  const long = text.length > PREVIEW_CHARS;
  return (
    <details className="group rounded-lg border border-paperis-border bg-paperis-surface">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="rounded bg-paperis-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-paperis-text-2">
            {SOURCE_LABEL[source]}
          </span>
          <span className="text-paperis-text-2">
            본문 {charCount.toLocaleString()}자 확보
          </span>
        </span>
        <span className="text-xs text-paperis-text-3 group-open:hidden">펼치기</span>
        <span className="hidden text-xs text-paperis-text-3 group-open:inline">접기</span>
      </summary>
      <div className="border-t border-paperis-border px-3 py-3 text-sm leading-relaxed">
        {SOURCE_CAVEAT[source] ? (
          <p className="mb-2 rounded-md border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-xs text-paperis-accent">
            {SOURCE_CAVEAT[source]}
          </p>
        ) : null}
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 inline-block text-xs text-paperis-text-3 underline transition hover:text-paperis-text"
          >
            원문 보기 ↗
          </a>
        ) : null}
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] text-paperis-text-2">
          {long ? text.slice(0, PREVIEW_CHARS) + "\n\n…" : text}
        </pre>
        {long ? (
          <p className="mt-2 text-xs text-paperis-text-3">
            (위는 미리보기 — 요약/TTS는 전체 본문을 사용합니다)
          </p>
        ) : null}
      </div>
    </details>
  );
}
