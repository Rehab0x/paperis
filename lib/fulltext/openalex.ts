// OpenAlex Works API의 open_access.oa_url로 풀텍스트 시도.
//
// OpenAlex는 이미 enrichPapers에서 사용 중인 무료 API. 여기선 단일 paper에 대해
// /works/{id} 또는 /works?filter=ids.pmid:{pmid} 호출로 open_access 정보 받음.
//
// FULLTEXT_CHAIN_IMPROVEMENT.md 1순위 — Unpaywall이 못 찾은 OA 본문도 OpenAlex가
// 다른 경로(기관 레포·preprint 서버 등)로 가지고 있는 경우가 잦다.

import { fetchAssetAsText } from "@/lib/fulltext/asset-fetcher";

const OPENALEX_BASE = "https://api.openalex.org";
const POLITE_MAILTO = "paperis@example.com";

interface OpenAlexOpenAccess {
  is_oa?: boolean;
  oa_url?: string | null;
  oa_status?: "gold" | "hybrid" | "bronze" | "green" | "closed" | null;
  any_repository_has_fulltext?: boolean;
}

interface OpenAlexWorkOA {
  id?: string;
  doi?: string | null;
  open_access?: OpenAlexOpenAccess | null;
}

interface OpenAlexWorksResponse {
  results?: OpenAlexWorkOA[];
}

const SELECT = "id,doi,open_access";

async function fetchWorkOA(input: {
  doi?: string | null;
  pmid?: string | null;
}): Promise<OpenAlexWorkOA | null> {
  // 우선 DOI로 직접 조회 (정확 매칭)
  if (input.doi) {
    const url = `${OPENALEX_BASE}/works/doi:${encodeURIComponent(input.doi)}?select=${SELECT}&mailto=${encodeURIComponent(POLITE_MAILTO)}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        return (await res.json()) as OpenAlexWorkOA;
      }
    } catch (err) {
      console.warn("[fulltext.openalex] doi lookup error", err);
    }
  }
  // PMID fallback (filter 사용)
  if (input.pmid) {
    const url = `${OPENALEX_BASE}/works?filter=ids.pmid:${input.pmid}&select=${SELECT}&per-page=1&mailto=${encodeURIComponent(POLITE_MAILTO)}`;
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = (await res.json()) as OpenAlexWorksResponse;
        return data.results?.[0] ?? null;
      }
    } catch (err) {
      console.warn("[fulltext.openalex] pmid lookup error", err);
    }
  }
  return null;
}

export async function fetchOpenAlexFullText(input: {
  doi?: string | null;
  pmid?: string | null;
}): Promise<{ text: string; sourceUrl: string } | null> {
  if (!input.doi && !input.pmid) return null;

  const work = await fetchWorkOA(input);
  const oaUrl = work?.open_access?.oa_url;
  if (!oaUrl) return null;

  const asset = await fetchAssetAsText(oaUrl);
  if (!asset) return null;
  return { text: asset.text, sourceUrl: oaUrl };
}
