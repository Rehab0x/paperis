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
import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";
import type { AudioTrackMeta } from "@/types";

export default function ContinueListeningCard() {
  const m = useAppMessages();
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

  // 프로토타입 톤 — 따뜻한 gradient + accent label + 라운드 play 버튼
  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={handlePlay}
        aria-label={m.home.continueListening.playAria}
        className="group flex w-full items-center gap-4 rounded-2xl border border-paperis-border bg-gradient-to-br from-paperis-accent-dim/30 to-paperis-surface-2 p-4 text-left transition hover:-translate-y-0.5 hover:border-paperis-accent/60"
      >
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-paperis-accent text-lg text-paperis-bg shadow"
          aria-hidden
        >
          {isCurrent && player.isPlaying ? "❚❚" : "▶"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-accent">
            {m.home.continueListening.title}
          </span>
          <span className="mt-1 block truncate text-sm font-medium text-paperis-text">
            {latest.titleKo ?? latest.title}
          </span>
          <span className="mt-1 block truncate text-[11px] text-paperis-text-3">
            {latest.journal} · {fmt(m.home.continueListening.approxMin, { min: totalMin })}
          </span>
          {isCurrent ? (
            <span className="mt-2 block h-[3px] overflow-hidden rounded-full bg-paperis-border">
              <span
                className="block h-full bg-paperis-accent transition-[width]"
                style={{ width: `${progress * 100}%` }}
              />
            </span>
          ) : null}
        </span>
      </button>
    </section>
  );
}
