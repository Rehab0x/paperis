"use client";

// 저널 디테일 페이지 진입 시 lastVisitedAt 기록 — 홈 "내 저널" 카드의 ●
// (새 호 가능성) 인디케이터 갱신용.

import { useEffect } from "react";
import { markJournalVisited } from "@/lib/journal-visits";

export default function MarkJournalVisited({
  openAlexId,
}: {
  openAlexId: string;
}) {
  useEffect(() => {
    if (!openAlexId) return;
    markJournalVisited(openAlexId);
  }, [openAlexId]);
  return null;
}
