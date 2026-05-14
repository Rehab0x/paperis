"use client";

import { useEffect, useState } from "react";
import { usePlayer } from "@/components/PlayerProvider";
import { useAppMessages } from "@/components/useAppMessages";
import {
  clearTracks,
  getTrackAudio,
  listTrackMetas,
  moveTrackDown,
  moveTrackUp,
  removeTrack,
  subscribeAudioLibrary,
} from "@/lib/audio-library";
import { fmt } from "@/lib/i18n";
import type { AudioTrackMeta } from "@/types";

interface Props {
  /**
   * 사용자가 트랙의 "🔎논문" 버튼을 누를 때 호출.
   * 부모(드로어)가 URL을 ?pmid=… 로 바꾸고 디테일 패널을 띄운다.
   */
  onOpenPaper?: (track: AudioTrackMeta) => void;
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

function extensionForMime(mime: string): string {
  if (mime === "audio/mpeg") return "mp3";
  if (mime === "audio/wav" || mime === "audio/x-wav") return "wav";
  if (mime === "audio/ogg") return "ogg";
  return "audio";
}

async function downloadTrack(track: AudioTrackMeta, missingMsg: string): Promise<void> {
  // 메타에는 audioBlob이 없으므로 다운로드 시점에만 IndexedDB에서 로드.
  const blob = await getTrackAudio(track.id);
  if (!blob) {
    window.alert(missingMsg);
    return;
  }
  const ext = extensionForMime(blob.type || "audio/wav");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paperis-${track.pmid}-${safeFilename(track.title)}.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AudioLibrary({ onOpenPaper }: Props) {
  const m = useAppMessages();
  const player = usePlayer();
  const [tracks, setTracks] = useState<AudioTrackMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 한 번에 한 트랙의 스크립트만 펼침 (위로 길게 늘어지는 걸 막기 위해)
  const [scriptOpenId, setScriptOpenId] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const list = await listTrackMetas();
      setTracks(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.library.loadFailed);
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

  async function handleRemove(track: AudioTrackMeta) {
    const ok = window.confirm(
      fmt(m.library.confirmDelete, { title: track.title })
    );
    if (!ok) return;
    await removeTrack(track.id);
  }

  async function handleClearAll() {
    if (tracks.length === 0) return;
    const ok = window.confirm(
      fmt(m.library.confirmClearAll, { count: tracks.length })
    );
    if (!ok) return;
    await clearTracks();
  }

  function handlePlay(track: AudioTrackMeta, idx: number) {
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
    return <p className="text-sm text-paperis-text-3">{m.library.loading}</p>;
  }
  if (error) {
    return (
      <p className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 p-3 text-sm text-paperis-accent">
        {error}
      </p>
    );
  }
  if (tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-8 text-center text-sm text-paperis-text-3">
        {m.library.empty}
        <br />
        {m.library.emptyHint}
      </div>
    );
  }

  const totalMs = tracks.reduce((acc, t) => acc + (t.durationMs || 0), 0);
  const totalBytes = tracks.reduce((acc, t) => acc + (t.audioByteSize ?? 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-paperis-text-3">
          {fmt(m.library.stats, {
            count: tracks.length,
            duration: formatDuration(totalMs),
            bytes: formatBytes(totalBytes),
          })}
        </p>
        <button
          type="button"
          onClick={handleClearAll}
          className="rounded-lg border border-paperis-border px-2 py-1 text-xs text-paperis-text-3 transition hover:border-paperis-accent hover:bg-paperis-accent-dim/40 hover:text-paperis-accent"
        >
          {m.library.clearAll}
        </button>
      </div>
      <ol className="overflow-hidden rounded-xl border border-paperis-border bg-paperis-surface">
        {tracks.map((track, idx) => {
          const playingThis =
            player.currentIndex >= 0 &&
            player.queue[player.currentIndex]?.id === track.id;
          const isFirst = idx === 0;
          const isLast = idx === tracks.length - 1;
          const scriptOpen = scriptOpenId === track.id;
          return (
            <li
              key={track.id}
              className={[
                "border-b border-paperis-border last:border-b-0",
                playingThis ? "bg-paperis-accent-dim/30" : "",
              ].join(" ")}
            >
            <div className="group flex items-center gap-2 px-3 py-1.5">
              <span className="w-7 shrink-0 text-center font-mono text-[11px] tabular-nums text-paperis-text-3">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <button
                type="button"
                onClick={() => handlePlay(track, idx)}
                className="min-w-0 flex-1 cursor-pointer text-left"
                aria-label={fmt(m.library.playAria, { title: track.title })}
                title={m.library.playTitle}
              >
                <p className="truncate text-sm font-medium leading-tight text-paperis-text">
                  {playingThis ? (
                    <span className="mr-1 text-paperis-accent">
                      {player.isPlaying ? "▶" : "⏸"}
                    </span>
                  ) : null}
                  {/* 소스 배지 — pmid "trend:" prefix면 트렌드, 아니면 sourceLabel
                      유무로 풀텍스트/abstract 구분. legacy 트랙(sourceLabel 없음)은
                      모두 abstract로 표시. */}
                  {(() => {
                    const isTrend = track.pmid.startsWith("trend:");
                    const isFull = !isTrend && Boolean(track.sourceLabel);
                    const label = isTrend
                      ? m.library.trendBadge
                      : isFull
                        ? m.library.fulltextBadge
                        : m.library.abstractBadge;
                    return (
                      <span
                        className="mr-1.5 rounded bg-paperis-accent-dim/40 px-1.5 py-0.5 text-[9px] font-medium text-paperis-accent"
                        title={isFull ? track.sourceLabel : undefined}
                      >
                        {label}
                      </span>
                    );
                  })()}
                  {track.titleKo ?? track.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-paperis-text-3">
                  {track.journal} · {track.year} ·{" "}
                  {formatDuration(track.durationMs)} · {track.voice} ·{" "}
                  {formatDate(track.createdAt)}
                </p>
              </button>

              <div className="flex shrink-0 items-center gap-0">
                <button
                  type="button"
                  onClick={() => moveTrackUp(track.id)}
                  disabled={isFirst}
                  className="rounded px-1 py-0.5 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:opacity-20"
                  aria-label={m.library.moveUp}
                  title={m.library.moveUp}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => moveTrackDown(track.id)}
                  disabled={isLast}
                  className="rounded px-1 py-0.5 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text disabled:opacity-20"
                  aria-label={m.library.moveDown}
                  title={m.library.moveDown}
                >
                  ↓
                </button>
                {onOpenPaper ? (
                  <button
                    type="button"
                    onClick={() => onOpenPaper(track)}
                    className="rounded px-1.5 py-0.5 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
                    aria-label={m.library.openPaperAria}
                    title={m.library.openPaperTitle}
                  >
                    🔎
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setScriptOpenId((prev) => (prev === track.id ? null : track.id))
                  }
                  disabled={!track.narrationText}
                  className={[
                    "rounded px-1.5 py-0.5 text-xs transition",
                    scriptOpen
                      ? "bg-paperis-accent text-paperis-bg"
                      : "text-paperis-text-3 hover:bg-paperis-surface-2 hover:text-paperis-text",
                    !track.narrationText ? "opacity-30 cursor-not-allowed" : "",
                  ].join(" ")}
                  aria-label={m.library.scriptAria}
                  title={
                    track.narrationText
                      ? scriptOpen
                        ? m.library.scriptCollapseTitle
                        : m.library.scriptExpandTitle
                      : m.library.scriptUnavailableTitle
                  }
                >
                  📜
                </button>
                <button
                  type="button"
                  onClick={() => void downloadTrack(track, m.library.audioMissing)}
                  className="rounded px-1.5 py-0.5 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
                  aria-label={m.library.downloadAria}
                  title={m.library.downloadTitle}
                >
                  💾
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(track)}
                  className="rounded px-1.5 py-0.5 text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-accent"
                  aria-label={m.library.deleteAria}
                  title={m.library.deleteTitle}
                >
                  🗑
                </button>
              </div>
            </div>
            {scriptOpen && track.narrationText ? (
              <div className="border-t border-paperis-border bg-paperis-surface-2 px-4 py-3">
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-paperis-text-2">
                  {track.narrationText}
                </p>
              </div>
            ) : null}
            </li>
          );
        })}
      </ol>
      <p className="text-[11px] text-paperis-text-3">{m.library.footer}</p>
    </div>
  );
}
