// /api/journal/trend — 저널 최근 N개월(default 6)의 abstract 모음 → Gemini가
// "요즘 핫한 주제" headline + 5-7 bullet 분석. 같이 분석된 논문 목록도 반환해
// 사용자가 트렌드 항목 → 실제 논문으로 즉시 점프할 수 있다.
//
// M5: Redis 캐시. 키 `trend:{issn}:{months}m:{yyyy-mm}:{language}` — 매달 자연 갱신.
// Gemini 호출이 가장 비싸므로 캐시 hit 시 절감 효과가 크다. TTL 24h.

import { friendlyErrorMessage } from "@/lib/gemini";
import { TTL_24H, getCached, setCached, trendKey } from "@/lib/journal-cache";
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
export const maxDuration = 120; // Gemini analyze + PubMed/enrich 모두 합쳐 안전 마진

interface TrendResponse {
  query: string;
  papers: Paper[];
  total: number;
  trend: JournalTrend;
  issn: string;
  months: number;
  periodLabel: string;
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

/**
 * 끝 날짜를 기준으로 N개월 전까지의 PDAT range를 만든다.
 * 끝 날짜는 "지난 달 마지막 날"로 잡아 PubMed 인덱싱 지연 회피.
 */
function buildPeriod(months: number): {
  fromYear: number;
  fromMonth: number;
  toYear: number;
  toMonth: number;
  toDay: number;
  label: string;
} {
  const now = new Date();
  // 지난 달 마지막 날
  const toMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const toYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const toDay = lastDayOf(toYear, toMonth);

  // months-1만큼 더 빼면 from = (지난 달) - (months-1)
  let fromMonth = toMonth - (months - 1);
  let fromYear = toYear;
  while (fromMonth <= 0) {
    fromMonth += 12;
    fromYear -= 1;
  }
  const label = `${fromYear}-${pad2(fromMonth)} ~ ${toYear}-${pad2(toMonth)}`;
  return { fromYear, fromMonth, toYear, toMonth, toDay, label };
}

function buildTrendTerm(
  issn: string,
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
  toDay: number
): string {
  return `${issn}[ISSN] AND ("${fromYear}/${pad2(fromMonth)}/01"[PDAT] : "${toYear}/${pad2(toMonth)}/${pad2(toDay)}"[PDAT])`;
}

export async function GET(req: Request) {
  applyUserKeysToEnv(req);

  const { searchParams } = new URL(req.url);
  const issn = (searchParams.get("issn") ?? "").trim();
  const journalName = (searchParams.get("journalName") ?? "").trim();
  const language = searchParams.get("language") === "en" ? "en" : "ko";
  const monthsRaw = Number(searchParams.get("months") ?? "6");

  if (!ISSN_RE.test(issn)) {
    return jsonError("issn 형식이 올바르지 않습니다 (예: 0028-3878).");
  }
  const months = Number.isFinite(monthsRaw)
    ? Math.min(Math.max(Math.floor(monthsRaw), 1), 12)
    : 6;

  const period = buildPeriod(months);
  const term = buildTrendTerm(
    issn,
    period.fromYear,
    period.fromMonth,
    period.toYear,
    period.toMonth,
    period.toDay
  );

  // 캐시 hit이면 PubMed/OpenAlex/Gemini 호출 모두 스킵 — usage 카운트도 안 함
  const cacheKey = `${trendKey(issn, months)}:${language}`;
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

  // 캐시 miss → Free 한도 체크 (curation 카테고리)
  const identityKey = await getIdentityKey(req);
  const plan = await getPlan(req);
  const usage = await checkAndIncrement(identityKey, "curation", plan);
  if (!usage.allowed) {
    return jsonError(
      limitExceededMessage("curation", usage, identityKey?.startsWith("anon:") === false),
      429
    );
  }

  // 1) PubMed로 최근 호 abstract 모음. recency 정렬, retmax 80으로 분석 입력 절제.
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

  // 3) Gemini 트렌드 분석. abstract 모음을 요약.
  let trend: JournalTrend = { headline: "", bullets: [] };
  if (papers.length > 0) {
    try {
      trend = await generateJournalTrend(
        papers,
        journalName || "이 저널",
        period.label,
        language
      );
    } catch (err) {
      return jsonError(friendlyErrorMessage(err, language), 502);
    }
  }

  const body: TrendResponse = {
    query: term,
    papers,
    total,
    trend,
    issn,
    months,
    periodLabel: period.label,
  };

  // 트렌드 결과 비어있으면(papers 0건 or trend.bullets 비어있음) 캐시하지 않음 —
  // 다음 호출에서 다시 시도할 기회를 줌.
  // await으로 set 보장 — Vercel serverless가 응답 후 종료해 fire-and-forget이
  // 미완료되는 문제 방지.
  if (papers.length > 0 && trend.bullets.length > 0) {
    await setCached(cacheKey, body, { ttlSeconds: TTL_24H });
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
