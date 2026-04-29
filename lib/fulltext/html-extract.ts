// HTML → 평문 추출. Readability 의존을 피하고 직접 작성.
// 학술 사이트의 article/main 태그 우선, 그 외 body 사용.

const STRIP_BLOCKS: ReadonlyArray<RegExp> = [
  /<script\b[\s\S]*?<\/script>/gi,
  /<style\b[\s\S]*?<\/style>/gi,
  /<noscript\b[\s\S]*?<\/noscript>/gi,
  /<svg\b[\s\S]*?<\/svg>/gi,
  /<nav\b[\s\S]*?<\/nav>/gi,
  /<header\b[\s\S]*?<\/header>/gi,
  /<footer\b[\s\S]*?<\/footer>/gi,
  /<aside\b[\s\S]*?<\/aside>/gi,
  /<form\b[\s\S]*?<\/form>/gi,
  /<figure\b[\s\S]*?<\/figure>/gi,
  /<figcaption\b[\s\S]*?<\/figcaption>/gi,
  /<picture\b[\s\S]*?<\/picture>/gi,
  /<iframe\b[\s\S]*?<\/iframe>/gi,
  /<button\b[\s\S]*?<\/button>/gi,
  // 공통 사이드/네비/광고 클래스 — div 본체는 못 잡지만 대표적인 컨테이너 패턴 컷
  /<div\b[^>]*class="[^"]*(?:nav|sidebar|menu|advert|cookie|toolbar|breadcrumb|footer|header|skip-link|sr-only)[^"]*"[\s\S]*?<\/div>/gi,
];

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) =>
      String.fromCharCode(parseInt(code, 16))
    );
}

function pickBody(html: string): string {
  // 우선순위: <article>, <main>, [role="main"], <body>
  const candidates = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<div\b[^>]*role=["']main["'][^>]*>([\s\S]*?)<\/div>/i,
    /<body\b[^>]*>([\s\S]*?)<\/body>/i,
  ];
  for (const re of candidates) {
    const m = re.exec(html);
    if (m && m[1] && m[1].length > 200) return m[1];
  }
  return html;
}

const MAX_CHARS = 30000;

export function htmlToText(html: string): string {
  if (!html) return "";
  let body = pickBody(html);
  for (const re of STRIP_BLOCKS) body = body.replace(re, " ");

  // 단락/헤더 보존을 위한 마커
  body = body
    .replace(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi, "\n\n## $2\n\n")
    .replace(/<h[4-6]\b[^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n\n### $1\n\n")
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n")
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(div|section|tr|td|th)>/gi, "\n");

  // 남은 태그 일괄 제거
  let text = body.replace(/<[^>]+>/g, " ");
  text = decodeEntities(text);

  text = text
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");

  if (text.length > MAX_CHARS) {
    const head = text.slice(0, Math.floor(MAX_CHARS * 0.7));
    const tail = text.slice(text.length - Math.floor(MAX_CHARS * 0.25));
    text = `${head}\n\n[…중간 일부 생략…]\n\n${tail}`;
  }
  return text;
}
