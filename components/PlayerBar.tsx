"use client";

import { usePlayer } from "@/components/PlayerProvider";

function formatTime(ms: number): string {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function PlayerBar() {
  const player = usePlayer();
  const { queue, currentIndex, isPlaying, currentTimeMs, durationMs } = player;

  if (currentIndex < 0 || !queue[currentIndex]) return null;
  const track = queue[currentIndex];
  const dur = durationMs || track.durationMs || 0;
  const progress = dur > 0 ? Math.min(100, (currentTimeMs / dur) * 100) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {track.title}
          </p>
          <p className="truncate text-xs text-zinc-500">
            {track.journal} · {track.year} · 트랙{" "}
            {currentIndex + 1}/{queue.length}
          </p>
          <div
            className="mt-1.5 h-1 cursor-pointer rounded-full bg-zinc-200 dark:bg-zinc-800"
            onClick={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              if (dur > 0) player.seekTo(pct * dur);
            }}
          >
            <div
              className="h-1 rounded-full bg-emerald-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] font-mono text-zinc-400">
            <span>{formatTime(currentTimeMs)}</span>
            <span>{formatTime(dur)}</span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <ControlButton
            onClick={player.prev}
            label="이전 트랙 (Shift+←)"
            disabled={currentIndex <= 0}
          >
            ⏮
          </ControlButton>
          <ControlButton
            onClick={() => player.seekBy(-10000)}
            label="-10초 (←)"
          >
            ⏪
          </ControlButton>
          <button
            type="button"
            onClick={player.togglePlay}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-900 text-white shadow-sm hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            aria-label={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
            title={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <ControlButton
            onClick={() => player.seekBy(10000)}
            label="+10초 (→)"
          >
            ⏩
          </ControlButton>
          <ControlButton
            onClick={player.next}
            label="다음 트랙 (Shift+→)"
            disabled={currentIndex + 1 >= queue.length}
          >
            ⏭
          </ControlButton>
          <button
            type="button"
            onClick={player.stop}
            className="ml-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="플레이어 닫기"
            title="플레이어 닫기"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-2 py-1 text-base text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-zinc-300 dark:hover:bg-zinc-800"
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
