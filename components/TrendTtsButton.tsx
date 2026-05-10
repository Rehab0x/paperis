"use client";

// 트렌드 narrationScript를 TTS로 변환해 라이브러리에 추가.
//
// 일반 paper TTS와 다른 점:
//   - 입력이 paper가 아니라 이미 narration 형태인 script — `/api/tts/text` 사용 (Gemini
//     narration 생성 단계 스킵, Vercel timeout 여유 + Gemini quota 절약)
//   - audio-library의 AudioTrack은 paperSnapshot 필수 → fake paper 생성해서 채움.
//     pmid는 "trend:{issn}:{year}:{quarter}" 형태로 충돌 회피
//   - TtsQueueProvider 안 거침 — trend 변환은 사용자가 의도적으로 누르는 단발성

import { useState } from "react";
import { useTtsProviderPreference } from "@/components/TtsProviderPreferenceProvider";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { appendTrack } from "@/lib/audio-library";
import type { Paper } from "@/types";

interface Props {
  narrationScript: string;
  issn: string;
  journalName: string;
  year: number;
  quarter: string;
  periodLabel: string;
  headline: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export default function TrendTtsButton({
  narrationScript,
  issn,
  journalName,
  year,
  quarter,
  periodLabel,
  headline,
}: Props) {
  const { provider, effectiveVoice, speakingRate } =
    useTtsProviderPreference();
  const fetchWithKeys = useFetchWithKeys();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function handleClick() {
    if (status.kind === "running") return;
    if (!narrationScript || narrationScript.trim().length < 20) {
      setStatus({ kind: "error", message: "narration 스크립트가 비어 있습니다." });
      return;
    }
    setStatus({ kind: "running" });

    try {
      const res = await fetchWithKeys("/api/tts/text", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text: narrationScript,
          language: "ko",
          providerName: provider,
          voice: effectiveVoice,
          speakingRate,
        }),
      });
      if (!res.ok) {
        const rawText = await res.text();
        let msg = `TTS 변환 실패 (${res.status})`;
        try {
          const j = JSON.parse(rawText);
          if (j && typeof j.error === "string") msg = j.error;
        } catch {
          if (rawText) msg = `${msg}: ${rawText.slice(0, 200)}`;
        }
        setStatus({ kind: "error", message: msg });
        return;
      }

      const audioBlob = await res.blob();
      const durationMs = Number(res.headers.get("x-audio-duration-ms")) || 0;
      const ttsProvider = res.headers.get("x-tts-provider") ?? provider;
      const ttsVoice = res.headers.get("x-tts-voice") ?? effectiveVoice;

      // 트렌드용 fake paper — audio-library AudioTrack의 paperSnapshot 필수 충족.
      // pmid는 "trend:..." prefix로 PubMed paper와 충돌 회피.
      const fakePaper: Paper = {
        pmid: `trend:${issn}:${year}:${quarter}`,
        title: `${journalName} — ${periodLabel} 트렌드 브리핑`,
        abstract: headline || narrationScript.slice(0, 280),
        authors: ["Paperis Trend Analyzer"],
        journal: journalName,
        year: String(year),
        pubDate: String(year),
        doi: null,
        pmcId: null,
        publicationTypes: ["Trend Briefing"],
        access: "open",
        url: `/journal/${encodeURIComponent(issn)}?tab=trend&from=`,
      };

      await appendTrack({
        paper: fakePaper,
        language: "ko",
        voice: ttsVoice,
        providerName: ttsProvider,
        audioBlob,
        durationMs,
        narrationText: narrationScript,
      });
      setStatus({ kind: "done" });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "TTS 변환 실패",
      });
    }
  }

  let label = "🎧 트렌드 브리핑 → 라이브러리";
  if (status.kind === "running") label = "변환 중…";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status.kind === "running"}
        className="inline-flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
      >
        {label}
      </button>
      {status.kind === "running" ? (
        <p className="text-xs text-zinc-500">
          음성 합성에 30~120초 정도 걸립니다 (스크립트 길이에 따라). 변환 동안
          탐색을 계속하셔도 됩니다.
        </p>
      ) : null}
      {status.kind === "done" ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
          🎉 라이브러리 끝에 추가됨 — 헤더의 라이브러리에서 들으세요
        </p>
      ) : null}
      {status.kind === "error" ? (
        <pre className="whitespace-pre-wrap break-words rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 font-sans text-xs leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {status.message}
        </pre>
      ) : null}
    </div>
  );
}
