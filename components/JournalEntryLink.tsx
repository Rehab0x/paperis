"use client";

import Link from "next/link";
import { useAppMessages } from "@/components/useAppMessages";

// v3 마일스톤 3 — 저널 큐레이션 진입점.
// FEATURE_JOURNAL=1 일 때만 헤더에 노출. v2.0.4 라이브 사용자가 새 진입점을 보지 않도록
// 점진 롤아웃. 단계 검증이 끝나면 default 노출 + flag 제거.
const FEATURE_JOURNAL = process.env.NEXT_PUBLIC_FEATURE_JOURNAL === "1";

export default function JournalEntryLink({ className }: { className?: string }) {
  const m = useAppMessages();
  if (!FEATURE_JOURNAL) return null;
  return (
    <Link
      href="/journal"
      aria-label={m.journal.entryLink}
      title={m.journal.entryLink}
      className={
        className ??
        "inline-flex items-center justify-center rounded-lg p-1.5 text-lg text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
      }
    >
      🩺
    </Link>
  );
}
