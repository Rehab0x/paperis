"use client";

// 사용량 한도 안내 배너 — 자유 한도 잔여가 적거나 0일 때만 표시.
//
// 어디에 마운트하나:
//   - /journal layout (저널 큐레이션 흐름에서 한도 소진 가능성 가장 높음)
//   - 페이지 진입 시 1회 fetch /api/account/usage. plan != free면 아무것도 안 보임.
//
// 다른 사람의 사용량 노출 방지 — anon-id (X-Paperis-Anon-Id) 헤더는 클라가
// 알아서 붙이지 않음 (서버에서 anon 식별 못 하면 그냥 한도 적용 안 됨).

import { useEffect, useState } from "react";
import Link from "next/link";
import type { UsageSnapshot } from "@/lib/usage";

const FEATURE_AUTH = process.env.NEXT_PUBLIC_FEATURE_AUTH === "1";

interface DismissState {
  yearMonth: string;
  dismissedAt: number;
}

const DISMISS_KEY = "paperis.usage-banner.dismissed";

export default function UsageBanner() {
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!FEATURE_AUTH) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/usage", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as UsageSnapshot;
        if (cancelled) return;
        setUsage(data);
        // 같은 월의 dismissed 상태 복원
        try {
          const raw = localStorage.getItem(DISMISS_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as DismissState;
            if (parsed.yearMonth === data.yearMonth) {
              setDismissed(true);
            }
          }
        } catch {}
      } catch {
        // 조용히 무시 — 배너는 부가 기능
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!usage || dismissed) return null;
  if (usage.plan !== "free") return null;

  // 어떤 종류든 remaining=0이면 "초과", remaining<=1이면 "임박"
  const exhausted = (
    ["curation", "tts", "fulltext"] as const
  ).filter((k) => usage[k].remaining <= 0);
  const nearing = (
    ["curation", "tts", "fulltext"] as const
  ).filter((k) => usage[k].remaining > 0 && usage[k].remaining <= 1);

  if (exhausted.length === 0 && nearing.length === 0) return null;

  const isExhausted = exhausted.length > 0;
  const targets = isExhausted ? exhausted : nearing;
  const labels: Record<typeof targets[number], string> = {
    curation: "저널 큐레이션",
    tts: "TTS 변환",
    fulltext: "풀텍스트 요약",
  };
  const label = targets.map((k) => labels[k]).join(" · ");

  function handleDismiss() {
    setDismissed(true);
    try {
      const state: DismissState = {
        yearMonth: usage!.yearMonth,
        dismissedAt: Date.now(),
      };
      localStorage.setItem(DISMISS_KEY, JSON.stringify(state));
    } catch {}
  }

  const tone = isExhausted
    ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100"
    : "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100";
  const ctaTone = isExhausted
    ? "bg-red-600 text-white hover:bg-red-700"
    : "bg-amber-600 text-white hover:bg-amber-700";

  return (
    <div className={`mx-auto max-w-6xl px-4 pt-3`}>
      <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm ${tone}`}>
        <span aria-hidden>{isExhausted ? "⚠️" : "💡"}</span>
        <span className="min-w-0 flex-1">
          {isExhausted
            ? `이번 달 ${label} 무료 한도를 모두 사용했습니다.`
            : `이번 달 ${label} 무료 한도가 거의 소진됐습니다.`}{" "}
          <span className="opacity-80">
            BYOK(9,900원·평생) 또는 Pro(4,900원/월) 업그레이드로 한도를 해제하세요.
          </span>
        </span>
        <Link
          href="/billing"
          className={`inline-flex h-7 shrink-0 items-center rounded-md px-3 text-xs font-medium ${ctaTone}`}
        >
          업그레이드
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="배너 닫기"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
