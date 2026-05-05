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
  providerName?: string;
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
  providerName?: string;
}

interface TtsQueueValue {
  jobs: TtsJob[];
  enqueue: (input: EnqueueInput) => string;
  clearCompleted: () => void;
  cancel: (jobId: string) => void;
  /** 큐가 막 비었을 때 한 번 뜨는 토스트 메시지 (사라지면 null) */
  completionToast: string | null;
  dismissCompletionToast: () => void;
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

  // 큐가 비는 순간(active=0) 직전에 active>0이었으면 "모든 변환 끝났다"는 시그널.
  // 페이지 내 토스트 + Notification API(권한 있을 때).
  // 이번 batch에서 완료된 job만 카운트해야 함 — 직전 알림 시점 이후 finishedAt 만 셈.
  const prevActiveCountRef = useRef(0);
  const lastNotifyAtRef = useRef(0);
  const [completionToast, setCompletionToast] = useState<string | null>(null);
  const completionToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  useEffect(() => {
    const activeCount = jobs.filter(
      (j) => j.status === "queued" || j.status === "running"
    ).length;
    if (prevActiveCountRef.current > 0 && activeCount === 0) {
      const since = lastNotifyAtRef.current;
      const recent = jobs.filter(
        (j) =>
          (j.status === "done" || j.status === "failed") &&
          (j.finishedAt ?? 0) > since
      );
      const done = recent.filter((j) => j.status === "done").length;
      const failed = recent.filter((j) => j.status === "failed").length;
      const message =
        failed > 0
          ? `TTS 변환 끝 — 성공 ${done}편, 실패 ${failed}편`
          : `TTS 변환 끝 — ${done}편 라이브러리에 추가됨`;
      lastNotifyAtRef.current = Date.now();

      // 1) 페이지 내 토스트 (항상)
      setCompletionToast(message);
      if (completionToastTimerRef.current) {
        clearTimeout(completionToastTimerRef.current);
      }
      completionToastTimerRef.current = setTimeout(() => {
        setCompletionToast(null);
      }, 6000);

      // 2) 브라우저 Notification (백그라운드 탭에서도 보임). 권한 있을 때만.
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        try {
          const n = new Notification("Paperis", {
            body: message,
            icon: "/icons/icon-192.png",
            tag: "paperis-tts-complete",
            silent: false,
          });
          n.onclick = () => {
            window.focus();
            n.close();
          };
        } catch {
          // 일부 환경(iOS PWA 등)에서 Notification 생성 실패 — 토스트로 충분
        }
      }
    }
    prevActiveCountRef.current = activeCount;
  }, [jobs]);

  const processNext = useCallback(async () => {
    if (runningRef.current) return;
    const next = jobsRef.current.find((j) => j.status === "queued");
    if (!next) return;
    runningRef.current = true;
    updateJob(next.id, { status: "running" });

    const startedAt = Date.now();
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
          providerName: next.providerName,
        }),
      });

      if (!res.ok) {
        const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
        let msg = `TTS 실패 (HTTP ${res.status})`;
        try {
          const ctype = res.headers.get("content-type") ?? "";
          if (ctype.includes("json")) {
            const j = await res.json();
            if (j && typeof j.error === "string") msg = j.error;
          } else {
            // Vercel function timeout 등은 종종 text/plain 504
            const txt = (await res.text()).slice(0, 200);
            if (txt) msg = `TTS 실패 (${res.status}): ${txt}`;
          }
        } catch {
          // ignore
        }
        if (res.status === 504 || res.status === 502) {
          msg = `${msg}\n서버 응답이 ${elapsedSec}초 만에 끊김 — Vercel function 시간 제한(최대 300초) 도달 가능성. narration이 매우 길면 분할 호출이 필요합니다.`;
        }
        updateJob(next.id, {
          status: "failed",
          error: msg,
          finishedAt: Date.now(),
        });
      } else {
        const rawBlob = await res.blob();
        const usedFormat =
          res.headers.get("x-tts-format") ?? rawBlob.type ?? "audio/wav";
        // 응답 본문 Blob의 type이 비어 있을 수 있으니 명시적으로 다시 만든다 —
        // 다운로드/재생 시 mime이 정확해야 한다.
        const blob = new Blob([rawBlob], { type: usedFormat });
        const durationMsHeader = res.headers.get("x-audio-duration-ms");
        const durationMs = durationMsHeader ? Number(durationMsHeader) || 0 : 0;
        const usedVoice =
          res.headers.get("x-tts-voice") ?? next.voice ?? "Kore";
        const usedProvider =
          res.headers.get("x-tts-provider") ?? "gemini";
        // narration 원문 (재생 중 스크립트 보기용). 헤더 없거나 디코딩 실패해도 트랙은 정상 저장.
        let narrationText: string | undefined;
        const narrationB64 = res.headers.get("x-tts-narration-b64");
        if (narrationB64) {
          try {
            narrationText = atob(narrationB64);
            // base64 → utf-8 텍스트 (atob은 Latin-1 바이트 문자열이라 다중바이트 복원 필요)
            try {
              const bytes = Uint8Array.from(narrationText, (c) =>
                c.charCodeAt(0)
              );
              narrationText = new TextDecoder("utf-8").decode(bytes);
            } catch {
              // 환경별 fallback — 그냥 atob 결과 유지
            }
          } catch {
            narrationText = undefined;
          }
        }

        try {
          await appendTrack({
            paper: next.paper,
            language: next.language,
            voice: usedVoice,
            providerName: usedProvider,
            audioBlob: blob,
            durationMs,
            narrationText,
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
      const elapsedSec = Math.round((Date.now() - startedAt) / 1000);
      let msg = "TTS 실패";
      if (err instanceof TypeError) {
        // 브라우저 fetch가 reject하는 가장 흔한 케이스 — 네트워크/서버 미응답.
        // "Failed to fetch"로만 보이는 그것.
        msg =
          `네트워크/서버 응답 실패 (${elapsedSec}초 경과): ${err.message}\n` +
          "원인 후보:\n" +
          "  • Vercel function timeout (현재 maxDuration 5분)\n" +
          "  • Gemini TTS API 가 비정상 종료\n" +
          "  • 네트워크 끊김 / 슬립 / 탭 백그라운드 throttling\n" +
          "Vercel 대시보드 → Functions → Logs 에서 /api/tts 의 실제 종료 사유를 확인해 주세요.";
      } else if (err instanceof Error) {
        msg = `${err.message} (${elapsedSec}초 경과)`;
      }
      updateJob(next.id, {
        status: "failed",
        error: msg,
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
      // user gesture 안에서 알림 권한 한 번 요청 (이미 결정됐으면 noop)
      if (
        typeof window !== "undefined" &&
        "Notification" in window &&
        Notification.permission === "default"
      ) {
        try {
          void Notification.requestPermission();
        } catch {
          // safari 구버전 등 — 무시
        }
      }
      const id = newJobId();
      const job: TtsJob = {
        id,
        paper: input.paper,
        language: input.language,
        voice: input.voice,
        fullText: input.fullText,
        sourceLabel: input.sourceLabel,
        providerName: input.providerName,
        status: "queued",
        enqueuedAt: Date.now(),
      };
      setJobs((prev) => [...prev, job]);
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

  const dismissCompletionToast = useCallback(() => {
    setCompletionToast(null);
    if (completionToastTimerRef.current) {
      clearTimeout(completionToastTimerRef.current);
      completionToastTimerRef.current = null;
    }
  }, []);

  return (
    <Ctx.Provider
      value={{
        jobs,
        enqueue,
        clearCompleted,
        cancel,
        completionToast,
        dismissCompletionToast,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
