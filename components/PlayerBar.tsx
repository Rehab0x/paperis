"use client";

// 글로벌 PlayerBar — fixed bottom. v3 톤(warm + 컴팩트).
//
// 레이아웃:
//   - 데스크탑(sm+): 단일 행 (play | title+meta+marquee | time | controls)
//   - 모바일: 두 줄 (title+meta+marquee가 윗줄 / play+time+controls가 아랫줄)
//     → 제목을 가로 전체로 확보, 길면 marquee 애니메이션
// 진행 막대: 풀너비 위쪽 3px + 드래그 가능한 thumb (input[type=range] 오버레이)
// 아이콘: 인라인 SVG (이모지 ⏸/▶ 의 iOS 컬러 이모지 렌더링 이슈 회피)

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
  const metaLine = `${track.journal}${track.year ? ` · ${track.year}` : ""} · ${currentIndex + 1}/${queue.length}`;
  const titleDisplay = track.titleKo ?? track.title;
  const timeLabel = `${formatTime(currentTimeMs)} / ${formatTime(dur)}`;

  return (
    <>
      {scriptOpen && hasScript ? (
        <ScriptPanel
          title={titleDisplay}
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
        {/* 풀너비 진행 막대 — 시각 progress + 드래그 thumb 오버레이 */}
        <SeekBar
          currentTimeMs={currentTimeMs}
          durationMs={dur}
          progress={progress}
          onSeek={player.seekTo}
        />

        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:gap-3 sm:px-4">
          {/* 모바일: 제목 줄 (위) — 컨트롤보다 위에 큰 영역으로.
              데스크탑: 같은 위치(flex-row)에 그대로 들어감. */}
          <MarqueeTitle title={titleDisplay} meta={metaLine} />

          {/* 컨트롤 행 — 모바일에서는 아랫줄, 데스크탑에서는 같은 행 우측 */}
          <div className="flex items-center justify-between gap-2 sm:justify-end sm:gap-3">
            <button
              type="button"
              onClick={player.togglePlay}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paperis-accent text-paperis-bg shadow transition hover:opacity-90"
              aria-label={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
              title={isPlaying ? "일시정지 (Space)" : "재생 (Space)"}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>

            <span className="shrink-0 font-mono text-[11px] tabular-nums text-paperis-text-3 sm:hidden">
              {timeLabel}
            </span>

            <span className="hidden shrink-0 font-mono text-[11px] tabular-nums text-paperis-text-3 sm:inline">
              {timeLabel}
            </span>

            <div className="flex shrink-0 items-center gap-0.5">
              <IconButton
                onClick={player.prev}
                label="이전 트랙 (Shift+←)"
                disabled={currentIndex <= 0}
              >
                <PrevIcon />
              </IconButton>
              <IconButton
                onClick={() => player.seekBy(-10000)}
                label="-10초 (←)"
                extraClass="hidden sm:inline-flex"
              >
                <span className="font-mono text-[10px]">−10</span>
              </IconButton>
              <IconButton
                onClick={() => player.seekBy(10000)}
                label="+10초 (→)"
                extraClass="hidden sm:inline-flex"
              >
                <span className="font-mono text-[10px]">+10</span>
              </IconButton>
              <IconButton
                onClick={player.next}
                label="다음 트랙 (Shift+→)"
                disabled={currentIndex + 1 >= queue.length}
              >
                <NextIcon />
              </IconButton>
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
      </div>
    </>
  );
}

/**
 * 풀너비 진행 막대 — 시각 progress fill + 드래그 thumb (input[type=range] 오버레이).
 * Range input은 트랙이 투명, thumb만 보임. 사용자는 thumb을 잡고 드래그 가능.
 */
function SeekBar({
  currentTimeMs,
  durationMs,
  progress,
  onSeek,
}: {
  currentTimeMs: number;
  durationMs: number;
  progress: number;
  onSeek: (ms: number) => void;
}) {
  // 사용자가 드래그 중일 때는 input.value를 그대로 반영(외부 currentTime이 따라잡기 전 jitter 방지).
  const [draggingValue, setDraggingValue] = useState<number | null>(null);
  const displayValue = draggingValue ?? currentTimeMs;
  const displayProgress =
    durationMs > 0 ? Math.min(100, (displayValue / durationMs) * 100) : progress;

  return (
    <div className="relative h-3">
      {/* 시각 progress fill — 풀너비 3px bar, 위쪽 정렬 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-paperis-border"
        aria-hidden
      >
        <div
          className="h-full bg-paperis-accent transition-[width]"
          style={{ width: `${displayProgress}%` }}
        />
      </div>
      {/* 드래그 thumb overlay — 트랙은 투명, thumb만 보임 (globals.css .paperis-seek) */}
      <input
        type="range"
        min={0}
        max={Math.max(1, durationMs)}
        step={100}
        value={displayValue}
        onChange={(e) => setDraggingValue(Number(e.target.value))}
        onMouseUp={() => {
          if (draggingValue !== null) {
            onSeek(draggingValue);
            setDraggingValue(null);
          }
        }}
        onTouchEnd={() => {
          if (draggingValue !== null) {
            onSeek(draggingValue);
            setDraggingValue(null);
          }
        }}
        aria-label="재생 위치"
        className="paperis-seek absolute inset-x-0 top-0 h-3 w-full"
      />
    </div>
  );
}

/**
 * 제목 + 메타 줄. 제목이 컨테이너보다 길면 좌우 marquee 애니메이션 활성화.
 * ResizeObserver로 너비 변화 감지 → data-overflow="true" 토글.
 */
function MarqueeTitle({ title, meta }: { title: string; meta: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;
    const check = () => {
      const isOverflow = track.scrollWidth > container.clientWidth + 2;
      setOverflow(isOverflow);
      if (isOverflow) {
        container.style.setProperty(
          "--marquee-container-w",
          `${container.clientWidth}px`
        );
      }
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(container);
    ro.observe(track);
    return () => ro.disconnect();
  }, [title]);

  return (
    <div className="min-w-0 flex-1">
      <div
        ref={containerRef}
        data-paperis-marquee={overflow ? "true" : "false"}
        className="relative overflow-hidden"
      >
        <span
          ref={trackRef}
          data-marquee-track
          className={
            overflow
              ? "block text-sm font-medium text-paperis-text"
              : "block truncate text-sm font-medium text-paperis-text"
          }
        >
          {title}
        </span>
      </div>
      <p className="truncate text-[11px] text-paperis-text-3">{meta}</p>
    </div>
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

function IconButton({
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

// ── SVG icons (인라인) — 이모지 ⏸/▶/⏮/⏭의 iOS 컬러 렌더링 회피 ──────────

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <rect x="5" y="6" width="2" height="12" rx="0.5" />
      <path d="M19 6v12L9 12z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-4 w-4"
      aria-hidden
    >
      <rect x="17" y="6" width="2" height="12" rx="0.5" />
      <path d="M5 6v12l10-6z" />
    </svg>
  );
}
