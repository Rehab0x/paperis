"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CART_LIMIT,
  clearCart,
  getCart,
  removeFromCart,
  subscribeCart,
  type CartItem,
} from "@/lib/cart";
import { getCardState } from "@/lib/card-cache";
import PlaylistPlayer, { type PlaylistTrack } from "./PlaylistPlayer";
import PaperModal from "./PaperModal";
import type { Paper } from "@/types";

type GenStatus = "idle" | "generating" | "ready" | "error";

interface PlaylistTrackResponse {
  pmid: string;
  title: string;
  audioBase64: string;
  contentType: string;
  bytes: number;
  error?: string;
}

interface PlaylistResponse {
  language: "ko" | "en";
  brief: boolean;
  tracks: PlaylistTrackResponse[];
  okCount: number;
  requested: number;
}

function base64ToBlobUrl(b64: string, type: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes as BlobPart], { type });
  return URL.createObjectURL(blob);
}

export default function CartPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<CartItem[]>([]);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genError, setGenError] = useState("");
  const [tracks, setTracks] = useState<PlaylistTrack[]>([]);
  const [brief, setBrief] = useState(true);
  const [useFullText, setUseFullText] = useState(true);
  const [language] = useState<"ko" | "en">("ko");
  const [openPaper, setOpenPaper] = useState<Paper | null>(null);
  const [genProgress, setGenProgress] = useState<string>("");

  // 동기화 — localStorage 외부 시스템과 마운트 시 1회 + 변경 이벤트 구독
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(getCart());
    return subscribeCart(() => setItems(getCart()));
  }, []);

  // 컴포넌트 unmount 시 blob URL 회수
  useEffect(() => {
    return () => {
      tracks.forEach((t) => URL.revokeObjectURL(t.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const count = items.length;
  const totalEstSeconds = useMemo(
    () => count * (brief ? 90 : 360),
    [count, brief]
  );

  async function generate() {
    if (count === 0) return;
    // 기존 트랙 blob URL 회수
    tracks.forEach((t) => URL.revokeObjectURL(t.url));
    setTracks([]);
    setGenError("");
    setGenStatus("generating");
    setGenProgress("");

    try {
      // 풀텍스트 모드: 각 paper에 대해 (1) 카드 캐시 → (2) Open Access면 자동 PMC fetch → (3) abstract fallback
      // 결과적으로 augmentedPapers + sourceLabels(같은 길이)를 만든다.
      const augmented: { paper: Paper; sourceLabel: string | null }[] = [];

      if (useFullText) {
        setGenProgress("본문 준비 중…");
        const tasks = items.map(async (it) => {
          // 1) 이미 사용자가 카드에서 PMC/PDF로 첨부해둔 fullText
          const cached = getCardState(it.pmid)?.fullText;
          if (cached?.text && cached.text.length > 0) {
            return {
              paper: { ...it.paper, abstract: cached.text },
              sourceLabel:
                cached.source === "pmc"
                  ? "PMC full text"
                  : "User-uploaded PDF",
            };
          }
          // 2) Open Access + pmcId → 서버에서 자동 PMC fetch
          if (it.paper.access === "open" && it.paper.pmcId) {
            try {
              const res = await fetch(
                `/api/pmc?pmcId=${encodeURIComponent(it.paper.pmcId)}`
              );
              if (res.ok) {
                const data = await res.json();
                if (typeof data?.text === "string" && data.text.length > 200) {
                  // PMID 미스매치는 자동 모드에서는 보수적으로 fallback
                  const articlePmid =
                    typeof data.articlePmid === "string"
                      ? data.articlePmid
                      : null;
                  if (!articlePmid || articlePmid === it.paper.pmid) {
                    return {
                      paper: { ...it.paper, abstract: data.text },
                      sourceLabel: "PMC full text",
                    };
                  }
                }
              }
            } catch {
              // 네트워크 실패는 abstract fallback
            }
          }
          // 3) fallback: abstract 그대로
          return { paper: it.paper, sourceLabel: null };
        });
        const resolved = await Promise.all(tasks);
        augmented.push(...resolved);
      } else {
        for (const it of items) {
          augmented.push({ paper: it.paper, sourceLabel: null });
        }
      }

      const fullTextCount = augmented.filter((a) => a.sourceLabel).length;
      setGenProgress(
        useFullText
          ? `본문 ${fullTextCount}/${augmented.length}편 적용 — narration 합성 중…`
          : `narration 합성 중…`
      );

      const res = await fetch("/api/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: augmented.map((a) => a.paper),
          sourceLabels: augmented.map((a) => a.sourceLabel),
          language,
          brief,
        }),
      });
      const data = (await res.json()) as PlaylistResponse | { error: string };
      if (!res.ok || "error" in data) {
        const msg = "error" in data ? data.error : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const newTracks: PlaylistTrack[] = data.tracks
        .filter((t) => !t.error && t.audioBase64)
        .map((t) => {
          // 트랙 생성 시점의 cart에서 paper를 매칭해 동봉
          const cartItem = items.find((it) => it.pmid === t.pmid);
          return {
            pmid: t.pmid,
            title: t.title,
            url: base64ToBlobUrl(t.audioBase64, t.contentType || "audio/wav"),
            bytes: t.bytes,
            paper: cartItem?.paper,
          };
        });

      if (newTracks.length === 0) {
        throw new Error("재생 가능한 트랙이 없습니다.");
      }

      setTracks(newTracks);
      setGenStatus("ready");

      // 일부 트랙 실패 알림
      const failed = data.tracks.filter((t) => t.error);
      if (failed.length > 0) {
        setGenError(`${failed.length}개 트랙 생성 실패 — 나머지로 재생`);
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "재생목록 생성 실패");
      setGenStatus("error");
    }
  }

  return (
    <>
      {/* 헤더 트리거 (호스트 컴포넌트가 호출) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`재생목록 (${count}편)`}
        className="relative inline-flex h-8 items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        🛒 재생목록
        <span
          className={
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold " +
            (count > 0
              ? "bg-emerald-600 text-white"
              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400")
          }
        >
          {count}
        </span>
      </button>

      {/* 슬라이드 오버 */}
      {open ? (
        <div
          className="fixed inset-0 z-30 flex justify-end bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-md flex-col gap-3 overflow-y-auto bg-zinc-50 p-4 shadow-xl dark:bg-zinc-950 sm:p-5"
            role="dialog"
            aria-label="재생목록"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
                출퇴근 재생목록
                <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                  {count} / {CART_LIMIT}
                </span>
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
              >
                닫기 ✕
              </button>
            </div>

            {count === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
                카드의 <span className="font-mono">+ 담기</span> 버튼으로 논문을
                모은 뒤, 한 번에 한국어 narration 오디오를 생성할 수 있어요.
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((it, i) => (
                  <li
                    key={it.pmid}
                    className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
                  >
                    <span className="w-5 shrink-0 pt-0.5 text-xs tabular-nums text-zinc-400">
                      {i + 1}.
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpenPaper(it.paper)}
                      className="min-w-0 flex-1 text-left"
                      aria-label={`${it.paper.title || "논문"} 상세 보기`}
                    >
                      <div className="line-clamp-2 text-sm text-zinc-900 dark:text-zinc-100">
                        {it.paper.title || `(논문 ${i + 1})`}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {it.paper.journal || "Journal"}
                        {it.paper.year ? ` · ${it.paper.year}` : ""} · PMID{" "}
                        {it.pmid}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFromCart(it.pmid);
                      }}
                      aria-label="제거"
                      className="text-xs text-zinc-400 hover:text-red-600 dark:hover:text-red-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {count > 0 ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex flex-col gap-2 text-xs">
                  <label className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={brief}
                        onChange={(e) => setBrief(e.target.checked)}
                        className="accent-emerald-700 dark:accent-emerald-400"
                      />
                      <span className="text-zinc-700 dark:text-zinc-300">
                        짧은 모드 (편당 1–2분)
                      </span>
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      ≈ {Math.round(totalEstSeconds / 60)}분
                    </span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useFullText}
                      onChange={(e) => setUseFullText(e.target.checked)}
                      className="accent-emerald-700 dark:accent-emerald-400"
                    />
                    <span className="text-zinc-700 dark:text-zinc-300">
                      본문(full text)으로 narration
                    </span>
                  </label>
                  {useFullText ? (
                    <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-[10px] leading-relaxed text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
                      카드에서 PMC/PDF로 본문을 미리 첨부한 논문은 그 텍스트로,
                      Open Access 논문은 자동으로 PMC 본문을 받아 사용합니다.
                      나머지는 abstract로 폴백.
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={generate}
                  disabled={genStatus === "generating"}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-emerald-700 px-4 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {genStatus === "generating"
                    ? genProgress || `생성 중 — ${count}편…`
                    : tracks.length > 0
                      ? "다시 생성"
                      : "한 번에 narration 생성"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`재생목록 ${count}편을 모두 비울까요?`)) {
                      clearCart();
                      tracks.forEach((t) => URL.revokeObjectURL(t.url));
                      setTracks([]);
                      setGenStatus("idle");
                    }
                  }}
                  className="text-[11px] text-zinc-500 hover:text-red-600 dark:text-zinc-400"
                >
                  재생목록 비우기
                </button>
                <p className="text-[10px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  논문별 1–2분 짧은 narration을 병렬로 합성합니다. Hobby 플랜에서는
                  편 수가 많으면 일부가 타임아웃 될 수 있어요. 재시도하면 보통 풀립니다.
                </p>
              </div>
            ) : null}

            {genError ? (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                {genError}
              </div>
            ) : null}

            {tracks.length > 0 ? (
              <PlaylistPlayer
                tracks={tracks}
                onOpenPaper={(p) => setOpenPaper(p)}
              />
            ) : null}
          </aside>
        </div>
      ) : null}

      {openPaper ? (
        <PaperModal paper={openPaper} onClose={() => setOpenPaper(null)} />
      ) : null}
    </>
  );
}
