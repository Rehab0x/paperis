// /api/journal/trend — 저널의 한 시기(year + quarter) abstract corpus를 themes 단위로
// 심층 분석. v2 — docs/TREND_IMPROVEMENT.md 기준.
//
// 변경:
//   - rolling N개월 → 고정 year/quarter (Q1~Q4 또는 all)
//   - 캐시 키: trend:{issn}:{year}:{quarter}:{language}
//   - isComplete(기간 종료됨)면 ∞ TTL, 진행 중이면 24h TTL
//   - JournalTrend 타입 v2 (themes 등)

import { getEffectiveAiProvider } from "@/lib/ai/registry";
import { friendlyErrorMessage } from "@/lib/gemini";
import { TTL_24H, getCached, setCached } from "@/lib/journal-cache";
import { enrichPapers } from "@/lib/openalex";
import { searchPubMed } from "@/lib/pubmed";
import { generateJournalTrend, type JournalTrend } from "@/lib/trend";
import {
  checkAndIncrement,
  getIdentityKey,
  getPlan,
  limitExceededMessage,
} from "@/lib/usage";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { ApiError, Paper } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export type TrendQuarter = "all" | "Q1" | "Q2" | "Q3" | "Q4";

interface TrendResponse {
  query: string;
  papers: Paper[];
  total: number;
  trend: JournalTrend;
  issn: string;
  year: number;
  quarter: TrendQuarter;
  periodLabel: string;
  /** 기간이 이미 끝났으면 true (캐시 ∞ TTL). 진행 중이면 false (24h TTL) */
  isComplete: boolean;
}

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const ISSN_RE = /^\d{4}-\d{3}[\dXx]$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function lastDayOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

interface PeriodInfo {
  fromYear: number;
  fromMonth: number;
  fromDay: number;
  toYear: number;
  toMonth: number;
  toDay: number;
  label: string;
  isComplete: boolean;
}

function parseQuarter(raw: string): TrendQuarter {
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "q1") return "Q1";
  if (v === "2" || v === "q2") return "Q2";
  if (v === "3" || v === "q3") return "Q3";
  if (v === "4" || v === "q4") return "Q4";
  return "all";
}

function buildPeriod(year: number, quarter: TrendQuarter): PeriodInfo {
  let fromMonth = 1;
  let toMonth = 12;
  let label = `${year}년 연간`;
  switch (quarter) {
    case "Q1":
      fromMonth = 1;
      toMonth = 3;
      label = `${year}년 Q1 (1–3월)`;
      break;
    case "Q2":
      fromMonth = 4;
      toMonth = 6;
      label = `${year}년 Q2 (4–6월)`;
      break;
    case "Q3":
      fromMonth = 7;
      toMonth = 9;
      label = `${year}년 Q3 (7–9월)`;
      break;
    case "Q4":
      fromMonth = 10;
      toMonth = 12;
      label = `${year}년 Q4 (10–12월)`;
      break;
    case "all":
      // 위 default
      break;
  }
  const toDay = lastDayOf(year, toMonth);

  // 기간 완료 여부 — 끝 날짜 + 7일(인덱싱 지연 안전마진)이 지났으면 완료로 간주
  const endMs = new Date(year, toMonth, toDay + 1).getTime() - 1; // 그 달 마지막 날 23:59
  const safeEndMs = endMs + 7 * 24 * 60 * 60 * 1000;
  const isComplete = Date.now() > safeEndMs;

  return {
    fromYear: year,
    fromMonth,
    fromDay: 1,
    toYear: year,
    toMonth,
    toDay,
    label,
    isComplete,
  };
}

function buildTrendTerm(issn: string, p: PeriodInfo): string {
  return `${issn}[ISSN] AND ("${p.fromYear}/${pad2(p.fromMonth)}/${pad2(p.fromDay)}"[PDAT] : "${p.toYear}/${pad2(p.toMonth)}/${pad2(p.toDay)}"[PDAT])`;
}

const MIN_PAPERS_FOR_TREND = 10;

