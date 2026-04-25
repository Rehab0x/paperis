"use client";

import { useEffect, useRef, useState } from "react";
import type { Paper } from "@/types";

export interface PlaylistTrack {
  pmid: string;
  title: string;
  url: string; // blob URL
  bytes: number;
  /** 카트에서 가져온 원본 paper. "이 논문 보기"에서 사용. */
  paper?: Paper;
}

interface Props {
  tracks: PlaylistTrack[];
  onClose?: () => void;
  /** 사용자가 "이 논문 보기"를 눌렀을 때. paper가 있으면 호출됨. */
  onOpenPaper?: (paper: Paper) => void;
}

const SEEK_SECONDS = 10;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlaylistPlayer({ tracks, onClose, onOpenPaper }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const current = tracks[index];

  // 키보드 단축키: ←/→ 10초 시크, Space 재생/일시정지.
  // 입력 필드(검색창, 힌트창 등)에 포커스 있으면 무시.
  useEffect(() => {
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el.isContentEditable
      );
    }

    function handler(e: KeyboardEvent) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (isTypingTarget(e.target)) return;
      const a = audioRef.current;
      if (!a) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        a.currentTime = Math.max(0, a.currentTime - SEEK_SECONDS);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const max = Number.isFinite(a.duration) ? a.duration : Infinity;
        a.currentTime = Math.min(max, a.currentTime + SEEK_SECONDS);
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (a.paused) a.play().catch(() => {});
        else a.pause();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 트랙 변경 시 자동 재생 시도 (사용자 첫 인터랙션 후엔 무리 없음)
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.load();
    if (playing) {
      a.play().catch(() => {
        // 자동재생 차단 시 무시 — 사용자가 ▶ 버튼 누르면 됨
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function togglePlay() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch(() => {});
    } else {
      a.pause();
    }
  }

  function seekBy(sec: number) {
    const a = audioRef.current;
    if (!a || !Number.isFinite(a.currentTime)) return;
    const next = Math.max(0, Math.min(a.duration || Infinity, a.currentTime + sec));
    a.currentTime = next;
  }

  function prevTrack() {
    if (index > 0) setIndex(index - 1);
  }
  function nextTrack() {
    if (index < tracks.length - 1) setIndex(index + 1);
    else setPlaying(false);
  }

  function gotoTrack(i: number) {
    if (i >= 0 && i < tracks.length) {
      setIndex(i);
      setPlaying(true);
    }
  }

  function onSeekBar(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Number(e.target.value);
  }

  if (tracks.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            출퇴근 재생목록
          </div>
          <div className="mt-1 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {current?.title ?? "—"}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            <span>
              {index + 1} / {tracks.length}
            </span>
            {current?.paper && onOpenPaper ? (
              <button
                type="button"
                onClick={() => onOpenPaper(current.paper!)}
                className="rounded-full border border-zinc-300 px-2 py-0.5 font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
              >
                📄 이 논문 보기
              </button>
            ) : null}
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            aria-label="플레이어 닫기"
          >
            ✕
          </button>
        ) : null}
      </div>

      {/* hidden native audio drives playback */}
      <audio
        ref={audioRef}
        src={current?.url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={nextTrack}
        className="hidden"
      />

      {/* 진행바 */}
      <div className="flex items-center gap-2 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
        <span className="w-10 text-right">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={Number.isFinite(duration) && duration > 0 ? duration : 0}
          step={0.1}
          value={currentTime}
          onChange={onSeekBar}
          className="h-1.5 w-full cursor-pointer accent-emerald-700 dark:accent-emerald-400"
          aria-label="현재 위치"
        />
        <span className="w-10">{formatTime(duration)}</span>
      </div>

      {/* 컨트롤 */}
      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={prevTrack}
          disabled={index === 0}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 transition hover:border-zinc-500 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
          aria-label="이전 트랙"
          title="이전 트랙"
        >
          ⏮
        </button>
        <button
          type="button"
          onClick={() => seekBy(-SEEK_SECONDS)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
          aria-label={`${SEEK_SECONDS}초 뒤로`}
          title={`${SEEK_SECONDS}초 뒤로`}
        >
          −{SEEK_SECONDS}
        </button>
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-lg text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          aria-label={playing ? "일시정지" : "재생"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          type="button"
          onClick={() => seekBy(SEEK_SECONDS)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
          aria-label={`${SEEK_SECONDS}초 앞으로`}
          title={`${SEEK_SECONDS}초 앞으로`}
        >
          +{SEEK_SECONDS}
        </button>
        <button
          type="button"
          onClick={nextTrack}
          disabled={index === tracks.length - 1}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-300 text-zinc-700 transition hover:border-zinc-500 disabled:opacity-30 dark:border-zinc-700 dark:text-zinc-300"
          aria-label="다음 트랙"
          title="다음 트랙"
        >
          ⏭
        </button>
      </div>

      {/* 단축키 안내 (데스크톱) */}
      <div className="hidden text-center text-[10px] text-zinc-400 sm:block">
        키보드: ← / → 10초 시크 · Space 재생/일시정지
      </div>

      {/* 트랙 리스트 */}
      <div className="max-h-48 overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-800 dark:bg-zinc-950/40">
        <ul className="flex flex-col gap-0.5">
          {tracks.map((t, i) => (
            <li key={t.pmid}>
              <button
                type="button"
                onClick={() => gotoTrack(i)}
                className={
                  "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition " +
                  (i === index
                    ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                    : "text-zinc-700 hover:bg-zinc-200/60 dark:text-zinc-300 dark:hover:bg-zinc-800/60")
                }
              >
                <span className="w-5 shrink-0 tabular-nums">
                  {i + 1}.
                </span>
                <span className="flex-1 truncate">{t.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
