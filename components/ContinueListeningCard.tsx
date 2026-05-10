"use client";

// 홈 첫 화면 — IndexedDB의 가장 최근 트랙을 "이어 듣기" 카드로.
//
// "Continue listening"의 진정한 구현(어디까지 들었는지 마지막 위치 저장)은
// PlayerProvider가 currentTimeMs를 영속화해야 가능. 일단은 가장 최근 변환된
// 트랙 = "이어 들을 가장 자연스러운 후보"라는 휴리스틱으로 시작.
//
// 트랙 0개면 자체 숨김 (홈에 빈 슬롯 안 만듦).

import { useEffect, useState } from "react";
import {
  AUDIO_LIBRARY_EVENT,
  listTrackMetas,
} from "@/lib/audio-library";
import { usePlayer } from "@/components/PlayerProvider";
import type { AudioTrackMeta } from "@/types";

export default function ContinueListeningCard() {
  const [tracks, setTracks] = useState<AudioTrackMeta[]>([]);
  const [latest, setLatest] = useState<AudioTrackMeta | null>(null);
  const player = usePlayer();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const all = await listTrackMetas();
        if (cancelled) return;
        setTracks(all);
        if (all.length === 0) {
          setLatest(null);
          return;
        }
        // createdAt 내림차순 — 가장 최근 1개
        const sorted = [...all].sort((a, b) => b.createdAt - a.createdAt);
        setLatest(sorted[0]);
      } catch {
        // IndexedDB 실패는 silent — 카드 숨김으로 처리
      }
    }
    void load();
    const onChange = () => {
      void load();
    };
    window.addEventListener(AUDIO_LIBRARY_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(AUDIO_LIBRARY_EVENT, onChange);
    };
  }, []);

  if (!latest) return null;

  function handlePlay() {
    if (!latest) return;
    const idx = tracks.findIndex((t) => t.id === latest.id);
    if (idx >= 0) {
      player.playFromIndex(tracks, idx);
    }
  }

  const totalMin = Math.max(1, Math.round((latest.durationMs ?? 0) / 60000));
  const isCurrent =
    player.currentIndex >= 0 &&
    player.queue[player.currentIndex]?.id === latest.id;
  const progress =
    isCurrent && player.durationMs > 0
      ? Math.min(1, player.currentTimeMs / player.durationMs)
      : 0;

  return (
    <section className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/60 dark:bg-amber-950/30">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium tracking-wide text-amber-700 dark:text-amber-300">
          ▶ 이어 듣기
        </h2>
        <span className="text-[10px] text-amber-700/70 dark:text-amber-300/70">
          가장 최근 트랙
        </span>
      </div>
      <div className="mt-2.5 flex items-start gap-3">
        <button
          type="button"
          onClick={handlePlay}
          aria-label="재생"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-600 text-lg text-white shadow transition hover:bg-amber-700"
        >
          {isCurrent && player.isPlaying ? "❚❚" : "▶"}
        </button>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {latest.title}
          </div>
          <div className="mt-0.5 truncate text-xs text-zinc-600 dark:text-zinc-400">
            {latest.journal} · 약 {totalMin}분
          </div>
          {isCurrent ? (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-amber-200 dark:bg-amber-900/60">
              <div
                className="h-full bg-amber-600 transition-[width]"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
