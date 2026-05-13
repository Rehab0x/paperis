"use client";

// 저널 주제 탐색 — 추천 태그(저널 임상과의 suggestedTopics) + 자유 입력.
// 입력 → /api/journal/topic 호출 (전체 100건까지) → JournalPaperList가 클라
// 페이지네이션 + OA 우선 정렬.

import { FormEvent, useEffect, useState } from "react";
import JournalPaperList from "@/components/JournalPaperList";
import { useAppMessages } from "@/components/useAppMessages";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { fmt } from "@/lib/i18n";
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

// 한 번에 받을 최대치. PubMed efetch cap 200까지 가능하나 Gemini 미니요약/auto
// batch 부담 감안해 100으로.
const FETCH_LIMIT = 100;

export default function TopicExplorer({
  issn,
  journalName,
  suggestedTopics,
  specialtyName,
}: Props) {
  const m = useAppMessages();
  const [input, setInput] = useState("");
  const [submittedTopic, setSubmittedTopic] = useState<string>("");
  const [papers, setPapers] = useState<Paper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWithKeys = useFetchWithKeys();
  const fetchKey = `${issn}::topic::${submittedTopic}`;

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
          retmax: String(FETCH_LIMIT),
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
                ? `${fmt(m.journal.topic.failedStatus, { status: res.status })}: ${rawText.slice(0, 240)}`
                : fmt(m.journal.topic.failedStatus, { status: res.status });
          setError(msg);
          setPapers([]);
          setTotal(0);
          return;
        }
        setPapers(json.papers);
        setTotal(json.total);
      } catch (err) {
        if (cancelled || (err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : m.journal.topic.failed);
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
  }, [fetchKey, issn, submittedTopic, fetchWithKeys]);

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
      <div className="rounded-2xl border border-paperis-border bg-paperis-surface p-4">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={m.journal.topic.placeholder}
            maxLength={200}
            className="min-w-0 flex-1 rounded-lg border border-paperis-border bg-paperis-surface px-3 py-2 text-sm text-paperis-text placeholder:text-paperis-text-3"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-paperis-accent px-4 py-2 text-sm font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? m.journal.topic.searching : m.journal.topic.search}
          </button>
        </form>
        {suggestedTopics.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <span className="self-center text-xs text-paperis-text-3">
              {specialtyName
                ? fmt(m.journal.topic.suggestedWithName, { specialtyName })
                : m.journal.topic.suggested}
            </span>
            {suggestedTopics.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => pickSuggested(t)}
                className={[
                  "rounded-full border px-2.5 py-0.5 text-xs transition",
                  submittedTopic === t
                    ? "border-paperis-accent bg-paperis-accent text-paperis-bg"
                    : "border-paperis-border text-paperis-text-2 hover:border-paperis-text-3",
                ].join(" ")}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}
        {!loading && submittedTopic && total > 0 ? (
          <p className="mt-3 text-xs text-paperis-text-3">
            {fmt(m.journal.topic.header, {
              journalName,
              topic: submittedTopic,
              total: total.toLocaleString(),
            })}{" "}
            {fmt(m.journal.topic.headerSub, { n: papers.length })}
          </p>
        ) : null}
      </div>

      {!submittedTopic ? (
        <div className="rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-8 text-center text-sm text-paperis-text-3">
          {m.journal.topic.intro}
        </div>
      ) : (
        <JournalPaperList
          papers={papers}
          loading={loading}
          error={error}
          fetchKey={fetchKey}
          emptyMessage={
            <div className="rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-8 text-center text-sm text-paperis-text-3">
              <p>{fmt(m.journal.topic.empty, { topic: submittedTopic })}</p>
              <p className="mt-1 text-xs text-paperis-text-3">
                {m.journal.topic.emptyHint}
              </p>
            </div>
          }
        />
      )}
    </section>
  );
}
