// PubMed Central(PMC) full text — efetch db=pmc → JATS XML 파싱.
// 풀텍스트 체인 fallback 단계. body의 <sec>/<title>/<p>만 본문으로 추출하고
// figure/table/수식/참고문헌은 제거.

import { findFirst, getAttr, stripTagsAndDecode } from "@/lib/xml-utils";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "paperis";
const EMAIL = "paperis@example.com";
const MAX_FULLTEXT_CHARS = 30000;

interface PmcFullText {
  text: string;
  chars: number;
  pmcId: string;
}

function normalizePmcId(raw: string): string {
  const m = /(\d+)/.exec(raw);
  if (!m) throw new Error(`잘못된 PMC ID: ${raw}`);
  return m[1];
}

async function efetchPmcXml(numericId: string): Promise<string> {
  const params = new URLSearchParams({
    db: "pmc",
    id: numericId,
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
    throw new Error(`PMC efetch 실패 (${res.status})`);
  }
  return res.text();
}

// JATS body XML → 평문 텍스트.
// 섹션 제목은 ## 마크다운 헤더로 보존, 단락은 빈 줄로 구분.
function extractBodyText(bodyXml: string): string {
  let cleaned = bodyXml
    .replace(/<fig\b[\s\S]*?<\/fig>/gi, "")
    .replace(/<table-wrap\b[\s\S]*?<\/table-wrap>/gi, "")
    .replace(/<disp-formula\b[\s\S]*?<\/disp-formula>/gi, " ")
    .replace(/<inline-formula\b[\s\S]*?<\/inline-formula>/gi, " [수식] ")
    .replace(/<ref-list\b[\s\S]*?<\/ref-list>/gi, "")
    .replace(/<xref\b[^>]*>[\s\S]*?<\/xref>/gi, "")
    .replace(/<graphic\b[^>]*\/>/gi, "");

  cleaned = cleaned
    .replace(/<title>([\s\S]*?)<\/title>/gi, "\n\n##TITLE##$1##/TITLE##\n\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n##P##$1##/P##\n");

  let decoded = cleaned
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code))
    );

  decoded = decoded
    .replace(/##TITLE##([\s\S]*?)##\/TITLE##/g, (_, t) => `\n## ${t.trim()}\n`)
    .replace(/##P##([\s\S]*?)##\/P##/g, (_, t) => `\n${t.trim()}\n`);

  return decoded
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/(##.+##\n)/g, "$1\n")
    .trim();
}

function trimText(text: string, maxChars = MAX_FULLTEXT_CHARS): string {
  // 정보가치 낮은 섹션 제거
  const lines = text.split("\n");
  const skipPattern =
    /^##\s+(acknowledg|funding|author contribution|conflict|disclosure|supplementary|appendix|data availability|abbreviation|competing interest)/i;
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      skipping = skipPattern.test(line);
    }
    if (!skipping) out.push(line);
  }
  let trimmed = out.join("\n").trim();

  if (trimmed.length > maxChars) {
    const head = trimmed.slice(0, Math.floor(maxChars * 0.7));
    const tail = trimmed.slice(trimmed.length - Math.floor(maxChars * 0.25));
    trimmed = `${head}\n\n[…중간 일부 생략…]\n\n${tail}`;
  }
  return trimmed;
}

// 다른 fulltext 모듈과 동일한 인터페이스로 맞춘 결과
export async function fetchPmcFullText(
  rawPmcId: string
): Promise<{ text: string; sourceUrl?: string } | null> {
  let numericId: string;
  try {
    numericId = normalizePmcId(rawPmcId);
  } catch {
    return null;
  }

  let xml: string;
  try {
    xml = await efetchPmcXml(numericId);
  } catch (err) {
    console.warn("[fulltext.pmc] efetch error", err);
    return null;
  }

  if (/<error\b/i.test(xml)) return null;

  const article = findFirst(xml, "article");
  if (!article) return null;

  // identity 검증용으로 PMC pub-id-type=pmid 추출 (사용은 안 하지만 디버그용)
  const re = /<article-id(\s[^>]*)?>([\s\S]*?)<\/article-id>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(article)) !== null) {
    getAttr(m[1] ?? "", "pub-id-type");
  }

  const body = findFirst(article, "body");
  const abstract = findFirst(article, "abstract");
  if (!body && !abstract) return null;

  const parts: string[] = [];
  if (abstract) {
    const absText = extractBodyText(abstract);
    if (absText) parts.push(`## Abstract\n\n${absText}`);
  }
  if (body) {
    const bodyText = extractBodyText(body);
    if (bodyText) parts.push(bodyText);
  }

  const raw = parts.join("\n\n").trim();
  if (!raw) return null;

  // 제목은 디버그용으로만, 결과에는 본문만
  const titleGroup = findFirst(article, "title-group");
  const _title = titleGroup
    ? stripTagsAndDecode(findFirst(titleGroup, "article-title") ?? "")
    : "";
  void _title;

  const text = trimText(raw);
  return {
    text,
    sourceUrl: `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC${numericId}/`,
  };
}

export const PMC_TRIM_MAX = MAX_FULLTEXT_CHARS;
export { trimText as trimFullText };
