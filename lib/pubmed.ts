import type { NeedFilter, Paper } from "@/types";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "paperis";
const EMAIL = "paperis@example.com";

// 니즈 필터별 검색어 보강
function buildFilterClause(filter: NeedFilter | undefined): string {
  switch (filter) {
    case "treatment":
      return "(treatment[Title/Abstract] OR intervention[Title/Abstract] OR therapy[Title/Abstract] OR rehabilitation[Title/Abstract])";
    case "diagnosis":
      return "(diagnosis[Title/Abstract] OR assessment[Title/Abstract] OR evaluation[Title/Abstract] OR diagnostic[Title/Abstract])";
    case "trend":
      return '(review[Publication Type] OR meta-analysis[Publication Type] OR systematic review[Publication Type])';
    case "balanced":
    default:
      return "";
  }
}

function buildSearchTerm(query: string, filter: NeedFilter | undefined): string {
  const trimmed = query.trim();
  const filterClause = buildFilterClause(filter);
  const parts = [trimmed];
  if (filterClause) parts.push(filterClause);
  // 영어 논문 위주 + 사람 대상
  parts.push("hasabstract[Filter]");
  parts.push("english[Language]");
  return parts.map((p) => `(${p})`).join(" AND ");
}

// esearch: 쿼리 → PMID 목록
async function esearch(term: string, retmax: number): Promise<string[]> {
  const params = new URLSearchParams({
    db: "pubmed",
    term,
    retmax: String(retmax),
    retmode: "json",
    sort: "relevance",
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
  const data: { esearchresult?: { idlist?: string[] } } = await res.json();
  return data.esearchresult?.idlist ?? [];
}

// efetch: PMID 목록 → 상세 XML
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

// --- 최소 XML 파서: PubMed efetch 응답 전용 ---

// HTML 엔티티 디코딩 + XML 태그 제거
function stripTagsAndDecode(input: string): string {
  return input
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function findAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    out.push(match[1]);
  }
  return out;
}

function findFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
  const match = re.exec(xml);
  return match ? match[1] : null;
}

function getAttr(openTag: string, attr: string): string | null {
  const re = new RegExp(`${attr}="([^"]*)"`);
  const match = re.exec(openTag);
  return match ? match[1] : null;
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

  // AbstractText에 Label 속성이 있으면 섹션별로 구분
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

function parseArticleIds(articleXml: string): { doi: string | null; pmcId: string | null } {
  const ids = findAll(articleXml, "ArticleId");
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

  // fallback: ELocationID type="doi"
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

  // ids 변수 사용 (미사용 경고 방지)
  void ids;

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
  const pmid = findFirst(articleXml, "PMID");
  if (!pmid) return null;
  const pmidStr = stripTagsAndDecode(pmid);

  const title = stripTagsAndDecode(findFirst(articleXml, "ArticleTitle") ?? "");
  const abstract = parseAbstract(articleXml);
  const authors = parseAuthors(articleXml);
  const journal = stripTagsAndDecode(
    findFirst(articleXml, "Title") ?? findFirst(articleXml, "ISOAbbreviation") ?? ""
  );
  const { year, pubDate } = parsePubDate(articleXml);
  const { doi, pmcId } = parseArticleIds(articleXml);
  const publicationTypes = parsePublicationTypes(articleXml);

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
  // <PubmedArticle>...</PubmedArticle> 블록 단위로 분해
  const blocks = findAll(xml, "PubmedArticle");
  return blocks
    .map((block) => parsePubmedArticle(block))
    .filter((p): p is Paper => p !== null);
}

// 공개 API: 검색 → 상세까지 한 번에
export async function searchPapers(
  query: string,
  filter: NeedFilter = "balanced",
  retmax = 20
): Promise<{ count: number; papers: Paper[] }> {
  if (!query.trim()) {
    return { count: 0, papers: [] };
  }

  const term = buildSearchTerm(query, filter);
  const pmids = await esearch(term, retmax);
  if (pmids.length === 0) {
    return { count: 0, papers: [] };
  }

  const xml = await efetchXml(pmids);
  const papersByPmid = new Map<string, Paper>();
  for (const paper of parsePubmedArticles(xml)) {
    papersByPmid.set(paper.pmid, paper);
  }

  // esearch 순서(관련도) 유지
  const papers = pmids
    .map((id) => papersByPmid.get(id))
    .filter((p): p is Paper => Boolean(p));

  return { count: papers.length, papers };
}
