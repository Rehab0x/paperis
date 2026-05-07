// OpenAlex API:
//   1. Works API — PMID → 인용수 + 저널 영향력 지표 일괄 조회 (enrichPapers)
//   2. Sources API — 임상과 field별 저널 자동 추천 + 저널명 자동완성 (v3 마일스톤 2)
// 무료, 키 불필요. Polite Pool을 위해 mailto 파라미터를 붙인다.
// 네트워크/HTTP 에러는 throw 대신 빈 결과 반환 — enrichment / 추천은 부가 정보.

import type { EnrichmentData, Paper } from "@/types";

const OPENALEX_BASE = "https://api.openalex.org";
const POLITE_MAILTO = "paperis@example.com";
const SELECT_FIELDS =
  "id,doi,publication_year,cited_by_count,primary_location,ids";
const SOURCES_SELECT =
  "id,display_name,host_organization_name,issn_l,issn,type,works_count,cited_by_count,summary_stats,homepage_url";

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

export async function enrichPapers(
  papers: Paper[]
): Promise<Map<string, EnrichmentData>> {
  const result = new Map<string, EnrichmentData>();
  const pmids = papers.map((p) => p.pmid).filter(Boolean);
  if (pmids.length === 0) return result;

  // OpenAlex bulk filter: ids.pmid:1|2|3, per-page 최대 200
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
    console.warn(
      `[openalex] non-ok ${res.status}, returning empty enrichment`
    );
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
        typeof work.publication_year === "number"
          ? work.publication_year
          : null,
      journalName: source?.display_name ?? null,
      journalCitedness:
        typeof journalCitedness === "number" ? journalCitedness : null,
    });
  }

  return result;
}

// =============================================================================
// Sources API (v3 마일스톤 2): 저널 자동 추천 / 자동완성
// =============================================================================

/**
 * UI에서 다루기 좋게 정규화한 저널 요약.
 * OpenAlex의 raw source 객체에서 v3 진입점에 필요한 것만 뽑아낸 형태.
 */
export interface JournalSummary {
  /** OpenAlex source URN (예: "https://openalex.org/S125754415") */
  openAlexId: string;
  /** 저널 표시명 */
  name: string;
  /** 출판사 (호스트 기관 이름) */
  publisher: string | null;
  /** linking ISSN — PubMed `[ISSN]` 쿼리에 그대로 사용 가능 */
  issnL: string | null;
  /** 모든 ISSN (print/electronic) */
  issns: string[];
  /** "journal" | "repository" | ... */
  type: string | null;
  worksCount: number;
  citedByCount: number;
  /** 2yr mean citedness — 영향력 점수(IF 유사) */
  twoYearMeanCitedness: number | null;
  homepageUrl: string | null;
}

interface OpenAlexSourceFull {
  id?: string;
  display_name?: string;
  host_organization_name?: string | null;
  issn_l?: string | null;
  issn?: string[] | null;
  type?: string | null;
  works_count?: number | null;
  cited_by_count?: number | null;
  summary_stats?: {
    "2yr_mean_citedness"?: number | null;
    h_index?: number | null;
  } | null;
  homepage_url?: string | null;
}

interface OpenAlexSourcesResponse {
  results?: OpenAlexSourceFull[];
}

function normalizeSource(raw: OpenAlexSourceFull): JournalSummary {
  return {
    openAlexId: raw.id ?? "",
    name: raw.display_name ?? "(이름 없음)",
    publisher: raw.host_organization_name ?? null,
    issnL: raw.issn_l ?? null,
    issns: Array.isArray(raw.issn) ? raw.issn : [],
    type: raw.type ?? null,
    worksCount: typeof raw.works_count === "number" ? raw.works_count : 0,
    citedByCount:
      typeof raw.cited_by_count === "number" ? raw.cited_by_count : 0,
    twoYearMeanCitedness:
      typeof raw.summary_stats?.["2yr_mean_citedness"] === "number"
        ? raw.summary_stats["2yr_mean_citedness"]
        : null,
    homepageUrl: raw.homepage_url ?? null,
  };
}

async function fetchSources(
  params: URLSearchParams
): Promise<JournalSummary[]> {
  params.set("select", SOURCES_SELECT);
  params.set("mailto", POLITE_MAILTO);

  let res: Response;
  try {
    res = await fetch(`${OPENALEX_BASE}/sources?${params.toString()}`, {
      headers: { Accept: "application/json" },
      // 추천/자동완성은 자주 바뀌지 않는다. ISR 비슷한 효과로 동일 응답 1시간 재사용.
      next: { revalidate: 3600 },
    });
  } catch (err) {
    console.warn("[openalex/sources] network error", err);
    return [];
  }
  if (!res.ok) {
    console.warn(`[openalex/sources] non-ok ${res.status}`);
    return [];
  }
  const data = (await res.json()) as OpenAlexSourcesResponse;
  return (data.results ?? [])
    .map(normalizeSource)
    .filter((j) => j.openAlexId && j.name);
}

/**
 * 임상과 field에 속한 저널 상위 perPage개를 인용수 desc로 가져온다.
 *
 * fieldUrn은 `data/journals.json`의 `openAlexFieldId` (예: "fields/2734").
 * filter 키는 OpenAlex Sources API의 `topics.field.id`. 시스템에 따라 결과 0건일 수
 * 있어 마일스톤 3에서 첫 호출 결과를 보고 보정 필요할 수 있음.
 *
 * journal type만으로 좁히고 (repository/conference 제외), 인용수 desc 정렬.
 */
export async function searchJournalsByField(
  fieldUrn: string,
  opts: { perPage?: number; page?: number } = {}
): Promise<JournalSummary[]> {
  const perPage = Math.min(Math.max(opts.perPage ?? 10, 1), 50);
  const page = Math.max(opts.page ?? 1, 1);
  const params = new URLSearchParams({
    filter: `topics.field.id:${fieldUrn},type:journal`,
    sort: "cited_by_count:desc",
    "per-page": String(perPage),
    page: String(page),
  });
  return fetchSources(params);
}

/**
 * 저널명 자동완성. 사용자가 "Archives of PM&R" 같은 문자열을 입력하면 이름 매칭으로 검색.
 * journal type만 — repository/conference 제외.
 */
export async function searchJournalsByName(
  query: string,
  opts: { perPage?: number } = {}
): Promise<JournalSummary[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const perPage = Math.min(Math.max(opts.perPage ?? 10, 1), 25);
  const params = new URLSearchParams({
    search: trimmed,
    filter: "type:journal",
    "per-page": String(perPage),
  });
  return fetchSources(params);
}

