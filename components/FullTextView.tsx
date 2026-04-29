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
  europepmc: "Europe PMC",
  pmc: "PMC",
  pdf: "업로드 PDF",
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
    <details className="group rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {SOURCE_LABEL[source]}
          </span>
          <span className="text-zinc-600 dark:text-zinc-300">
            본문 {charCount.toLocaleString()}자 확보
          </span>
        </span>
        <span className="text-xs text-zinc-400 group-open:hidden">펼치기</span>
        <span className="hidden text-xs text-zinc-400 group-open:inline">접기</span>
      </summary>
      <div className="border-t border-zinc-200 px-3 py-3 text-sm leading-relaxed dark:border-zinc-800">
        {sourceUrl ? (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-2 inline-block text-xs text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            원문 보기 ↗
          </a>
        ) : null}
        <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words font-sans text-[13px] text-zinc-700 dark:text-zinc-300">
          {long ? text.slice(0, PREVIEW_CHARS) + "\n\n…" : text}
        </pre>
        {long ? (
          <p className="mt-2 text-xs text-zinc-400">
            (위는 미리보기 — 요약/TTS는 전체 본문을 사용합니다)
          </p>
        ) : null}
      </div>
    </details>
  );
}
