"use client";

import { useEffect, useRef, useState } from "react";
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
  const [scriptOpen, setScriptOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // 트랙이 사라지면 스크립트 패널 자동 닫음
  useEffect(() => {
    if (currentIndex < 0) setScriptOpen(false);
  }, [currentIndex]);

  // PlayerBar 실제 높이를 CSS 변수로 노출 → LibraryDrawer가 그 위에서 끝나도록.
  // ResizeObserver로 모바일 반응형(컨트롤이 두 줄로) 등 높이 변화 자동 추적.
  useEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el) {
      root.style.setProperty("--player-bar-h", "0px");
      return;
    }
    const update = () => {
      root.style.setProperty("--player-bar-h", `${el.offsetHeight}px`);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.setProperty("--player-bar-h", "0px");
    };
  }, [currentIndex]);

  if (currentIndex < 0 || !queue[currentIndex]) return null;
  const track = queue[currentIndex];
  const dur = durationMs || track.durationMs || 0;
  const progress = dur > 0 ? Math.min(100, (currentTimeMs / dur) * 100) : 0;
  const hasScript = Boolean(track.narrationText);

  return (
    <>
      {scriptOpen && hasScript ? (
        <ScriptPanel
          title={track.title}
          journal={track.journal}
          year={track.year}
          text={track.narrationText ?? ""}
          onClose={() => setScriptOpen(false)}
        />
      ) : null}
      <div
        ref={barRef}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950"
      >
        {/* 모바일: column 두 줄(메타+progress / 컨트롤). 데스크탑(sm+): row 한 줄.
            네비게이션 바가 모바일에서 좁아지지 않게 컨트롤을 아래 줄로 내림. */}
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-2 sm:flex-row sm:items-center sm:gap-3 sm:py-3">
          <div className="min-w-0 sm:flex-1">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {track.title}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {track.journal} · {track.year} · 트랙 {currentIndex + 1}/
              {queue.length}
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

          <div className="flex shrink-0 items-center justify-center gap-1.5 sm:justify-start">
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
              <span className="font-mono text-xs">−10</span>
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
              <span className="font-mono text-xs">+10</span>
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
              onClick={() => setScriptOpen((v) => !v)}
              disabled={!hasScript}
              className={[
                "ml-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium",
                scriptOpen && hasScript
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                !hasScript ? "cursor-not-allowed opacity-30" : "",
              ].join(" ")}
              aria-label="스크립트 보기/숨기기"
              title={
                hasScript
                  ? scriptOpen
                    ? "스크립트 숨기기"
                    : "재생 중인 트랙의 narration 스크립트 보기"
                  : "이 트랙에는 스크립트가 저장되어 있지 않습니다 (v2.0.1 이전 변환)"
              }
            >
              📜<span className="hidden sm:inline">스크립트</span>
            </button>
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
    </>
  );
}

interface ScriptPanelProps {
  title: string;
  journal: string;
  year: string;
  text: string;
  onClose: () => void;
}

// PlayerBar 위로 펼쳐지는 narration 스크립트 패널.
// PlayerBar 동적 높이(--player-bar-h)에 맞춰 위치.
function ScriptPanel({ title, journal, year, text, onClose }: ScriptPanelProps) {
  return (
    <div
      style={{ bottom: "var(--player-bar-h, 92px)" }}
      className="fixed inset-x-0 z-40 border-t border-zinc-200 bg-white shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.08)] dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="mx-auto flex max-w-3xl flex-col px-4 py-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              📜 {title}
            </p>
            <p className="truncate text-xs text-zinc-500">
              {journal} · {year} · narration 스크립트
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="스크립트 패널 닫기"
          >
            닫기 ✕
          </button>
        </div>
        <div className="max-h-[45vh] overflow-auto rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-[15px] leading-relaxed text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          <p className="whitespace-pre-wrap break-words">{text}</p>
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
