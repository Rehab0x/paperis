// Semantic Scholar Graph API의 openAccessPdf 필드로 풀텍스트 시도.
//
// API 키 없이도 동작 (rate limit 낮음). S2_API_KEY 환경변수 있으면 헤더로 동봉 →
// 더 높은 quota.
//
// PMID 또는 DOI로 조회 가능:
//   /paper/PMID:{pmid}?fields=openAccessPdf
//   /paper/DOI:{doi}?fields=openAccessPdf

import { fetchAssetAsText } from "@/lib/fulltext/asset-fetcher";

const S2_BASE = "https://api.semanticscholar.org/graph/v1";
const TIMEOUT_MS = 8000;

interface S2OpenAccessPdf {
  url?: string | null;
  status?: string | null;
}

interface S2PaperResponse {
  paperId?: string;
  openAccessPdf?: S2OpenAccessPdf | null;
}

async function fetchS2Paper(
  identifier: string
): Promise<S2PaperResponse | null> {
  const url = `${S2_BASE}/paper/${identifier}?fields=openAccessPdf`;
  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.S2_API_KEY;
  if (apiKey) headers["x-api-key"] = apiKey;
  try {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as S2PaperResponse;
  } catch (err) {
    console.warn("[fulltext.s2] api error", identifier, err);
    return null;
  }
}

export async function fetchSemanticScholarFullText(input: {
  doi?: string | null;
  pmid?: string | null;
}): Promise<{ text: string; sourceUrl: string } | null> {
  // PMID 우선 — DOI보다 매칭이 안정적인 케이스가 많음
  let data: S2PaperResponse | null = null;
  if (input.pmid) {
    data = await fetchS2Paper(`PMID:${input.pmid}`);
  }
  if (!data?.openAccessPdf?.url && input.doi) {
    data = await fetchS2Paper(`DOI:${encodeURIComponent(input.doi)}`);
  }
  const pdfUrl = data?.openAccessPdf?.url;
  if (!pdfUrl) return null;

  const asset = await fetchAssetAsText(pdfUrl);
  if (!asset) return null;
  return { text: asset.text, sourceUrl: pdfUrl };
}
