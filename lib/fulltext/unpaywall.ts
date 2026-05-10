// Unpaywall: DOI → 합법적 OA URL → HTML/PDF fetch → 텍스트.
// 공식 정책: email 식별자 필수 (polite pool). UNPAYWALL_EMAIL 환경변수가 없으면 통째로 스킵.

import { fetchAssetAsText } from "@/lib/fulltext/asset-fetcher";

// publisher가 응답을 안 주면 무한정 기다리지 않도록 fetch별 timeout.
const FETCH_TIMEOUT_MS = 8000;
// best_oa_location + oa_locations 합쳐도 너무 오래 헤매지 않도록 시도 URL 수 제한.
const MAX_URLS = 4;

interface UnpaywallLocation {
  url?: string | null;
  url_for_landing_page?: string | null;
  url_for_pdf?: string | null;
  host_type?: string | null;
  license?: string | null;
}

interface UnpaywallResponse {
  doi?: string;
  is_oa?: boolean;
  best_oa_location?: UnpaywallLocation | null;
  oa_locations?: UnpaywallLocation[] | null;
}

async function fetchUnpaywall(
  doi: string,
  email: string
): Promise<UnpaywallResponse | null> {
  const encoded = encodeURIComponent(doi);
  const url = `https://api.unpaywall.org/v2/${encoded}?email=${encodeURIComponent(
    email
  )}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as UnpaywallResponse;
  } catch (err) {
    console.warn("[fulltext.unpaywall] api error", err);
    return null;
  }
}

function pickUrls(loc: UnpaywallLocation | null | undefined): string[] {
  if (!loc) return [];
  const urls = [loc.url_for_pdf, loc.url, loc.url_for_landing_page].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
  // dedupe 보존 순서
  return Array.from(new Set(urls));
}

export async function fetchUnpaywallFullText(
  doi: string
): Promise<{ text: string; sourceUrl: string } | null> {
  const email = process.env.UNPAYWALL_EMAIL;
  if (!email) return null;
  if (!doi) return null;

  const data = await fetchUnpaywall(doi, email);
  if (!data || !data.is_oa) return null;

  const candidates: UnpaywallLocation[] = [];
  if (data.best_oa_location) candidates.push(data.best_oa_location);
  for (const loc of data.oa_locations ?? []) candidates.push(loc);

  let tried = 0;
  for (const loc of candidates) {
    if (tried >= MAX_URLS) break;
    const urls = pickUrls(loc);
    for (const url of urls) {
      if (tried >= MAX_URLS) break;
      tried += 1;
      const asset = await fetchAssetAsText(url);
      if (asset) {
        return { text: asset.text, sourceUrl: url };
      }
    }
  }
  return null;
}
