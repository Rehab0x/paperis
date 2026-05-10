"use client";

// 글로벌 PlayerBar — fixed bottom. v3 톤(warm + 컴팩트 single row).
// 모바일에서도 단일 행으로 유지해 LibraryDrawer가 위에서 끝나는 영역을 최대화.
// −10/+10초 버튼은 키보드(←/→)로 대체 — 모바일 화면 폭에서 제거.

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

  // PlayerBar 실제 높이를 CSS 변수로 노출 → LibraryDrawer/페이지 padding이 정확히
  // 그 위에서 끝나도록. ResizeObserver로 폰트 로드/리사이즈 시 자동 갱신.
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
        className="fixed inset-x-0 bottom-0 z-30 border-t border-paperis-border bg-paperis-bg/95 backdrop-blur-xl"
      >
        {/* 풀너비 얇은 progress bar — 클릭 시 시크. PlayerBar 톱 라인이자 시각 액센트 */}
        <div
          className="relative h-[3px] cursor-pointer bg-paperis-border"
          onClick={(e) => {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            if (dur > 0) player.seekTo(pct * dur);
          }}
          aria-label="진행 바 (클릭해서 시크)"
        >
          <div
            className="absolute inset-y-0 left-0 bg-paperis-accent transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4">
          {/* 큰 play 버튼 (accent) */}
          <button
            type="button"
            onClick={player.togglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paperis-accent text-paperis-bg shadow transition hover:opacity-90"
            aria-label={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
            title={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>

          {/* 메타 + 시간 */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-paperis-text">
              {track.title}
            </p>
            <p className="flex items-center gap-2 text-[11px] text-paperis-text-3">
              <span className="truncate">
                {track.journal}
                {track.year ? ` · ${track.year}` : ""}
                <span className="ml-1.5 opacity-70">
                  · {currentIndex + 1}/{queue.length}
                </span>
              </span>
              <span className="ml-auto shrink-0 font-mono tabular-nums">
                {formatTime(currentTimeMs)} / {formatTime(dur)}
              </span>
            </p>
          </div>

          {/* 컨트롤 — 모바일에서도 컴팩트하게 단일 행 유지 */}
          <div className="flex shrink-0 items-center gap-0.5">
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
              extraClass="hidden sm:inline-flex"
            >
              <span className="font-mono text-[10px]">−10</span>
            </ControlButton>
            <ControlButton
              onClick={() => player.seekBy(10000)}
              label="+10초 (→)"
              extraClass="hidden sm:inline-flex"
            >
              <span className="font-mono text-[10px]">+10</span>
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
                "inline-flex h-8 w-8 items-center justify-center rounded-lg transition",
                scriptOpen && hasScript
                  ? "bg-paperis-accent text-paperis-bg"
                  : "text-paperis-text-2 hover:bg-paperis-surface-2 hover:text-paperis-text",
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
              📜
            </button>
            <button
              type="button"
              onClick={player.stop}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
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

function ScriptPanel({ title, journal, year, text, onClose }: ScriptPanelProps) {
  return (
    <div
      style={{ bottom: "var(--player-bar-h, 64px)" }}
      className="fixed inset-x-0 z-40 border-t border-paperis-border bg-paperis-bg shadow-[0_-4px_16px_-4px_rgba(0,0,0,0.18)]"
    >
      <div className="mx-auto flex max-w-3xl flex-col px-4 py-3">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-paperis-text">
              📜 {title}
            </p>
            <p className="truncate text-xs text-paperis-text-3">
              {journal} · {year} · narration 스크립트
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
            aria-label="스크립트 패널 닫기"
          >
            닫기 ✕
          </button>
        </div>
        <div className="max-h-[45vh] overflow-auto rounded-lg border border-paperis-border bg-paperis-surface px-4 py-3 text-[15px] leading-relaxed text-paperis-text-2">
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
  extraClass,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
  extraClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:cursor-not-allowed disabled:opacity-30",
        extraClass ?? "",
      ].join(" ")}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
}
