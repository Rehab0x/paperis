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
import { useAppMessages } from "@/components/useAppMessages";
import { useLocale } from "@/components/useLocale";
import { fmt } from "@/lib/i18n";

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

/**
 * KST 기준 "epoch day" — 1970-01-01부터 며칠 지났는지.
 * 매일 다른 저널을 보여줄 때 안정적인 인덱스로 사용.
 * 같은 날 안에서는 항상 같은 값 → 캐시 친화적 (같은 저널/날짜는 캐시 hit).
 */
function kstEpochDay(): number {
  const now = Date.now();
  const kstMs = now + 9 * 60 * 60 * 1000;
  return Math.floor(kstMs / (24 * 60 * 60 * 1000));
}

export default function TrendFeaturedCard() {
  const m = useAppMessages();
  const locale = useLocale();
  // 첫 렌더는 useLocale이 SSR-safe "ko" 반환. cookie 읽고 swap된 후에만 fetch
  // 해야 KO/EN 사이 잘못된 cache 키 사용 방지.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const [meta, setMeta] = useState<JournalSummary | null>(null);
  const [brief, setBrief] = useState<TrendBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // 1) favorites 중 하나를 선택. 여러 개면 매일 다른 저널로 로테이션.
  //    epoch day % length 인덱스 → 같은 날 안에선 안정적(캐시 hit) + 매일 다음 저널.
  //    dedupe by openAlexId. 메타 캐시 hit인 것만 후보 (사용자가 한 번이라도 본 저널).
  useEffect(() => {
    function pick() {
      const favsBySpecialty = getAllJournalFavorites();
      const seen = new Set<string>();
      const favIds: string[] = [];
      for (const ids of Object.values(favsBySpecialty)) {
        for (const id of ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          favIds.push(id);
        }
      }
      if (favIds.length === 0) {
        setMeta(null);
        setLoading(false);
        return;
      }
      const metas = getJournalMetas(favIds);
      if (metas.length === 0) {
        setMeta(null);
        setLoading(false);
        return;
      }
      // 안정적 정렬 (openAlexId) — favorites 객체 키 순서가 환경마다 다를 수 있어
      // 결정성 보장. 그 다음 epoch day로 인덱스 계산.
      const sorted = [...metas].sort((a, b) =>
        a.openAlexId.localeCompare(b.openAlexId)
      );
      const idx = kstEpochDay() % sorted.length;
      setMeta(sorted[idx]);
    }
    pick();
    return subscribeJournalFavorites(pick);
  }, []);

  // 2) 라이트 헤드라인 fetch (Flash Lite 기반 ~5–10s, Redis 캐시 활용)
  //    locale 변화 시 refetch. URL에 language 명시해 서버 cookie 의존 X —
  //    KO 캐시와 EN 캐시가 항상 정확히 분리되도록 보장.
  useEffect(() => {
    if (!hydrated || !meta) return;
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
      language: locale,
    });
    fetch(`/api/journal/trend-headline?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled) return;
        if (
          !j ||
          typeof j !== "object" ||
          typeof j.headline !== "string" ||
          j.headline.length === 0
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
          headline: j.headline,
          hasNarration: false, // 라이트 모드는 narration 없음 — 전체 페이지에서 별도 제공
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
  }, [hydrated, locale, meta]);

  if (!meta) return null;
  if (error) return null;

  // 로딩: 빈 박스 대신 "분석 중" 안내. Flash Lite + 캐시로 보통 5–10초, 캐시 hit 시 즉시.
  if (loading) {
    const { year, quarter } = currentYearQuarter();
    return (
      <section className="mb-6">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-paperis-text-2">
            {m.home.trend.title}
          </h2>
        </div>
        <div className="rounded-2xl border border-paperis-border bg-paperis-surface p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-paperis-text-3">
            {fmt(m.home.trend.metaKo, { name: meta.name, year, quarter })}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-paperis-border border-t-paperis-accent"
            />
            <p className="text-sm text-paperis-text-2">{m.home.trend.loading}</p>
          </div>
          <div className="mt-3 space-y-2">
            <div className="h-3 w-4/5 animate-pulse rounded bg-paperis-surface-2" />
            <div className="h-3 w-3/5 animate-pulse rounded bg-paperis-surface-2" />
          </div>
          <p className="mt-4 text-[11px] text-paperis-text-3">
            {m.home.trend.loadingHint}
          </p>
        </div>
      </section>
    );
  }
  if (!brief) return null;

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-paperis-text-2">
          {m.home.trend.title}
        </h2>
        <Link
          href="/journal"
          className="text-xs text-paperis-text-3 transition hover:text-paperis-text"
        >
          {m.home.trend.anotherJournal}
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
            →
          </span>
          <span>{m.home.trend.seeAll}</span>
        </div>
      </Link>
    </section>
  );
}
