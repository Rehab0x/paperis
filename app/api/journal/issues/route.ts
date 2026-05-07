// /api/journal/issues — 저널의 특정 호(year+month)에 출판된 논문 목록.
// PubMed [ISSN] AND [PDAT] 쿼리 → efetch 파싱 → OpenAlex enrichment.
//
// 마일스톤 5에서 Upstash Redis 캐시(키: issue:{issn}:{yyyy-mm})로 확장 예정.
// 마일스톤 3 이 단계에서는 PubMed/OpenAlex만으로 동작.

import { enrichPapers } from "@/lib/openalex";
import { searchPubMed } from "@/lib/pubmed";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { ApiError, Paper } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface IssuesResponse {
  query: string;
  papers: Paper[];
  total: number;
  year: number;
  month: number;
}

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
  // month는 1-base. Date(year, month, 0) → 그 달 마지막 날 (month는 0-base 다음 달 0일).
  return new Date(year, month, 0).getDate();
}

function buildIssueTerm(issn: string, year: number, month: number): string {
  const lastDay = lastDayOf(year, month);
  // ISSN은 따옴표 없이 [ISSN] 태그를 붙여야 PubMed가 정확한 Journal 매핑으로 변환한다.
  // 따옴표로 감싸면 [All Fields]로 fallback되어 우연히 일치하는 노이즈가 섞일 수 있음.
  // PDAT는 표준대로 따옴표 + [PDAT] : [PDAT] range.
  return `${issn}[ISSN] AND ("${year}/${pad2(month)}/01"[PDAT] : "${year}/${pad2(month)}/${pad2(lastDay)}"[PDAT])`;
}

const ISSN_RE = /^\d{4}-\d{3}[\dXx]$/;

export async function GET(req: Request) {
  applyUserKeysToEnv(req);

  const { searchParams } = new URL(req.url);
  const issn = (searchParams.get("issn") ?? "").trim();
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));
  const retmaxRaw = Number(searchParams.get("retmax") ?? "50");

  if (!ISSN_RE.test(issn)) {
    return jsonError("issn 형식이 올바르지 않습니다 (예: 0028-3878).");
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2100) {
    return jsonError("year는 1900~2100 사이 정수여야 합니다.");
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return jsonError("month는 1~12 정수여야 합니다.");
  }
  const retmax = Number.isFinite(retmaxRaw)
    ? Math.min(Math.max(Math.floor(retmaxRaw), 1), 200)
    : 50;

  const term = buildIssueTerm(issn, year, month);

  let papers: Paper[];
  let total: number;
  try {
    const result = await searchPubMed(term, "recency", retmax, 0);
    papers = result.papers;
    total = result.total;
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "PubMed 호 검색 실패",
      502
    );
  }

  // OpenAlex enrichment — 인용수/저널 영향력. 실패해도 카드에 표시는 정상 (soft-fail).
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
      // ignore — enrichment는 부가 정보
    }
  }

  const body: IssuesResponse = { query: term, papers, total, year, month };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 호 자체는 자주 안 바뀜. 클라가 직접 반복 호출해도 부담 적도록.
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
