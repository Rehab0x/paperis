"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import {
  listTracks,
  removeTrack,
  subscribeAudioLibrary,
} from "@/lib/audio-library";
import type { AudioTrack } from "@/types";

function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return "—:—";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(ms: number): string {
  const d = new Date(ms);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

export default function AudioLibrary() {
  const player = usePlayer();
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const list = await listTracks();
      setTracks(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "라이브러리 로드 실패");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const unsub = subscribeAudioLibrary(() => {
      void refresh();
    });
    return unsub;
  }, []);

  async function handleRemove(track: AudioTrack) {
    // 실수로 한 번 클릭에 사라지지 않도록 확인 다이얼로그.
    // 재생 큐는 유지 (현재 재생 중 트랙이라도 멈추지 않고 IndexedDB에서만 제거)
    const ok = window.confirm(
      `이 트랙을 라이브러리에서 삭제할까요?\n\n${track.title}`
    );
    if (!ok) return;
    await removeTrack(track.id);
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">불러오는 중…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        {error}
      </p>
    );
  }
  if (tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
        아직 저장된 트랙이 없습니다.
        <br />
        논문을 선택해 “TTS 변환 → 라이브러리” 버튼을 눌러보세요.
      </div>
    );
  }

  const totalMs = tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        총 {tracks.length}개 트랙 · 총 재생시간 {formatDuration(totalMs)}
      </p>
      <ol className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {tracks.map((track, idx) => {
          const playingThis =
            player.currentIndex >= 0 &&
            player.queue[player.currentIndex]?.id === track.id;
          return (
            <li
              key={track.id}
              className={[
                "flex items-center gap-3 border-b border-zinc-100 px-4 py-3 last:border-b-0 dark:border-zinc-900",
                playingThis ? "bg-emerald-50 dark:bg-emerald-950/40" : "",
              ].join(" ")}
            >
              <button
                type="button"
                onClick={() => player.playFromIndex(tracks, idx)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                aria-label={`${idx + 1}번 트랙 재생`}
                title="여기부터 재생"
              >
                {playingThis && player.isPlaying ? "⏸" : "▶"}
              </button>
              <span className="w-10 shrink-0 text-center font-mono text-xs text-zinc-400">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {track.title}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {track.journal} · {track.year} · {track.providerName}/
                  {track.voice} · {formatDate(track.createdAt)}
                </p>
              </div>
              <span className="shrink-0 font-mono text-xs text-zinc-500">
                {formatDuration(track.durationMs)}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(track)}
                className="ml-1 rounded-md px-2 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                aria-label="트랙 삭제"
                title="트랙 삭제 (확인 후)"
              >
                🗑
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
