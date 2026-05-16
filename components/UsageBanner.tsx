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
import { useAppMessages } from "@/components/useAppMessages";
import { fmt } from "@/lib/i18n";
import type { UsageSnapshot } from "@/lib/usage";

const FEATURE_AUTH = process.env.NEXT_PUBLIC_FEATURE_AUTH === "1";

interface DismissState {
  yearMonth: string;
  dismissedAt: number;
}

const DISMISS_KEY = "paperis.usage-banner.dismissed";

export default function UsageBanner() {
  const m = useAppMessages();
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
  // BYOK는 모든 한도 ∞ — 배너 안 뜸. Free/Balanced/Pro는 finite 한도 있는 kind만 점검.
  if (usage.plan === "byok") return null;

  // 어떤 종류든 remaining=0이면 "초과", remaining<=1이면 "임박".
  // limit이 Infinity인 항목은 자동 제외 (remaining도 Infinity → 조건 false).
  const exhausted = (
    ["curation", "tts", "fulltext"] as const
  ).filter((k) => Number.isFinite(usage[k].limit) && usage[k].remaining <= 0);
  const nearing = (
    ["curation", "tts", "fulltext"] as const
  ).filter(
    (k) =>
      Number.isFinite(usage[k].limit) &&
      usage[k].remaining > 0 &&
      usage[k].remaining <= 1
  );

  if (exhausted.length === 0 && nearing.length === 0) return null;

  const isExhausted = exhausted.length > 0;
  const targets = isExhausted ? exhausted : nearing;
  const labels: Record<typeof targets[number], string> = {
    curation: m.usage.kind.curation,
    tts: m.usage.kind.tts,
    fulltext: m.usage.kind.fulltext,
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
    ? "border-paperis-accent/40 bg-paperis-accent-dim/40 text-paperis-text"
    : "border-paperis-border bg-paperis-surface text-paperis-text";
  const ctaTone = "bg-paperis-accent text-paperis-bg hover:opacity-90";

  return (
    <div className={`mx-auto max-w-6xl px-4 pt-3`}>
      <div className={`flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-sm ${tone}`}>
        <span aria-hidden>{isExhausted ? "⚠️" : "💡"}</span>
        <span className="min-w-0 flex-1">
          {fmt(isExhausted ? m.usage.exhausted : m.usage.running, { label })}{" "}
          <span className="opacity-80">{m.usage.upgradeHint}</span>
        </span>
        <Link
          href="/billing"
          className={`inline-flex h-7 shrink-0 items-center rounded-md px-3 text-xs font-medium ${ctaTone}`}
        >
          {m.usage.upgrade}
        </Link>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label={m.usage.closeAria}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-60 hover:opacity-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
