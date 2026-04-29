// Europe PMC: DOI 또는 PMID/PMCID로 fullTextXML(JATS) 조회.
// 두 단계: (1) search → externalId/source 확인, (2) {source}/{id}/fullTextXML 다운로드.
// JATS 파싱은 lib/fulltext/pmc.ts의 헬퍼와 동일 방식이지만 EPMC 응답 구조에 맞춰 간소화.

import { findFirst } from "@/lib/xml-utils";
import { trimFullText } from "@/lib/fulltext/pmc";

const EPMC_REST = "https://www.ebi.ac.uk/europepmc/webservices/rest";

interface EpmcSearchResultItem {
  id?: string;
  source?: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  hasFullText?: string; // "Y"/"N"
  isOpenAccess?: string;
  fullTextUrlList?: {
    fullTextUrl?: Array<{
      url?: string;
      documentStyle?: string;
      site?: string;
    }>;
  };
}

interface EpmcSearchResponse {
  resultList?: { result?: EpmcSearchResultItem[] };
}

async function epmcSearch(
  query: string
): Promise<EpmcSearchResultItem | null> {
  const params = new URLSearchParams({
    query,
    format: "json",
    pageSize: "1",
    resultType: "lite",
  });
  try {
    const res = await fetch(`${EPMC_REST}/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as EpmcSearchResponse;
    return data.resultList?.result?.[0] ?? null;
  } catch (err) {
    console.warn("[fulltext.epmc] search error", err);
    return null;
  }
}

async function epmcFullTextXml(
  source: string,
  id: string
): Promise<string | null> {
  try {
    const res = await fetch(
      `${EPMC_REST}/${encodeURIComponent(source)}/${encodeURIComponent(
        id
      )}/fullTextXML`,
      { headers: { Accept: "application/xml" } }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch (err) {
    console.warn("[fulltext.epmc] fullTextXML error", err);
    return null;
  }
}

// JATS body → 평문 (pmc.ts의 패턴을 한 번 더 가벼운 버전으로)
function jatsToText(xml: string): string {
  const article = findFirst(xml, "article");
  if (!article) return "";
  const body = findFirst(article, "body");
  const abstract = findFirst(article, "abstract");
  if (!body && !abstract) return "";

  function clean(jats: string): string {
    let cleaned = jats
      .replace(/<fig\b[\s\S]*?<\/fig>/gi, "")
      .replace(/<table-wrap\b[\s\S]*?<\/table-wrap>/gi, "")
      .replace(/<disp-formula\b[\s\S]*?<\/disp-formula>/gi, " ")
      .replace(/<inline-formula\b[\s\S]*?<\/inline-formula>/gi, " [수식] ")
      .replace(/<ref-list\b[\s\S]*?<\/ref-list>/gi, "")
      .replace(/<xref\b[^>]*>[\s\S]*?<\/xref>/gi, "")
      .replace(/<graphic\b[^>]*\/>/gi, "");

    cleaned = cleaned
      .replace(/<title>([\s\S]*?)<\/title>/gi, "\n\n## $1\n\n")
      .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n");

    return cleaned
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, code: string) =>
        String.fromCharCode(Number(code))
      )
      .split(/\r?\n/)
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const parts: string[] = [];
  if (abstract) {
    const t = clean(abstract);
    if (t) parts.push(`## Abstract\n\n${t}`);
  }
  if (body) {
    const t = clean(body);
    if (t) parts.push(t);
  }
  return parts.join("\n\n");
}

export async function fetchEuropePmcFullText(input: {
  doi?: string | null;
  pmcId?: string | null;
  pmid?: string | null;
}): Promise<{ text: string; sourceUrl?: string } | null> {
  // EPMC search 쿼리 빌드 — DOI 우선, 그 다음 PMCID, 마지막 PMID
  let query: string;
  if (input.doi) query = `DOI:${input.doi}`;
  else if (input.pmcId) {
    const numeric = /\d+/.exec(input.pmcId)?.[0];
    if (!numeric) return null;
    query = `PMCID:PMC${numeric}`;
  } else if (input.pmid) query = `EXT_ID:${input.pmid} AND SRC:MED`;
  else return null;

  const hit = await epmcSearch(query);
  if (!hit) return null;
  if (hit.hasFullText !== "Y") return null;

  const source = hit.source;
  const id = hit.pmcid ?? hit.id;
  if (!source || !id) return null;

  const xml = await epmcFullTextXml(source, id);
  if (!xml) return null;

  const text = jatsToText(xml);
  if (!text || text.length < 400) return null;

  const sourceUrl = hit.fullTextUrlList?.fullTextUrl?.find(
    (u) => u.documentStyle === "html" || u.documentStyle === "pdf"
  )?.url;
  return { text: trimFullText(text), sourceUrl };
}
