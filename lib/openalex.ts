// OpenAlex API: PMID → 인용수 + 저널 영향력 지표 일괄 조회
// 무료, 키 불필요. Polite Pool을 위해 mailto 파라미터를 붙인다.

import type { EnrichmentData, Paper } from "@/types";

const OPENALEX_BASE = "https://api.openalex.org";
const POLITE_MAILTO = "paperis@example.com";
const SELECT_FIELDS = "id,doi,publication_year,cited_by_count,primary_location,ids";

interface OpenAlexSource {
  display_name?: string;
  "2yr_mean_citedness"?: number;
}

interface OpenAlexLocation {
  source?: OpenAlexSource | null;
}

interface OpenAlexIds {
  pmid?: string;
}

interface OpenAlexWork {
  id?: string;
  doi?: string | null;
  publication_year?: number | null;
  cited_by_count?: number;
  primary_location?: OpenAlexLocation | null;
  ids?: OpenAlexIds;
}

interface OpenAlexWorksResponse {
  results?: OpenAlexWork[];
}

function pmidFromIdsUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = /(\d+)\s*$/.exec(url);
  return m ? m[1] : null;
}

// PMID 배열을 받아 OpenAlex 일괄 조회 → pmid 키 Map
export async function enrichPapers(
  papers: Paper[]
): Promise<Map<string, EnrichmentData>> {
  const result = new Map<string, EnrichmentData>();
  const pmids = papers.map((p) => p.pmid).filter(Boolean);
  if (pmids.length === 0) return result;

  // OpenAlex bulk filter: ids.pmid:1|2|3
  const params = new URLSearchParams({
    filter: `ids.pmid:${pmids.join("|")}`,
    "per-page": String(Math.min(pmids.length, 200)),
    select: SELECT_FIELDS,
    mailto: POLITE_MAILTO,
  });

  let res: Response;
  try {
    res = await fetch(`${OPENALEX_BASE}/works?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    console.warn("[openalex] network error, returning empty enrichment", err);
    return result;
  }
  if (!res.ok) {
    console.warn(`[openalex] non-ok ${res.status}, returning empty enrichment`);
    return result;
  }

  const data = (await res.json()) as OpenAlexWorksResponse;
  for (const work of data.results ?? []) {
    const pmid = pmidFromIdsUrl(work.ids?.pmid);
    if (!pmid) continue;
    const source = work.primary_location?.source ?? null;
    const journalCitedness = source?.["2yr_mean_citedness"];
    result.set(pmid, {
      pmid,
      citedByCount:
        typeof work.cited_by_count === "number" ? work.cited_by_count : 0,
      publicationYear:
        typeof work.publication_year === "number" ? work.publication_year : null,
      journalName: source?.display_name ?? null,
      journalCitedness:
        typeof journalCitedness === "number" ? journalCitedness : null,
    });
  }

  return result;
}