export async function GET(req: Request) {
  await applyUserKeysToEnv(req);

  const { searchParams } = new URL(req.url);
  const issn = (searchParams.get("issn") ?? "").trim();
  const journalName = (searchParams.get("journalName") ?? "").trim();
  const language = searchParams.get("language") === "en" ? "en" : "ko";
  const yearRaw = Number(searchParams.get("year"));
  const quarter = parseQuarter(searchParams.get("quarter") ?? "all");

  if (!ISSN_RE.test(issn)) {
    return jsonError("issn 형식이 올바르지 않습니다 (예: 0028-3878).");
  }
  if (!Number.isInteger(yearRaw) || yearRaw < 2000 || yearRaw > 2100) {
    return jsonError("year는 2000~2100 사이 정수여야 합니다.");
  }
  const year = yearRaw;

  const period = buildPeriod(year, quarter);
  const term = buildTrendTerm(issn, period);

  // 캐시 hit이면 PubMed/OpenAlex/Gemini 호출 모두 스킵
  const cacheKey = `trend:${issn}:${year}:${quarter}:${language}`;
  const cached = await getCached<TrendResponse>(cacheKey);
  if (cached) {
    return new Response(JSON.stringify(cached), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-cache": "hit",
        "cache-control": "public, max-age=0, s-maxage=3600",
      },
    });
  }

  // Free 한도 — 트렌드는 큐레이션 카테고리 (호/주제와 동일)
  const identityKey = await getIdentityKey(req);
  const plan = await getPlan(req);
  const usage = await checkAndIncrement(identityKey, "curation", plan);
  if (!usage.allowed) {
    return jsonError(
      limitExceededMessage(
        "curation",
        usage,
        identityKey?.startsWith("anon:") === false
      ),
      429
    );
  }

  // 1) PubMed로 해당 기간 abstract 모음. recency 정렬, retmax 80.
  let papers: Paper[];
  let total: number;
  try {
    const result = await searchPubMed(term, "recency", 80, 0);
    papers = result.papers;
    total = result.total;
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "PubMed 트렌드 검색 실패",
      502
    );
  }

  // 논문이 너무 적으면 트렌드 분석 무의미 — 안내만 반환
  if (papers.length < MIN_PAPERS_FOR_TREND) {
    const body: TrendResponse = {
      query: term,
      papers,
      total,
      trend: {
        headline: "",
        themes: [],
        methodologyShift: "",
        clinicalImplication: "",
        narrationScript: "",
      },
      issn,
      year,
      quarter,
      periodLabel: period.label,
      isComplete: period.isComplete,
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-cache": "miss",
        "x-trend-skipped": `papers<${MIN_PAPERS_FOR_TREND}`,
        "cache-control": "public, max-age=0, s-maxage=3600",
      },
    });
  }

  // 2) enrichment (인용수). soft-fail.
  if (papers.length > 0) {
    try {
      const enrichments = await enrichPapers(papers);
      for (const paper of papers) {
        const e = enrichments.get(paper.pmid);
        if (e) {
          paper.citedByCount = e.citedByCount;
          paper.journalCitedness = e.journalCitedness;
        }
      }
    } catch {
      // ignore
    }
  }

  // 3) Gemini 트렌드 분석.
  let trend: JournalTrend = {
    headline: "",
    themes: [],
    methodologyShift: "",
    clinicalImplication: "",
    narrationScript: "",
  };
  try {
    const aiProvider = await getEffectiveAiProvider(req);
    trend = await generateJournalTrend(
      papers,
      journalName || "이 저널",
      period.label,
      language,
      aiProvider
    );
  } catch (err) {
    return jsonError(friendlyErrorMessage(err, language), 502);
  }

  const body: TrendResponse = {
    query: term,
    papers,
    total,
    trend,
    issn,
    year,
    quarter,
    periodLabel: period.label,
    isComplete: period.isComplete,
  };

  // 의미 있는 결과만 캐시 — 빈 trend는 다음 호출에서 재시도 기회
  if (trend.themes.length > 0) {
    // 완료된 기간은 ∞ TTL (결과 불변), 진행 중이면 24h
    const ttl = period.isComplete ? undefined : TTL_24H;
    await setCached(cacheKey, body, { ttlSeconds: ttl });
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-cache": "miss",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
