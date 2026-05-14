"use client";

import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";
import type { FullTextSource } from "@/types";

interface Props {
  text: string;
  source: FullTextSource;
  sourceUrl?: string | null;
  charCount: number;
}

const PREVIEW_CHARS = 1200;

export default function FullTextView({
  text,
  source,
  sourceUrl,
  charCount,
}: Props) {
  const m = useAppMessages();
  const SOURCE_LABEL: Record<FullTextSource, string> = {
    unpaywall: "Unpaywall (OA)",
    openalex: "OpenAlex (OA)",
    europepmc: "Europe PMC",
    pmc: "PMC",
    s2: "Semantic Scholar (OA)",
    medrxiv: m.fulltextView.sourceMedrxiv,
    pdf: m.fulltextView.sourcePdf,
  };
  const SOURCE_CAVEAT: Partial<Record<FullTextSource, string>> = {
    medrxiv: m.fulltextView.preprintWarn,
  };
  const long = text.length > PREVIEW_CHARS;
  return (
    <details className="group rounded-lg border border-paperis-border bg-paperis-surface">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="rounded bg-paperis-surface-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-paperis-text-2">
            {SOURCE_LABEL[source]}
          </span>
          <span className="text-paperis-text-2">
            {fmt(m.fulltextView.secured, { chars: charCount.toLocaleString() })}
          </span>
        </span>
        <span className="text-xs text-paperis-text-3 group-open:hidden">{m.fulltextView.expand}</span>
        <span className="hidden text-xs text-paperis-text-3 group-open:inline">{m.fulltextView.collapse}</span>
      </summary>
      <div className="border-t border-paperis-border px-3 py-3 text-sm leading-relaxed">
        {SOURCE_CAVEAT[source] ? (
          <p className="mb-2 rounded-md border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-xs text-paperis-accent">
            {SOURCE_CAVEAT[source]}
          </p>
        ) : null}
        {sourceUrl ? (() => {
          // unpaywall/s2/medrxiv는 거의 항상 PDF URL — "Download PDF" 라벨.
          // 브라우저가 cross-origin download attribute는 무시하지만, PDF URL이면
          // PDF viewer를 열고 그 안에서 다운로드 가능 (사용자 인지 부담 X).
          // openalex/europepmc/pmc는 publisher/landing 페이지일 가능성 높아 "View original".
          const isLikelyPdf =
            source === "unpaywall" || source === "s2" || source === "medrxiv";
          return (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 inline-block text-xs text-paperis-text-3 underline transition hover:text-paperis-text"
            >
              {isLikelyPdf ? m.fulltextView.downloadPdf : m.fulltextView.viewOriginal}
            </a>
          );
        })() : null}
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] text-paperis-text-2">
          {long ? text.slice(0, PREVIEW_CHARS) + "\n\n…" : text}
        </pre>
        {long ? (
          <p className="mt-2 text-xs text-paperis-text-3">
            {m.fulltextView.previewHint}
          </p>
        ) : null}
      </div>
    </details>
  );
}
