"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import {
  clearTracks,
  listTracks,
  moveTrackDown,
  moveTrackUp,
  removeTrack,
  subscribeAudioLibrary,
} from "@/lib/audio-library";
import type { AudioTrack } from "@/types";

interface Props {
  /**
   * 사용자가 트랙의 "📄 논문" 버튼을 누를 때 호출.
   * 부모(드로어 또는 페이지)가 URL을 ?pmid=… 로 바꾸고 디테일 패널을 띄운다.
   */
  onOpenPaper?: (track: AudioTrack) => void;
}

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

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${n} B`;
}

function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80);
}

function downloadTrack(track: AudioTrack): void {
  const url = URL.createObjectURL(track.audioBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paperis-${track.pmid}-${safeFilename(track.title)}.wav`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AudioLibrary({ onOpenPaper }: Props) {
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
    const ok = window.confirm(
      `이 트랙을 라이브러리에서 삭제할까요?\n\n${track.title}`
    );
    if (!ok) return;
    await removeTrack(track.id);
  }

  async function handleClearAll() {
    if (tracks.length === 0) return;
    const ok = window.confirm(
      `라이브러리의 모든 트랙(${tracks.length}편)을 삭제할까요?\n` +
        "오디오 파일도 같이 사라지며 되돌릴 수 없습니다."
    );
    if (!ok) return;
    await clearTracks();
  }

  function handlePlay(track: AudioTrack, idx: number) {
    // 같은 트랙을 다시 누르면 toggle (재생 중이면 일시정지)
    const playingThis =
      player.currentIndex >= 0 &&
      player.queue[player.currentIndex]?.id === track.id;
    if (playingThis) {
      player.togglePlay();
    } else {
      player.playFromIndex(tracks, idx);
    }
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
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
        아직 저장된 트랙이 없습니다.
        <br />
        논문을 선택해 “TTS 변환” 버튼을 눌러보세요.
      </div>
    );
  }

  const totalMs = tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
  const totalBytes = tracks.reduce((acc, t) => acc + (t.audioBlob?.size ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          {tracks.length}개 트랙 · 총 재생 {formatDuration(totalMs)} ·{" "}
          {formatBytes(totalBytes)} (브라우저 IndexedDB 저장)
        </p>
        <button
          type="button"
          onClick={handleClearAll}
          className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-500 hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:border-zinc-800 dark:hover:border-red-900 dark:hover:bg-red-950"
        >
          전체 비우기
        </button>
      </div>
      <ol className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        {tracks.map((track, idx) => {
          const playingThis =
            player.currentIndex >= 0 &&
            player.queue[player.currentIndex]?.id === track.id;
          const isFirst = idx === 0;
          const isLast = idx === tracks.length - 1;
          return (
            <li
              key={track.id}
              className={[
                "group relative flex items-center gap-2 border-b border-zinc-100 px-3 py-3 last:border-b-0 dark:border-zinc-900",
                playingThis ? "bg-emerald-50 dark:bg-emerald-950/40" : "",
              ].join(" ")}
            >
              <span className="w-8 shrink-0 text-center font-mono text-xs text-zinc-400">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => handlePlay(track, idx)}
                className="min-w-0 flex-1 cursor-pointer text-left"
                aria-label={`${track.title} 재생`}
                title="클릭해서 여기부터 재생 (이미 재생 중이면 일시정지)"
              >
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {playingThis ? (player.isPlaying ? "▶ " : "⏸ ") : ""}
                  {track.title}
                </p>
                <p className="truncate text-xs text-zinc-500">
                  {track.journal} · {track.year} · {track.providerName}/
                  {track.voice} · {formatDate(track.createdAt)}
                </p>
              </button>
              <span className="hidden shrink-0 font-mono text-xs text-zinc-500 sm:inline">
                {formatDuration(track.durationMs)}
              </span>

              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => moveTrackUp(track.id)}
                  disabled={isFirst}
                  className="rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-20 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label="위로 이동"
                  title="위로 이동"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveTrackDown(track.id)}
                  disabled={isLast}
                  className="rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-20 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label="아래로 이동"
                  title="아래로 이동"
                >
                  ↓
                </button>
                {onOpenPaper ? (
                  <button
                    type="button"
                    onClick={() => onOpenPaper(track)}
                    className="rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                    aria-label="논문 디테일 열기"
                    title="이 논문의 디테일 패널 열기"
                  >
                    📄
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => downloadTrack(track)}
                  className="rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label="WAV 다운로드"
                  title="WAV 파일로 다운로드"
                >
                  💾
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(track)}
                  className="rounded-md px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                  aria-label="트랙 삭제"
                  title="트랙 삭제 (확인 후)"
                >
                  🗑
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-zinc-400">
        오디오 파일은 브라우저 IndexedDB에만 저장됩니다 — 서버 업로드 없음. 다른
        기기와 자동 동기화되지 않습니다. 트랙을 삭제하면 해당 음원 파일도 함께
        사라집니다.
      </p>
    </div>
  );
}
