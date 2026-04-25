// PubMed Central(PMC) full text 가져오기.
// PMC E-utilities efetch는 JATS XML을 반환한다. body 섹션의 <sec>/<title>/<p>만
// 본문 텍스트로 추출하고 figure/table/수식/참고문헌은 제거.

import { findFirst } from "@/lib/xml-utils";

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "paperis";
const EMAIL = "paperis@example.com";

export interface PmcFullText {
  text: string;
  chars: number;
  pmcId: string;
}

function normalizePmcId(raw: string): string {
  // "PMC1234567" 또는 "1234567" 둘 다 받기
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
// 섹션 제목은 ## / ### 마크다운 헤더로 보존, 단락은 빈 줄로 구분.
function extractBodyText(bodyXml: string): string {
  // figures, tables, formulas, references 제거 (정보가치 대비 토큰 비용 큼)
  let cleaned = bodyXml
    .replace(/<fig\b[\s\S]*?<\/fig>/gi, "")
    .replace(/<table-wrap\b[\s\S]*?<\/table-wrap>/gi, "")
    .replace(/<disp-formula\b[\s\S]*?<\/disp-formula>/gi, " ")
    .replace(/<inline-formula\b[\s\S]*?<\/inline-formula>/gi, " [수식] ")
    .replace(/<ref-list\b[\s\S]*?<\/ref-list>/gi, "")
    .replace(/<xref\b[^>]*>[\s\S]*?<\/xref>/gi, "")
    .replace(/<graphic\b[^>]*\/>/gi, "");

  // 섹션 제목과 단락에 마커 삽입
  cleaned = cleaned
    .replace(/<title>([\s\S]*?)<\/title>/gi, "\n\n##TITLE##$1##/TITLE##\n\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n##P##$1##/P##\n");

  // 남은 태그 모두 제거 + 엔티티 디코드
  let decoded = cleaned
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));

  // 마커 복원: 제목은 ## 헤더로
  decoded = decoded
    .replace(/##TITLE##([\s\S]*?)##\/TITLE##/g, (_, t) => `\n## ${t.trim()}\n`)
    .replace(/##P##([\s\S]*?)##\/P##/g, (_, t) => `\n${t.trim()}\n`);

  // 줄 단위 공백 정규화 후 빈 줄 압축
  return decoded
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n")
    .replace(/(##.+##\n)/g, "$1\n") // 헤더 뒤 빈 줄
    .trim();
}

// PMC full text 가져오기
export async function fetchPmcFullText(rawPmcId: string): Promise<PmcFullText> {
  const numericId = normalizePmcId(rawPmcId);
  const xml = await efetchPmcXml(numericId);

  // 응답이 에러 메시지일 수 있음
  if (/<error\b/i.test(xml)) {
    const errMatch = /<error[^>]*>([\s\S]*?)<\/error>/i.exec(xml);
    throw new Error(`PMC: ${errMatch?.[1]?.trim() ?? "본문을 받을 수 없습니다."}`);
  }

  const article = findFirst(xml, "article");
  if (!article) {
    throw new Error("PMC 응답에 article이 없습니다.");
  }

  // 일부 PMC 항목은 body가 비어 있고 abstract만 제공됨
  const body = findFirst(article, "body");
  const abstract = findFirst(article, "abstract");

  if (!body && !abstract) {
    throw new Error("PMC에서 full text 또는 abstract를 찾을 수 없습니다.");
  }

  const parts: string[] = [];
  if (abstract) {
    const absText = extractBodyText(abstract);
    if (absText) parts.push(`## Abstract\n\n${absText}`);
  }
  if (body) {
    const bodyText = extractBodyText(body);
    if (bodyText) parts.push(bodyText);
  }

  const text = parts.join("\n\n").trim();
  if (!text) {
    throw new Error("PMC 본문 추출 결과가 비어 있습니다.");
  }

  return {
    text,
    chars: text.length,
    pmcId: rawPmcId.startsWith("PMC") ? rawPmcId : `PMC${numericId}`,
  };
}

// 추출 결과가 너무 길면 LLM에 그대로 보내기엔 비싸다.
// 우선 References 섹션은 없지만 Acknowledgments / Funding / Author Contributions 같은
// 부수 섹션은 잘라낸다. 또한 매우 긴 경우 head + tail로 트림.
const MAX_FULLTEXT_CHARS = 30000;

export function trimPmcText(text: string, maxChars = MAX_FULLTEXT_CHARS): string {
  // 부수 섹션 제거: 제목 줄(## …) 단위로 끊고 키워드 매칭
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
