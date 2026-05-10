// 풀텍스트 source 모듈들이 공통으로 쓰는 PDF/HTML asset fetcher.
// URL 하나 받아 PDF면 unpdf로 텍스트 추출, HTML이면 htmlToText로 변환.
// 각 source(Unpaywall/OpenAlex/S2/medRxiv 등)에서 공통 패턴이라 추출.

import "@/lib/promise-polyfill";
import { extractText } from "unpdf";
import { htmlToText } from "@/lib/fulltext/html-extract";

const FETCH_TIMEOUT_MS = 8000;

/** PDF에서 의미 있는 본문이 추출됐다고 보는 최소 길이 */
export const MIN_PDF_TEXT = 200;
/** HTML에서 의미 있는 본문이 추출됐다고 보는 최소 길이 */
export const MIN_HTML_TEXT = 400;

/**
 * URL에서 PDF/HTML을 받아 텍스트로 변환. 응답 형식 자동 감지(content-type +
 * 확장자). 텍스트가 너무 짧거나 fetch 실패 시 null.
 */
export async function fetchAssetAsText(
  url: string
): Promise<{ text: string; kind: "pdf" | "html" } | null> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Accept:
          "application/pdf,text/html;q=0.9,application/xhtml+xml;q=0.8,*/*;q=0.5",
        "User-Agent":
          "paperis/3 (https://paperis.vercel.app; full-text fetcher)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn("[fulltext.asset] fetch error", url, err);
    return null;
  }
  if (!res.ok) return null;

  const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
  const looksLikePdf =
    ctype.includes("application/pdf") || /\.pdf(\?|$)/i.test(url);
  const looksLikeHtml =
    ctype.includes("html") || ctype.includes("xml") || ctype === "";

  if (looksLikePdf) {
    try {
      const buf = new Uint8Array(await res.arrayBuffer());
      const result = await extractText(buf, { mergePages: true });
      const text = Array.isArray(result.text)
        ? result.text.join("\n\n")
        : (result.text as string);
      const trimmed = (text ?? "").trim();
      if (trimmed.length >= MIN_PDF_TEXT) {
        return { text: trimmed, kind: "pdf" };
      }
    } catch (err) {
      console.warn("[fulltext.asset] pdf parse error", url, err);
    }
    return null;
  }

  if (looksLikeHtml) {
    try {
      const html = await res.text();
      const text = htmlToText(html);
      if (text.length >= MIN_HTML_TEXT) {
        return { text, kind: "html" };
      }
    } catch (err) {
      console.warn("[fulltext.asset] html parse error", url, err);
    }
  }
  return null;
}
