"use client";

// 저널 주제 탐색 — 추천 태그(저널 임상과의 suggestedTopics) + 자유 입력.
// 입력 → /api/journal/topic 호출 → JournalPaperList로 master-detail 렌더.

import { FormEvent, useEffect, useState } from "react";
import JournalPaginationView from "@/components/JournalPagination";
import JournalPaperList from "@/components/JournalPaperList";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import type { Paper } from "@/types";

interface Props {
  issn: string;
  journalName: string;
  /** 임상과 카탈로그의 추천 태그 — 빠른 진입용. referrer 임상과 없으면 빈 배열 */
  suggestedTopics: string[];
  /** 추천 태그가 어느 임상과 기준인지 표시 (UX 명료성). null이면 표시 안 함 */
  specialtyName?: string | null;
}

interface TopicResponse {
  query: string;
  papers: Paper[];
  total: number;
  topic: string;
  issn: string;
}

const PAGE_SIZE = 20;

export default function TopicExplorer({
  issn,
  journalName,
  suggestedTopics,
  specialtyName,
}: Props) {
  const [input, setInput] = useState("");
  const [submittedTopic, setSubmittedTopic] = useState<string>("");
  const [page, setPage] = useState(1);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWithKeys = useFetchWithKeys();
  const fetchKey = `${issn}::topic::${submittedTopic}::${page}`;

  // 새 topic 또는 issn 변경 시 첫 페이지로
  useEffect(() => {
    setPage(1);
  }, [issn, submittedTopic]);

  // dedupe ref 가드는 의도적으로 사용하지 않는다 — Strict Mode mount cycle에서 무한
  // loading 발생 (PaperDetailPanel 패턴 동일). cancelled flag + AbortController로 충분.
  useEffect(() => {
    if (!submittedTopic) {
      setPapers([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const params = new URLSearchParams({
          issn,
          topic: submittedTopic,
          retmax: String(PAGE_SIZE),
          retstart: String((page - 1) * PAGE_SIZE),
        });
        const res = await fetchWithKeys(
          `/api/journal/topic?${params.toString()}`,
          { signal: controller.signal }
        );
        const rawText = await res.text();
        let json: TopicResponse | { error?: string } | null = null;
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
                ? `주제 검색 실패 (${res.status}): ${rawText.slice(0, 240)}`
                : `주제 검색 실패 (${res.status})`;
          setError(msg);
          setPapers([]);
          setTotal(0);
          return;
        }
        setPapers(json.papers);
        setTotal(json.total);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "주제 검색 실패");
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
  }, [fetchKey, issn, submittedTopic, page, fetchWithKeys]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showFrom = total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const showTo = total > 0 ? (page - 1) * PAGE_SIZE + papers.length : 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    setSubmittedTopic(trimmed);
  }

  function pickSuggested(topic: string) {
    setInput(topic);
    setSubmittedTopic(topic);
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: spasticity, post-stroke gait, Botox"
            maxLength={200}
            className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-700"
          >
            {loading ? "검색 중…" : "주제 검색"}
          </button>
        </form>
        {suggestedTopics.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="self-center text-xs text-zinc-400">
              {specialtyName ? `${specialtyName} 추천:` : "추천:"}
            </span>
            {suggestedTopics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pickSuggested(t)}
                className={[
                  "rounded-full border px-2.5 py-0.5 text-xs transition",
                  submittedTopic === t
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-600",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
        {!loading && submittedTopic && total > 0 ? (
          <p className="mt-3 text-xs text-zinc-500">
            {journalName} · 주제 “{submittedTopic}” — {total.toLocaleString()}건
            중 {showFrom}–{showTo}건 표시
          </p>
        ) : null}
      </div>

      {!submittedTopic ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
          위 입력창에 키워드를 넣거나 추천 태그를 누르세요.
        </div>
      ) : (
        <JournalPaperList
          papers={papers}
          loading={loading}
          error={error}
          fetchKey={fetchKey}
          emptyMessage={
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
              <p>“{submittedTopic}” 주제로 매칭되는 논문이 없습니다.</p>
              <p className="mt-1 text-xs text-zinc-400">
                다른 키워드를 시도하거나 추천 태그를 눌러보세요.
              </p>
            </div>
          }
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
      )}
    </section>
  );
}
