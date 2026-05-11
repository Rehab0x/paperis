// /api/search — 자연어 → 검색식(캐시) → PubMed → OpenAlex enrichment → 정렬
// 응답: { query, note, papers, total, sort, cached }

import { NextResponse } from "next/server";
import { friendlyErrorMessage } from "@/lib/gemini";
import { enrichPapers } from "@/lib/openalex";
import { searchPubMed } from "@/lib/pubmed";
import { getCachedQuery, setCachedQuery } from "@/lib/query-cache";
import { translateNaturalLanguage } from "@/lib/query-translator";
import { applyUserKeysToEnv } from "@/lib/user-keys";
import type {
  ApiError,
  Paper,
  SearchRequest,
  SearchResponse,
  SortMode,
} from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const VALID_SORTS: SortMode[] = ["recency", "citations", "relevance"];

function parseSort(value: unknown): SortMode {
  if (typeof value !== "string") return "relevance";
  return (VALID_SORTS as string[]).includes(value)
    ? (value as SortMode)
    : "relevance";
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

export async function POST(req: Request) {
  await applyUserKeysToEnv(req);
  let body: Partial<SearchRequest>;
  try {
    body = (await req.json()) as Partial<SearchRequest>;
  } catch {
    return NextResponse.json<ApiError>(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const q = typeof body.q === "string" ? body.q.trim() : "";
  if (!q) {
    return NextResponse.json<ApiError>(
      { error: "검색어가 비어 있습니다." },
      { status: 400 }
    );
  }
  const sort = parseSort(body.sort);
  const retmax = clampInt(body.retmax, 1, 50, 20);
  const retstart = clampInt(body.retstart, 0, 9999, 0);

  // 1) 자연어 → 검색식 (서버 캐시 hit 시 Gemini 호출 생략)
  let translated = getCachedQuery(q);
  const cached = translated !== null;
  if (!translated) {
    try {
      translated = await translateNaturalLanguage(q);
      setCachedQuery(q, translated.query, translated.note);
    } catch (err) {
      return NextResponse.json<ApiError>(
        { error: friendlyErrorMessage(err, "ko") },
        { status: 502 }
      );
    }
  }

  // 2) PubMed esearch + efetch
  let papers: Paper[] = [];
  let total = 0;
  try {
    const result = await searchPubMed(translated.query, sort, retmax, retstart);
    papers = result.papers;
    total = result.total;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PubMed 검색 실패";
    return NextResponse.json<ApiError>({ error: msg }, { status: 502 }
    );
  }

  // 3) OpenAlex enrichment 일괄 (실패해도 빈 Map → 그대로 진행)
  if (papers.length > 0) {
    const enrichment = await enrichPapers(papers);
    papers = papers.map((p) => {
      const e = enrichment.get(p.pmid);
      if (!e) return p;
      return {
        ...p,
        citedByCount: e.citedByCount,
        journalCitedness: e.journalCitedness,
        // OpenAlex의 더 정확한 저널명/연도가 있으면 채워 넣기 (없으면 PubMed 값 유지)
        journal: e.journalName ?? p.journal,
        year: e.publicationYear != null ? String(e.publicationYear) : p.year,
      };
    });
  }

  // 4) 인용수순이면 페이지 안에서 후정렬 (PubMed esearch가 직접 인용수 정렬을 못함)
  if (sort === "citations") {
    papers.sort(
      (a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0)
    );
  }

  const payload: SearchResponse = {
    query: translated.query,
    note: translated.note,
    papers,
    total,
    sort,
    cached,
  };
  return NextResponse.json(payload);
}
