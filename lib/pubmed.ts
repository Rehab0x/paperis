// PubMed E-utilities 클라이언트.
// 검색식은 lib/query-translator.ts에서 자연어로부터 미리 만들어져 들어온다.
// 이 모듈은 esearch+efetch 두 단계 + XML 파싱만 담당.

import { findAll, findFirst, getAttr, stripTagsAndDecode } from "@/lib/xml-utils";
import type { Paper, SortMode } from "@/types";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "paperis";
const EMAIL = "paperis@example.com";

// SortMode → PubMed esearch sort 파라미터.
// PubMed가 직접 인용수 정렬을 지원하지 않으므로 citations은 relevance로 받아 OpenAlex로 후정렬한다.
function pubmedSortParam(sort: SortMode): "pub_date" | "relevance" {
  return sort === "recency" ? "pub_date" : "relevance";
}

interface EsearchResult {
  idlist: string[];
  total: number;
}

async function esearch(
  term: string,
  sort: SortMode,
  retmax: number,
  retstart: number
): Promise<EsearchResult> {
  const params = new URLSearchParams({
    db: "pubmed",
    term,
    retmax: String(retmax),
    retstart: String(retstart),
    retmode: "json",
    sort: pubmedSortParam(sort),
    tool: TOOL,
    email: EMAIL,
  });
  const apiKey = process.env.PUBMED_API_KEY;
  if (apiKey) params.set("api_key", apiKey);

  const res = await fetch(`${EUTILS_BASE}/esearch.fcgi?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`PubMed esearch 실패 (${res.status})`);
  }
  const data: {
    esearchresult?: { idlist?: string[]; count?: string };
  } = await res.json();
  const idlist = data.esearchresult?.idlist ?? [];
  const total = Number(data.esearchresult?.count ?? "0") || 0;
  return { idlist, total };
}

async function efetchXml(pmids: string[]): Promise<string> {
  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
    tool: TOOL,
    email: EMAIL,
  });
  const apiKey = process.env.PUBMED_API_KEY;
  if (apiKey) params.set("api_key", apiKey);

  const res = await fetch(`${EUTILS_BASE}/efetch.fcgi?${params.toString()}`, {
    headers: { Accept: "application/xml" },
  });
  if (!res.ok) {
    throw new Error(`PubMed efetch 실패 (${res.status})`);
  }
  return res.text();
}

function parseAuthors(articleXml: string): string[] {
  const authorListXml = findFirst(articleXml, "AuthorList");
  if (!authorListXml) return [];
  return findAll(authorListXml, "Author")
    .map((author) => {
      const lastName = findFirst(author, "LastName");
      const foreName = findFirst(author, "ForeName");
      const initials = findFirst(author, "Initials");
      const collective = findFirst(author, "CollectiveName");
      if (lastName) {
        const first = foreName ?? initials ?? "";
        return stripTagsAndDecode(first ? `${lastName} ${first}` : lastName);
      }
      if (collective) return stripTagsAndDecode(collective);
      return "";
    })
    .filter(Boolean);
}

function parseAbstract(articleXml: string): string {
  const abstractXml = findFirst(articleXml, "Abstract");
  if (!abstractXml) return "";
  const sections = findAll(abstractXml, "AbstractText");
  if (sections.length === 0) return "";

  // Label 속성이 있으면 섹션별로 구분해서 합친다
  const re = /<AbstractText(\s[^>]*)?>([\s\S]*?)<\/AbstractText>/g;
  const parts: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(abstractXml)) !== null) {
    const attrs = match[1] ?? "";
    const body = stripTagsAndDecode(match[2]);
    if (!body) continue;
    const label = getAttr(attrs, "Label");
    parts.push(label ? `${label}: ${body}` : body);
  }
  return parts.join("\n\n");
}

function parsePubDate(articleXml: string): { year: string; pubDate: string } {
  const pubDateXml =
    findFirst(articleXml, "PubDate") ??
    findFirst(articleXml, "ArticleDate") ??
    "";
  const year = findFirst(pubDateXml, "Year") ?? "";
  const month = findFirst(pubDateXml, "Month") ?? "";
  const day = findFirst(pubDateXml, "Day") ?? "";
  const medlineDate = findFirst(pubDateXml, "MedlineDate");
  if (medlineDate) {
    const m = /\d{4}/.exec(medlineDate);
    return {
      year: m ? m[0] : stripTagsAndDecode(medlineDate),
      pubDate: stripTagsAndDecode(medlineDate),
    };
  }
  const pubDate = [year, month, day].filter(Boolean).join("-");
  return { year: stripTagsAndDecode(year), pubDate };
}

function parseArticleIds(
  articleXml: string
): { doi: string | null; pmcId: string | null } {
  let doi: string | null = null;
  let pmcId: string | null = null;

  const re = /<ArticleId(\s[^>]*)>([\s\S]*?)<\/ArticleId>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(articleXml)) !== null) {
    const type = getAttr(match[1], "IdType");
    const value = stripTagsAndDecode(match[2]);
    if (type === "doi") doi = value;
    else if (type === "pmc") pmcId = value;
  }

  if (!doi) {
    const re2 = /<ELocationID(\s[^>]*)>([\s\S]*?)<\/ELocationID>/g;
    let m: RegExpExecArray | null;
    while ((m = re2.exec(articleXml)) !== null) {
      const type = getAttr(m[1], "EIdType");
      if (type === "doi") {
        doi = stripTagsAndDecode(m[2]);
        break;
      }
    }
  }

  return { doi, pmcId };
}

function parsePublicationTypes(articleXml: string): string[] {
  const listXml = findFirst(articleXml, "PublicationTypeList");
  if (!listXml) return [];
  return findAll(listXml, "PublicationType")
    .map((t) => stripTagsAndDecode(t))
    .filter(Boolean);
}

function parsePubmedArticle(articleXml: string): Paper | null {
  // ReferenceList 안의 ArticleId/ELocationID는 article 본인의 ID가 아니라 인용된 논문들의 ID이다.
  // 미리 잘라내지 않으면 parseArticleIds가 마지막 참조의 DOI/PMC로 덮어써 잘못된 paper 객체가 만들어진다.
  const ownXml = articleXml.replace(
    /<ReferenceList\b[\s\S]*?<\/ReferenceList>/gi,
    ""
  );

  const pmid = findFirst(ownXml, "PMID");
  if (!pmid) return null;
  const pmidStr = stripTagsAndDecode(pmid);

  const title = stripTagsAndDecode(findFirst(ownXml, "ArticleTitle") ?? "");
  const abstract = parseAbstract(ownXml);
  const authors = parseAuthors(ownXml);
  const journal = stripTagsAndDecode(
    findFirst(ownXml, "Title") ?? findFirst(ownXml, "ISOAbbreviation") ?? ""
  );
  const { year, pubDate } = parsePubDate(ownXml);
  const { doi, pmcId } = parseArticleIds(ownXml);
  const publicationTypes = parsePublicationTypes(ownXml);

  return {
    pmid: pmidStr,
    title,
    abstract,
    authors,
    journal,
    year,
    pubDate,
    doi,
    pmcId,
    publicationTypes,
    access: pmcId ? "open" : "closed",
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmidStr}/`,
  };
}

function parsePubmedArticles(xml: string): Paper[] {
  const blocks = findAll(xml, "PubmedArticle");
  return blocks
    .map((block) => parsePubmedArticle(block))
    .filter((p): p is Paper => p !== null);
}

// 공개 API: 검색식(이미 PubMed 문법) → 상세 Paper[] (esearch 순서 보존)
export async function searchPubMed(
  term: string,
  sort: SortMode,
  retmax = 20,
  retstart = 0
): Promise<{ count: number; total: number; papers: Paper[] }> {
  if (!term.trim()) {
    return { count: 0, total: 0, papers: [] };
  }

  const { idlist: pmids, total } = await esearch(term, sort, retmax, retstart);
  if (pmids.length === 0) {
    return { count: 0, total, papers: [] };
  }

  const xml = await efetchXml(pmids);
  const papersByPmid = new Map<string, Paper>();
  for (const paper of parsePubmedArticles(xml)) {
    papersByPmid.set(paper.pmid, paper);
  }

  // esearch 순서(관련도/날짜) 유지
  const papers = pmids
    .map((id) => papersByPmid.get(id))
    .filter((p): p is Paper => Boolean(p));

  return { count: papers.length, total, papers };
}
