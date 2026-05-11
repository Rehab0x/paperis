"use client";

// 홈 첫 화면 — 사용자가 즐겨찾기한 저널 중 하나의 현재 분기 트렌드 헤드라인을
// 큰 피처드 카드로. 프로토타입의 핵심 "에디토리얼" 영역.
//
// 동작:
//   1. localStorage에서 favorites 읽기 (specialty 무관 union)
//   2. 메타 캐시로 ISSN/journalName 복원
//   3. 그 중 하나(랜덤이 아니라 첫 번째 — 사용자가 가장 우선시한 저널)
//   4. /api/journal/trend?issn=&year=&quarter= 호출 (Redis 캐시 hit 시 빠름)
//   5. headline 한 줄 + period + 청취 가능 여부 노출
//   6. 클릭 → /journal/{issn}?tab=trend (TrendDigest로 이동)
//
// 빈 상태(favorites 0 / fetch 실패): 카드 자체 숨김 (MyJournalsNewIssues가 따로 처리)

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getAllJournalFavorites,
  subscribeJournalFavorites,
} from "@/lib/journal-favorites";
import { getJournalMetas } from "@/lib/journal-meta-cache";
import type { JournalSummary } from "@/lib/openalex";

interface TrendBrief {
  issn: string;
  journalName: string;
  year: number;
  quarter: "all" | "Q1" | "Q2" | "Q3" | "Q4";
  periodLabel: string;
  headline: string;
  hasNarration: boolean;
}

/** 현재 분기 계산 — KST. Q1이 아직 진행 중인 1월 초엔 작년 Q4를 보여주는 게 자연스럽지만
 *  단순화를 위해 "현재 시점 기준 분기"로 통일. trend route가 미래 분기는 자동으로 빈 결과 반환. */
function currentYearQuarter(): { year: number; quarter: "Q1" | "Q2" | "Q3" | "Q4" } {
  const now = new Date();
  // UTC+9 = KST
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = kst.getUTCMonth() + 1; // 1-12
  const q: "Q1" | "Q2" | "Q3" | "Q4" =
    m <= 3 ? "Q1" : m <= 6 ? "Q2" : m <= 9 ? "Q3" : "Q4";
  return { year: y, quarter: q };
}

export default function TrendFeaturedCard() {
  const [meta, setMeta] = useState<JournalSummary | null>(null);
  const [brief, setBrief] = useState<TrendBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 1) favorites 중 첫 번째 저널 선택 (사용자 우선순위 반영)
  useEffect(() => {
    function pick() {
      const favsBySpecialty = getAllJournalFavorites();
      const favIds: string[] = [];
      for (const ids of Object.values(favsBySpecialty)) {
        for (const id of ids) favIds.push(id);
      }
      if (favIds.length === 0) {
        setMeta(null);
        setLoading(false);
        return;
      }
      // 메타 캐시 hit인 것만 사용 (없으면 fetch가 불가능 — 사용자가 /journal 한 번도 진입 안 한 경우)
      const metas = getJournalMetas(favIds);
      if (metas.length === 0) {
        setMeta(null);
        setLoading(false);
        return;
      }
      setMeta(metas[0]);
    }
    pick();
    return subscribeJournalFavorites(pick);
  }, []);

  // 2) 선택된 저널의 트렌드 fetch (Redis 캐시 활용)
  useEffect(() => {
    if (!meta) return;
    const issn = meta.issnL ?? meta.issns[0] ?? null;
    if (!issn) return;
    const { year, quarter } = currentYearQuarter();
    let cancelled = false;
    setLoading(true);
    setError(false);
    const params = new URLSearchParams({
      issn,
      journalName: meta.name,
      year: String(year),
      quarter,
    });
    fetch(`/api/journal/trend?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (
          !j ||
          typeof j !== "object" ||
          !j.trend ||
          typeof j.trend.headline !== "string" ||
          j.trend.headline.length === 0
        ) {
          setBrief(null);
          setError(true);
          return;
        }
        setBrief({
          issn,
          journalName: meta.name,
          year,
          quarter,
          periodLabel: j.periodLabel ?? `${year} ${quarter}`,
          headline: j.trend.headline,
          hasNarration: Boolean(j.trend.narrationScript),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  if (!meta) return null;
  if (error) return null;

  if (loading) {
    return (
      <section className="mb-6">
        <div className="h-40 animate-pulse rounded-2xl bg-paperis-surface-2" />
      </section>
    );
  }
  if (!brief) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-paperis-text-2">
          📈 이번 분기 트렌드
        </h2>
        <Link
          href="/journal"
          className="text-xs text-paperis-text-3 transition hover:text-paperis-text"
        >
          다른 저널 →
        </Link>
      </div>
      <Link
        href={`/journal/${encodeURIComponent(brief.issn)}?tab=trend&year=${brief.year}&quarter=${brief.quarter}`}
        className="block rounded-2xl border border-paperis-border bg-paperis-surface p-5 transition hover:-translate-y-0.5 hover:border-paperis-accent/60"
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-3">
          {brief.journalName} · {brief.periodLabel}
        </div>
        <p className="mt-3 font-serif text-lg font-medium leading-snug tracking-tight text-paperis-text">
          {brief.headline}
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-paperis-text-2">
          <span aria-hidden className="text-paperis-accent">
            ▶
          </span>
          <span>편집장 브리핑 · 분기 단위 트렌드 분석</span>
        </div>
      </Link>
    </section>
  );
}
