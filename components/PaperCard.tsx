"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AudioPlayer from "./AudioPlayer";
import PdfUpload from "./PdfUpload";
import {
  defaultCardState,
  getCardState,
  setCardState,
  type AudioState,
  type PdfAttachment,
  type RelatedState,
} from "@/lib/card-cache";
import type {
  Language,
  ListenStyle,
  Paper,
  RelatedResponse,
} from "@/types";

const MAX_RELATED_DEPTH = 2;

interface Props {
  paper: Paper;
  rank: number;
  /** AI 추천 선정 시 이유. 없으면 추천 아님. */
  recommendationReason?: string;
  /** 추천 순위(1,2,3). 선택된 경우만. */
  recommendationRank?: number;
  /** 연결 학습 중첩 깊이. 최상위=0, 그 이하 1,2. */
  depth?: number;
  /** compact=true면 상세 섹션(요약/듣기/연결학습/PDF) 숨기고 목록 전용으로 */
  compact?: boolean;
  /** compact 카드 클릭 시 호출. 상세 패널 선택 용. */
  onSelect?: () => void;
}

function formatAuthors(authors: string[]): string {
  if (authors.length === 0) return "저자 정보 없음";
  if (authors.length <= 3) return authors.join(", ");
  return `${authors.slice(0, 3).join(", ")} 외 ${authors.length - 3}명`;
}

