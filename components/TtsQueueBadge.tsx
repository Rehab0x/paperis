"use client";

import { useTtsQueue } from "@/components/TtsQueueProvider";

export default function TtsQueueBadge() {
  const { jobs } = useTtsQueue();
  const running = jobs.find((j) => j.status === "running");
  const queued = jobs.filter((j) => j.status === "queued").length;

  if (!running && queued === 0) return null;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
      title={
        running
          ? `현재 변환 중: ${running.paper.title}`
          : `${queued}편 대기 중`
      }
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
      {running ? "TTS 변환 중" : "TTS 대기"}
      {queued > 0 ? ` · ${queued}편 대기` : ""}
    </span>
  );
}
