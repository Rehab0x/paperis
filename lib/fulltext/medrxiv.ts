// medRxiv 프리프린트로 풀텍스트 시도.
//
// **주의**: medRxiv는 *프리프린트* — 최종 출판본과 내용이 다를 수 있다. 본문 fetch
// 자체는 정상이지만 UI에서 사용자에게 "프리프린트 — 최종본과 다를 수 있음"을
// 명시 표시해야 한다 (FullTextView에서 source === "medrxiv" 분기).
//
// 현재 medRxiv는 의학 분야 프리프린트라 임상 연구의 상당수가 등록됨. 점차 늘어나는
// 추세 (NIH 정책 강화 등).

import { fetchAssetAsText } from "@/lib/fulltext/asset-fetcher";

const BIORXIV_BASE = "https://api.biorxiv.org/details/medrxiv";
const TIMEOUT_MS = 6000;

interface MedRxivEntry {
  doi?: string;
  jatsxml?: string | null;
  // 다른 필드는 응답에 있지만 풀텍스트엔 doi만 사용
}

interface MedRxivResponse {
  collection?: MedRxivEntry[];
}

export async function fetchMedRxivFullText(
  doi: string | null
): Promise<{ text: string; sourceUrl: string } | null> {
  if (!doi) return null;
  // medRxiv API는 DOI로 조회. doi가 medrxiv 자체 doi가 아닌 일반 publisher doi라도
  // crossref 매칭으로 찾아주는 케이스가 있어 일단 시도.
  const url = `${BIORXIV_BASE}/${encodeURIComponent(doi)}/na/json`;
  let data: MedRxivResponse | null = null;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    data = (await res.json()) as MedRxivResponse;
  } catch (err) {
    console.warn("[fulltext.medrxiv] api error", err);
    return null;
  }
  const entry = data.collection?.[0];
  if (!entry?.doi) return null;

  // medRxiv 본문 PDF URL — DOI 패턴
  const pdfUrl = `https://www.medrxiv.org/content/${entry.doi}.full.pdf`;
  const asset = await fetchAssetAsText(pdfUrl);
  if (!asset) return null;
  return { text: asset.text, sourceUrl: pdfUrl };
}
