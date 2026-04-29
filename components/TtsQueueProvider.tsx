"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { appendTrack } from "@/lib/audio-library";
import type { Language, Paper } from "@/types";

// 전역 TTS 변환 큐.
// - layout에 단일 인스턴스로 마운트되어 페이지 이동에도 변환이 끊기지 않는다.
// - FIFO 단일 워커: /api/tts에 한 번에 한 건만 보낸다 (rate-limit 우호).
// - 사용자는 변환 중에도 다른 논문의 TTS를 추가로 enqueue 할 수 있다 — 끝나면 자동으로 다음을 처리.
// - 각 job 완료 시 IndexedDB에 트랙 append (라이브러리 페이지가 즉시 갱신).

export type TtsJobStatus = "queued" | "running" | "done" | "failed";

export interface TtsJob {
  id: string;
  paper: Paper;
  language: Language;
  voice?: string;
  fullText?: string | null;
  sourceLabel?: string;
  status: TtsJobStatus;
  error?: string;
  enqueuedAt: number;
  finishedAt?: number;
}

interface EnqueueInput {
  paper: Paper;
  language: Language;
  voice?: string;
  fullText?: string | null;
  sourceLabel?: string;
}

interface TtsQueueValue {
  jobs: TtsJob[];
  enqueue: (input: EnqueueInput) => string;
  clearCompleted: () => void;
  cancel: (jobId: string) => void;
}

const Ctx = createContext<TtsQueueValue | null>(null);

export function useTtsQueue(): TtsQueueValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useTtsQueue는 TtsQueueProvider 안에서만 호출되어야 합니다.");
  }
  return ctx;
}

function newJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tts-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function TtsQueueProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [jobs, setJobs] = useState<TtsJob[]>([]);
  const jobsRef = useRef<TtsJob[]>([]);
  const runningRef = useRef(false);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  const updateJob = useCallback(
    (id: string, patch: Partial<TtsJob>) => {
      setJobs((prev) =>
        prev.map((j) => (j.id === id ? { ...j, ...patch } : j))
      );
    },
    []
  );

  const processNext = useCallback(async () => {
    if (runningRef.current) return;
    const next = jobsRef.current.find((j) => j.status === "queued");
    if (!next) return;
    runningRef.current = true;
    updateJob(next.id, { status: "running" });

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          paper: next.paper,
          language: next.language,
          voice: next.voice,
          sourceLabel: next.sourceLabel,
          fullText: next.fullText ?? undefined,
        }),
      });

      if (!res.ok) {
        let msg = `TTS 실패 (${res.status})`;
        try {
          const j = await res.json();
          if (j && typeof j.error === "string") msg = j.error;
        } catch {
          // ignore
        }
        updateJob(next.id, {
          status: "failed",
          error: msg,
          finishedAt: Date.now(),
        });
      } else {
        const blob = await res.blob();
        const durationMsHeader = res.headers.get("x-audio-duration-ms");
        const durationMs = durationMsHeader ? Number(durationMsHeader) || 0 : 0;
        const usedVoice =
          res.headers.get("x-tts-voice") ?? next.voice ?? "Kore";
        const usedProvider =
          res.headers.get("x-tts-provider") ?? "gemini";

        try {
          await appendTrack({
            paper: next.paper,
            language: next.language,
            voice: usedVoice,
            providerName: usedProvider,
            audioBlob: blob,
            durationMs,
          });
          updateJob(next.id, {
            status: "done",
            finishedAt: Date.now(),
          });
        } catch (err) {
          updateJob(next.id, {
            status: "failed",
            error:
              err instanceof Error
                ? `라이브러리 저장 실패: ${err.message}`
                : "라이브러리 저장 실패",
            finishedAt: Date.now(),
          });
        }
      }
    } catch (err) {
      updateJob(next.id, {
        status: "failed",
        error: err instanceof Error ? err.message : "TTS 실패",
        finishedAt: Date.now(),
      });
    } finally {
      runningRef.current = false;
      // 큐에 다음 작업이 있으면 이어서
      setTimeout(() => {
        void processNext();
      }, 0);
    }
  }, [updateJob]);

  const enqueue = useCallback(
    (input: EnqueueInput): string => {
      const id = newJobId();
      const job: TtsJob = {
        id,
        paper: input.paper,
        language: input.language,
        voice: input.voice,
        fullText: input.fullText,
        sourceLabel: input.sourceLabel,
        status: "queued",
        enqueuedAt: Date.now(),
      };
      setJobs((prev) => [...prev, job]);
      // setJobs 직후엔 jobsRef가 아직 안 갱신됐을 수 있어 setTimeout 0
      setTimeout(() => {
        void processNext();
      }, 0);
      return id;
    },
    [processNext]
  );

  const clearCompleted = useCallback(() => {
    setJobs((prev) =>
      prev.filter((j) => j.status === "queued" || j.status === "running")
    );
  }, []);

  const cancel = useCallback((jobId: string) => {
    // running 작업은 fetch가 이미 진행 중이라 취소 안 됨 (네트워크 응답은 도착하면 무시).
    // queued만 제거.
    setJobs((prev) => prev.filter((j) => !(j.id === jobId && j.status === "queued")));
  }, []);

  return (
    <Ctx.Provider value={{ jobs, enqueue, clearCompleted, cancel }}>
      {children}
    </Ctx.Provider>
  );
}
