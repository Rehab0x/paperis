// PubMed/PMC/EuropePMC XML 응답을 다루기 위한 경량 헬퍼.
// 본격 XML 파서를 쓰기엔 사용 범위가 좁아 정규식 기반으로 충분.

export function stripTagsAndDecode(input: string): string {
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

export function findAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  const out: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(xml)) !== null) {
    out.push(match[1]);
  }
  return out;
}

export function findFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`);
  const match = re.exec(xml);
  return match ? match[1] : null;
}

export function getAttr(openTag: string, attr: string): string | null {
  const re = new RegExp(`${attr}="([^"]*)"`);
  const match = re.exec(openTag);
  return match ? match[1] : null;
}

// HTML/XML 엔티티 디코딩만 (공백 정규화 없이)
export function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}
