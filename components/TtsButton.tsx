"use client";

import { useTtsProviderPreference } from "@/components/TtsProviderPreferenceProvider";
import { useTtsQueue } from "@/components/TtsQueueProvider";
import type { Language, Paper } from "@/types";

interface Props {
  paper: Paper;
  language: Language;
  fullText?: string | null;
  sourceLabel?: string;
  voice?: string;
  /** 명시 시 사용자 선호를 무시하고 이 provider로 강제 (보통 미지정) */
  providerName?: string;
}

export default function TtsButton({
  paper,
  language,
  fullText,
  sourceLabel,
  voice,
  providerName,
}: Props) {
  const { jobs, enqueue, cancel } = useTtsQueue();
  const {
    provider: preferredProvider,
    effectiveVoice,
    speakingRate,
  } = useTtsProviderPreference();
  const effectiveProvider = providerName ?? preferredProvider;
  const effectiveVoiceFinal = voice ?? effectiveVoice;

  // 이 논문+언어에 대한 가장 최근 job
  const myJob = [...jobs]
    .reverse()
    .find((j) => j.paper.pmid === paper.pmid && j.language === language);
  const isActive =
    myJob?.status === "queued" || myJob?.status === "running";

  // 내 앞에 대기 중인 다른 job이 몇 개?
  const aheadCount = (() => {
    if (myJob?.status !== "queued") return 0;
    return jobs.filter(
      (j) =>
        j.id !== myJob.id &&
        j.enqueuedAt < myJob.enqueuedAt &&
        (j.status === "queued" || j.status === "running")
    ).length;
  })();

  function handleClick() {
    if (isActive) return;
    enqueue({
      paper,
      language,
      voice: effectiveVoiceFinal,
      fullText,
      sourceLabel,
      providerName: effectiveProvider,
      speakingRate,
    });
  }

  let label = "🎧 TTS 변환 → 라이브러리";
  if (myJob?.status === "running") label = "변환 중…";
  else if (myJob?.status === "queued")
    label = aheadCount > 0 ? `대기 중 (앞에 ${aheadCount}편)` : "대기 중";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleClick}
          disabled={isActive}
          className="inline-flex items-center gap-2 rounded-lg bg-paperis-accent px-3 py-1.5 text-sm font-medium text-paperis-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {label}
        </button>
        {myJob?.status === "queued" ? (
          <button
            type="button"
            onClick={() => cancel(myJob.id)}
            className="text-xs text-paperis-text-3 underline transition hover:text-paperis-text"
          >
            대기 취소
          </button>
        ) : null}
      </div>
      {myJob?.status === "done" ? (
        <p className="rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 text-xs text-paperis-accent">
          🎉 라이브러리 끝에 추가됨 — 헤더의 라이브러리에서 들으세요
        </p>
      ) : null}
      {myJob?.status === "failed" ? (
        <pre className="whitespace-pre-wrap break-words rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2.5 py-1.5 font-sans text-xs leading-relaxed text-paperis-accent">
          {myJob.error ?? "TTS 실패"}
        </pre>
      ) : null}
      {myJob?.status === "running" ? (
        <p className="text-xs text-paperis-text-3">
          narration 생성 + 음성 합성에 30~90초 정도 걸립니다. 변환 동안
          검색·탐색을 계속하셔도 됩니다.
        </p>
      ) : null}
      {myJob?.status === "queued" ? (
        <p className="text-xs text-paperis-text-3">
          현재 변환 작업이 끝나면 자동으로 이어서 변환합니다.
        </p>
      ) : null}
    </div>
  );
}