export default function PaperCard({
  paper,
  rank,
  recommendationReason,
  recommendationRank,
  depth = 0,
  compact = false,
  onSelect,
}: Props) {
  // 같은 pmid가 remount 되면 마지막 세션 상태에서 복원
  const seed = useMemo(
    () => getCardState(paper.pmid) ?? defaultCardState,
    [paper.pmid]
  );

  const [expanded, setExpanded] = useState(seed.expanded);
  const isRecommended = Boolean(recommendationReason);
  const canExploreRelated = depth < MAX_RELATED_DEPTH;
  const [language, setLanguage] = useState<Language>(seed.language);
  const [summary, setSummary] = useState<string>(seed.summary);
  const [summaryStatus, setSummaryStatus] = useState<typeof seed.summaryStatus>(
    // streaming 상태는 unmount로 이미 끊겼을 가능성이 높음 → idle로 복원
    seed.summaryStatus === "streaming" ? "idle" : seed.summaryStatus
  );
  const [summaryError, setSummaryError] = useState<string>(seed.summaryError);
  const abortRef = useRef<AbortController | null>(null);

  const [audio, setAudio] = useState<AudioState | null>(seed.audio);
  const [audioStatus, setAudioStatus] = useState<typeof seed.audioStatus>(
    seed.audioStatus === "generating" ? "idle" : seed.audioStatus
  );
  const [audioError, setAudioError] = useState<string>(seed.audioError);
  const [pendingStyle, setPendingStyle] = useState<ListenStyle | null>(
    seed.pendingStyle
  );
  const audioAbortRef = useRef<AbortController | null>(null);

  const [relatedOpen, setRelatedOpen] = useState(seed.relatedOpen);
  const [relatedHint, setRelatedHint] = useState(seed.relatedHint);
  const [relatedStatus, setRelatedStatus] = useState<typeof seed.relatedStatus>(
    seed.relatedStatus === "loading" ? "idle" : seed.relatedStatus
  );
  const [related, setRelated] = useState<RelatedState | null>(seed.related);
  const [relatedError, setRelatedError] = useState<string>(seed.relatedError);
  const relatedAbortRef = useRef<AbortController | null>(null);

  // PDF 업로드로 받아온 full text. 세션 한정(서버에 저장되지 않음).
  const [pdfAttachment, setPdfAttachment] = useState<PdfAttachment | null>(
    seed.pdfAttachment
  );

  // PDF가 연결되면 abstract 자리에 full text를 꽂아 downstream 호출에 사용.
  const effectivePaper: Paper = useMemo(
    () =>
      pdfAttachment
        ? { ...paper, abstract: pdfAttachment.text, access: "open" }
        : paper,
    [paper, pdfAttachment]
  );

  // 상태가 바뀔 때마다 캐시에 스냅샷. remount 시 seed로 복원됨.
  useEffect(() => {
    setCardState(paper.pmid, {
      expanded,
      language,
      summary,
      summaryStatus,
      summaryError,
      audio,
      audioStatus,
      audioError,
      pendingStyle,
      relatedOpen,
      relatedHint,
      relatedStatus,
      related,
      relatedError,
      pdfAttachment,
    });
  }, [
    paper.pmid,
    expanded,
    language,
    summary,
    summaryStatus,
    summaryError,
    audio,
    audioStatus,
    audioError,
    pendingStyle,
    relatedOpen,
    relatedHint,
    relatedStatus,
    related,
    relatedError,
    pdfAttachment,
  ]);

  // unmount 시 in-flight 요청만 중단. 오디오 blob URL은 유지해 remount 때 재생 가능.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      audioAbortRef.current?.abort();
      relatedAbortRef.current?.abort();
    };
  }, []);

  const hasAbstract = paper.abstract.length > 0;
  const shortAbstract =
    paper.abstract.length > 320
      ? paper.abstract.slice(0, 320).trimEnd() + "…"
      : paper.abstract;

  async function generateSummary(lang: Language) {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLanguage(lang);
    setSummary("");
    setSummaryError("");
    setSummaryStatus("streaming");

    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper: effectivePaper, mode: "read", language: lang }),
        signal: ac.signal,
      });

      if (!res.ok || !res.body) {
        const fallback = await res.text().catch(() => "");
        throw new Error(fallback || `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setSummary(acc);
      }
      acc += decoder.decode();

      // 서버가 스트림 도중 실패 시 '[요약 중단] <메시지>'를 append함.
      // 성공 텍스트와 에러 메시지를 분리해서 표시한다.
      const markerIdx = acc.indexOf("[요약 중단]");
      if (markerIdx >= 0) {
        const successText = acc.slice(0, markerIdx).trimEnd();
        const errText = acc.slice(markerIdx + "[요약 중단]".length).trim();
        setSummary(successText);
        setSummaryError(errText || "요약 생성이 중단되었습니다.");
        setSummaryStatus("error");
        return;
      }

      setSummary(acc);
      setSummaryStatus("done");
    } catch (err) {
      if (ac.signal.aborted) return;
      setSummaryError(err instanceof Error ? err.message : "요약 생성 실패");
      setSummaryStatus("error");
    }
  }

  function stopSummary() {
    abortRef.current?.abort();
    setSummaryStatus(summary ? "done" : "idle");
  }

  async function generateAudio(style: ListenStyle, lang: Language) {
    audioAbortRef.current?.abort();
    const ac = new AbortController();
    audioAbortRef.current = ac;

    if (audio?.url) URL.revokeObjectURL(audio.url);
    setAudio(null);
    setAudioError("");
    setAudioStatus("generating");
    setPendingStyle(style);

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper: effectivePaper, style, language: lang }),
        signal: ac.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && typeof data === "object" && "error" in data
            ? String((data as { error: string }).error)
            : "") || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const scriptPreview = decodeURIComponent(
        res.headers.get("X-Paperis-Script-Preview") ?? ""
      );
      setAudio({ url, style, language: lang, scriptPreview });
      setAudioStatus("ready");
      setPendingStyle(null);
    } catch (err) {
      if (ac.signal.aborted) {
        setAudioStatus("idle");
        setPendingStyle(null);
        return;
      }
      setAudioError(err instanceof Error ? err.message : "오디오 생성 실패");
      setAudioStatus("error");
      // pendingStyle은 유지 — '다시 시도' 버튼이 올바른 스타일로 재시도하도록
    }
  }

  function cancelAudio() {
    audioAbortRef.current?.abort();
  }

  async function fetchRelated() {
    relatedAbortRef.current?.abort();
    const ac = new AbortController();
    relatedAbortRef.current = ac;

    const hint = relatedHint.trim() || undefined;
    const excludePmids = [
      paper.pmid,
      ...(related?.papers.map((p) => p.pmid) ?? []),
    ];

    setRelatedStatus("loading");
    setRelatedError("");

    try {
      const res = await fetch("/api/related", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper: effectivePaper, hint, excludePmids }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg =
          (data && typeof data === "object" && "error" in data
            ? String((data as { error: string }).error)
            : "") || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const data = (await res.json()) as RelatedResponse;
      setRelated({
        query: data.query,
        note: data.note,
        papers: data.papers,
      });
      setRelatedStatus(data.papers.length > 0 ? "ready" : "error");
      if (data.papers.length === 0) {
        setRelatedError("검색 결과가 없습니다. 다른 힌트로 시도해 보세요.");
      }
    } catch (err) {
      if (ac.signal.aborted) {
        setRelatedStatus("idle");
        return;
      }
      setRelatedError(err instanceof Error ? err.message : "연관 검색 실패");
      setRelatedStatus("error");
    }
  }

  const isStreaming = summaryStatus === "streaming";
  const isGeneratingAudio = audioStatus === "generating";
  const isLoadingRelated = relatedStatus === "loading";

  const handleCardClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!compact || !onSelect) return;
    // 링크/버튼 같은 내부 인터랙티브 요소 클릭은 무시
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, [role='button']")) return;
    onSelect();
  };

  return (
    <article
      onClick={handleCardClick}
      className={
        "rounded-2xl border p-5 shadow-sm transition " +
        (compact ? "cursor-pointer hover:shadow-md active:scale-[0.998] " : "hover:shadow-md ") +
        (isRecommended
          ? "border-amber-300 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/10"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            {rank}
          </span>
          <span>PMID {paper.pmid}</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isRecommended ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              {recommendationRank ? `AI 추천 #${recommendationRank}` : "AI 추천"}
            </span>
          ) : null}
          {paper.access === "open" ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
              Open Access
            </span>
          ) : (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              Abstract만
            </span>
          )}
          {paper.publicationTypes.slice(0, 2).map((t) => (
            <span
              key={t}
              className="rounded-full border border-zinc-200 px-2 py-0.5 text-[11px] text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {isRecommended && recommendationReason ? (
        <p className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {recommendationReason}
        </p>
      ) : null}

      <h2 className="mt-3 text-base font-semibold leading-snug text-zinc-900 dark:text-zinc-50">
        {paper.title || "(제목 없음)"}
      </h2>

      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        {formatAuthors(paper.authors)}
      </p>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="italic">{paper.journal || "Journal"}</span>
        {paper.year ? ` · ${paper.year}` : ""}
        {paper.doi ? (
          <>
            {" · "}
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-dotted hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              DOI
            </a>
          </>
        ) : null}
      </p>

      {hasAbstract ? (
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {!compact && expanded ? paper.abstract : shortAbstract}
        </div>
      ) : (
        <div className="mt-3 text-sm italic text-zinc-400">Abstract 없음</div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
        {!compact && hasAbstract && paper.abstract.length > 320 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
          >
            {expanded ? "접기" : "더 보기"}
          </button>
        ) : null}
        <a
          href={paper.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
        >
          PubMed에서 보기 ↗
        </a>
        {paper.pmcId ? (
          <a
            href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${paper.pmcId}/`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300"
          >
            PMC Full Text ↗
          </a>
        ) : null}
        {compact ? (
          <span className="ml-auto text-zinc-400">상세 보기 →</span>
        ) : null}
      </div>

      {!compact && paper.access === "closed" ? (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              PDF 연결
            </span>
            {pdfAttachment ? (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200">
                  PDF 연결됨
                </span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {pdfAttachment.filename} · {pdfAttachment.pages}p ·{" "}
                  {pdfAttachment.chars.toLocaleString()}자
                </span>
                <button
                  type="button"
                  onClick={() => setPdfAttachment(null)}
                  className="text-[11px] text-zinc-500 underline-offset-2 hover:text-red-600 hover:underline dark:text-zinc-400"
                >
                  해제
                </button>
              </>
            ) : (
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Abstract만 제공되는 논문입니다. PDF를 올리면 full text로 요약됩니다.
              </span>
            )}
          </div>
          {!pdfAttachment ? (
            <PdfUpload onExtracted={(payload) => setPdfAttachment(payload)} />
          ) : null}
        </div>
      ) : null}

      {!compact && hasAbstract ? (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              AI 요약
            </span>
            {!isStreaming ? (
              <>
                <button
                  type="button"
                  onClick={() => generateSummary("ko")}
                  className="inline-flex h-7 items-center rounded-full bg-zinc-900 px-3 text-[11px] font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {summary && language === "ko" ? "한국어로 다시 생성" : "한국어 요약"}
                </button>
                <button
                  type="button"
                  onClick={() => generateSummary("en")}
                  className="inline-flex h-7 items-center rounded-full border border-zinc-300 px-3 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                >
                  {summary && language === "en" ? "Regenerate (EN)" : "English"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={stopSummary}
                className="inline-flex h-7 items-center rounded-full border border-zinc-300 px-3 text-[11px] font-medium text-zinc-700 transition hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                중단
              </button>
            )}
            {isStreaming ? (
              <span className="text-[11px] text-zinc-400">
                Gemini가 요약하는 중…
              </span>
            ) : null}
          </div>

          {summaryStatus === "error" ? (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <div>{summaryError}</div>
              <div>
                <button
                  type="button"
                  onClick={() => generateSummary(language)}
                  className="inline-flex h-6 items-center rounded-full border border-red-300 bg-white px-2.5 text-[11px] font-medium text-red-800 transition hover:border-red-500 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300"
                >
                  다시 시도
                </button>
              </div>
            </div>
          ) : null}

          {summary ? (
            <div className="mt-3 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-sm leading-relaxed text-zinc-800 dark:bg-zinc-950/60 dark:text-zinc-200">
              {summary}
              {isStreaming ? (
                <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-zinc-400" />
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              듣기
            </span>
            {!isGeneratingAudio ? (
              <>
                <button
                  type="button"
                  onClick={() => generateAudio("narration", language)}
                  className="inline-flex h-7 items-center rounded-full border border-zinc-300 px-3 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                >
                  {audio?.style === "narration" ? "내레이션 다시 생성" : "내레이션"}
                </button>
                <button
                  type="button"
                  onClick={() => generateAudio("dialogue", language)}
                  className="inline-flex h-7 items-center rounded-full border border-zinc-300 px-3 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
                >
                  {audio?.style === "dialogue" ? "대화체 다시 생성" : "대화체"}
                </button>
                <span className="text-[11px] text-zinc-400">
                  ({language === "ko" ? "한국어" : "English"})
                </span>
              </>
            ) : (
              <>
                <span className="text-[11px] text-zinc-400">
                  {pendingStyle === "dialogue" ? "대화체" : "내레이션"} 생성 중… (수십 초 소요)
                </span>
                <button
                  type="button"
                  onClick={cancelAudio}
                  className="inline-flex h-7 items-center rounded-full border border-zinc-300 px-3 text-[11px] font-medium text-zinc-700 transition hover:border-red-400 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  취소
                </button>
              </>
            )}
          </div>

          {audioStatus === "error" ? (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              <div>{audioError}</div>
              {pendingStyle || audio?.style ? (
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      generateAudio(
                        pendingStyle ?? audio?.style ?? "narration",
                        language
                      )
                    }
                    className="inline-flex h-6 items-center rounded-full border border-red-300 bg-white px-2.5 text-[11px] font-medium text-red-800 transition hover:border-red-500 dark:border-red-900/50 dark:bg-zinc-900 dark:text-red-300"
                  >
                    다시 시도
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {audio ? (
            <AudioPlayer
              src={audio.url}
              label={`${audio.style === "dialogue" ? "대화체" : "내레이션"} · ${audio.language === "ko" ? "한국어" : "English"}`}
            />
          ) : null}
        </div>
      ) : null}

      {!compact && canExploreRelated ? (
        <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              연결 학습
            </span>
            {!relatedOpen ? (
              <button
                type="button"
                onClick={() => setRelatedOpen(true)}
                className="inline-flex h-7 items-center rounded-full border border-zinc-300 px-3 text-[11px] font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-500"
              >
                이 주제 더 찾아보기
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setRelatedOpen(false)}
                className="text-[11px] text-zinc-400 underline-offset-2 hover:underline"
              >
                닫기
              </button>
            )}
            {relatedOpen && related ? (
              <span className="text-[11px] text-zinc-400">
                현재 탐색 경로 · 깊이 {depth + 1} / {MAX_RELATED_DEPTH}
              </span>
            ) : null}
          </div>

          {relatedOpen ? (
            <div className="mt-3 flex flex-col gap-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={relatedHint}
                  onChange={(e) => setRelatedHint(e.target.value)}
                  placeholder="어떤 방향으로? (선택) 예: 최신 리뷰, 소아 환자 대상, 비교 중재…"
                  disabled={isLoadingRelated}
                  className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-xs outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-200"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (!isLoadingRelated) fetchRelated();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={fetchRelated}
                  disabled={isLoadingRelated}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-4 text-xs font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  {isLoadingRelated ? "검색 중…" : related ? "더 찾기" : "찾기"}
                </button>
              </div>

              {related && relatedStatus !== "loading" ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium">검색 방향:</span> {related.note}
                  <br />
                  <span className="font-mono text-[10px] text-zinc-400">
                    {related.query}
                  </span>
                </p>
              ) : null}

              {isLoadingRelated ? (
                <div className="flex flex-col gap-2">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="h-20 animate-pulse rounded-xl border border-zinc-200 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60"
                    />
                  ))}
                </div>
              ) : null}

              {relatedStatus === "error" && relatedError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                  {relatedError}
                </div>
              ) : null}

              {related && related.papers.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {related.papers.map((child, idx) => (
                    <PaperCard
                      key={child.pmid}
                      paper={child}
                      rank={idx + 1}
                      depth={depth + 1}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
