// /api/journal/topic — 저널 안에서 특정 주제 논문 모아보기.
// 입력: ?issn=...&topic=spasticity (또는 phrase). PubMed의 자동 변환에 의존 —
// 단어가 MeSH에 매칭되면 [MeSH Terms]로, 아니면 [tw](text word)로 fallback.
//
// 마일스톤 5에서 Redis 캐시(키: topic:{issn}:{topic}) 추가 예정.

import { enrichPapers } from "@/lib/openalex";
import { searchPubMed } from "@/lib/pubmed";
import {
  checkAndIncrement,
  getIdentityKey,
  getPlan,
  limitExceededMessage,
} from "@/lib/usage";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type { ApiError, Paper, SortMode } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface TopicResponse {
  query: string;
  papers: Paper[];
  total: number;
  topic: string;
  issn: string;
}

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

const ISSN_RE = /^\d{4}-\d{3}[\dXx]$/;

/**
 * topic을 PubMed 절로 변환.
 * 공백이 있는 phrase는 큰따옴표로 감싸 phrase 매칭으로 처리한다.
 * 단일 토큰은 PubMed가 알아서 MeSH/All Fields로 매핑.
 */
function buildTopicClause(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // 사용자 입력에 따옴표가 이미 있다면 그대로 두고, 공백 있으면 phrase로
  if (/^".*"$/.test(trimmed)) return trimmed;
  if (/\s/.test(trimmed)) return `"${trimmed.replace(/"/g, "")}"`;
  return trimmed;
}

function buildTopicTerm(issn: string, topic: string): string {
  // ISSN은 따옴표 없이 [ISSN] 태그 (M3 PR2에서 발견한 quirk).
  // topic은 buildTopicClause가 phrase 처리 — PubMed가 MeSH/All Fields 자동 매핑.
  return `${issn}[ISSN] AND (${buildTopicClause(topic)})`;
}

export async function GET(req: Request) {
  await applyUserKeysToEnv(req);

  const { searchParams } = new URL(req.url);
  const issn = (searchParams.get("issn") ?? "").trim();
  const topic = (searchParams.get("topic") ?? "").trim();
  const sortRaw = (searchParams.get("sort") ?? "relevance").trim();
  const retmaxRaw = Number(searchParams.get("retmax") ?? "20");
  const retstartRaw = Number(searchParams.get("retstart") ?? "0");

  if (!ISSN_RE.test(issn)) {
    return jsonError("issn 형식이 올바르지 않습니다 (예: 0028-3878).");
  }
  if (!topic) {
    return jsonError("topic이 비어 있습니다.");
  }
  if (topic.length > 200) {
    return jsonError("topic이 너무 깁니다 (최대 200자).");
  }
  const sort: SortMode =
    sortRaw === "recency" || sortRaw === "citations" ? sortRaw : "relevance";
  // 주제 검색 결과 전체를 한 번에 받아 client에서 정렬 + 페이지네이션. PubMed
  // 매칭이 많을 수 있어 cap 200까지 허용 (default 100 — Gemini 미니요약 batch
  // 부담 절제).
  const retmax = Number.isFinite(retmaxRaw)
    ? Math.min(Math.max(Math.floor(retmaxRaw), 1), 200)
    : 100;
  const retstart = Number.isFinite(retstartRaw)
    ? Math.max(Math.floor(retstartRaw), 0)
    : 0;

  const term = buildTopicTerm(issn, topic);

  // Free 한도 체크 (curation 카테고리)
  const identityKey = await getIdentityKey(req);
  const plan = await getPlan(req);
  const usage = await checkAndIncrement(identityKey, "curation", plan);
  if (!usage.allowed) {
    return jsonError(
      limitExceededMessage("curation", usage, identityKey?.startsWith("anon:") === false),
      429
    );
  }

  let papers: Paper[];
  let total: number;
  try {
    const result = await searchPubMed(term, sort, retmax, retstart);
    papers = result.papers;
    total = result.total;
  } catch (err) {
    return jsonError(
      err instanceof Error ? err.message : "PubMed 주제 검색 실패",
      502
    );
  }

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
      // sort=citations일 때만 페이지 내 인용수 desc 후정렬 (v2 search route 패턴 동일)
      if (sort === "citations") {
        papers.sort(
          (a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0)
        );
      }
    } catch {
      // soft-fail
    }
  }

  const body: TopicResponse = { query: term, papers, total, topic, issn };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600",
    },
  });
}
