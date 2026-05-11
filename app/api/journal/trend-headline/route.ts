// /api/journal/trend-headline — 홈 피처드 카드용 라이트 트렌드 헤드라인 전용.
//
// 전체 트렌드(/api/journal/trend)는 themes/methodologyShift/clinicalImplication/
// narrationScript까지 30~90초 걸려 첫 화면 UX에 부적합. 이 라우트는:
//   - PubMed 20편만 (전체는 80편) → 토큰/시간 절약
//   - OpenAlex enrichment 스킵 (인용수 필요 없음)
//   - Flash Lite + 짧은 시스템 프롬프트 → 한 문장만
//   - 별도 Redis 캐시 키 (trend-headline:{issn}:{year}:{quarter}:{language})
//
// 예상 응답 시간: 캐시 hit ~100ms / miss ~5–10s.

import { getEffectiveAiProvider } from "@/lib/ai/registry";
import { friendlyErrorMessage } from "@/lib/gemini";
import { TTL_24H, getCached, setCached } from "@/lib/journal-cache";
import { searchPubMed } from "@/lib/pubmed";
import { generateTrendHeadline } from "@/lib/trend";
import {
  checkAndIncrement,
  getIdentityKey,
  getPlan,
  limitExceededMessage,
} from "@/lib/usage";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { ApiError, Paper } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Quarter = "all" | "Q1" | "Q2" | "Q3" | "Q4";

interface HeadlineResponse {
  headline: string;
  issn: string;
  journalName: string;
  year: number;
  quarter: Quarter;
  periodLabel: string;
  isComplete: boolean;
  paperCount: number;
}

const ISSN_RE = /^\d{4}-\d{3}[\dXx]$/;
const MIN_PAPERS_FOR_HEADLINE = 5;

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function lastDayOf(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function parseQuarter(raw: string): Quarter {
  const v = raw.trim().toLowerCase();
  if (v === "1" || v === "q1") return "Q1";
  if (v === "2" || v === "q2") return "Q2";
  if (v === "3" || v === "q3") return "Q3";
  if (v === "4" || v === "q4") return "Q4";
  return "all";
}

function buildPeriod(year: number, quarter: Quarter) {
  let fromMonth = 1;
  let toMonth = 12;
  let label = `${year}년 연간`;
  switch (quarter) {
    case "Q1":
      fromMonth = 1;
      toMonth = 3;
      label = `${year}년 Q1`;
      break;
    case "Q2":
      fromMonth = 4;
      toMonth = 6;
      label = `${year}년 Q2`;
      break;
    case "Q3":
      fromMonth = 7;
      toMonth = 9;
      label = `${year}년 Q3`;
      break;
    case "Q4":
      fromMonth = 10;
      toMonth = 12;
      label = `${year}년 Q4`;
      break;
    case "all":
      break;
  }
  const toDay = lastDayOf(year, toMonth);
  const endMs = new Date(year, toMonth, toDay + 1).getTime() - 1;
  const safeEndMs = endMs + 7 * 24 * 60 * 60 * 1000;
  const isComplete = Date.now() > safeEndMs;
  return { fromMonth, toMonth, toDay, label, isComplete };
}

export async function GET(req: Request) {
  await applyUserKeysToEnv(req);

  const { searchParams } = new URL(req.url);
  const issn = (searchParams.get("issn") ?? "").trim();
  const journalName = (searchParams.get("journalName") ?? "").trim();
  const language = searchParams.get("language") === "en" ? "en" : "ko";
  const yearRaw = Number(searchParams.get("year"));
  const quarter = parseQuarter(searchParams.get("quarter") ?? "all");

  if (!ISSN_RE.test(issn)) {
    return jsonError("issn 형식이 올바르지 않습니다.");
  }
  if (!Number.isInteger(yearRaw) || yearRaw < 2000 || yearRaw > 2100) {
    return jsonError("year는 2000~2100 사이 정수여야 합니다.");
  }
  const year = yearRaw;
  const period = buildPeriod(year, quarter);

  // Redis 캐시 hit이면 즉시 반환 — 별도 키로 풀 trend와 분리
  const cacheKey = `trend-headline:${issn}:${year}:${quarter}:${language}`;
  const cached = await getCached<HeadlineResponse>(cacheKey);
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

  // Free 한도 — 라이트지만 Gemini 호출이라 curation 카테고리로 카운트
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

  // 1) PubMed 검색 — recency 정렬, retmax 20
  const term = `${issn}[ISSN] AND ("${year}/${pad2(period.fromMonth)}/01"[PDAT] : "${year}/${pad2(period.toMonth)}/${pad2(period.toDay)}"[PDAT])`;
  let papers: Paper[];
  try {
    const result = await searchPubMed(term, "recency", 20, 0);
    papers = result.papers;
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "PubMed 트렌드 검색 실패",
      502
    );
  }

  if (papers.length < MIN_PAPERS_FOR_HEADLINE) {
    // 조용히 빈 응답 (홈 카드가 자체 숨김 처리)
    const empty: HeadlineResponse = {
      headline: "",
      issn,
      journalName,
      year,
      quarter,
      periodLabel: period.label,
      isComplete: period.isComplete,
      paperCount: papers.length,
    };
    return new Response(JSON.stringify(empty), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-cache": "miss",
        "x-headline-skipped": `papers<${MIN_PAPERS_FOR_HEADLINE}`,
        "cache-control": "public, max-age=0, s-maxage=3600",
      },
    });
  }

  // 2) AI provider로 한 문장만 추출 (fast tier)
  let headline: string;
  try {
    const aiProvider = await getEffectiveAiProvider(req);
    headline = await generateTrendHeadline(
      papers,
      journalName || "이 저널",
      period.label,
      language,
      aiProvider
    );
  } catch (err) {
    return jsonError(friendlyErrorMessage(err, language), 502);
  }

  const body: HeadlineResponse = {
    headline,
    issn,
    journalName,
    year,
    quarter,
    periodLabel: period.label,
    isComplete: period.isComplete,
    paperCount: papers.length,
  };

  // 의미 있는 결과만 캐시
  if (headline) {
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
