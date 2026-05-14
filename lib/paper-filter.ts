// 호 탐색 등에서 같이 잡히는 noise paper (editorial, letter, erratum 등) 필터.
// PubMed publicationTypes 기준. 사용자가 토글로 ON/OFF 가능 (호 탐색 기본 ON).
//
// 정상 substantive paper도 가끔 abstract가 비어 있을 수 있어 abstract 빈 거 자체로는
// 필터 안 한다 (오래된 paper 등). 다만 abstract 비어있으면서 publicationType이 noise면
// 확실한 noise라 제외.

import type { Paper } from "@/types";

/** PubMed publicationType 중 substantive research가 아닌 것들. */
export const NOISE_PUBLICATION_TYPES: ReadonlySet<string> = new Set([
  "Editorial",
  "Letter",
  "Comment",
  "Comments",
  "News",
  "Newspaper Article",
  "Erratum",
  "Published Erratum",
  "Correction",
  "Retracted Publication",
  "Retraction of Publication",
  "Biography",
  "Obituary",
  "Interview",
  "Historical Article",
  "Bibliography",
  "Lecture",
  "Address",
  "Congresses",
  "Personal Narrative",
  "Autobiography",
  "Webcasts",
  "Video-Audio Media",
]);

/**
 * substantive paper (실제 연구·리뷰)인지 판정.
 *
 * 룰:
 *   - publicationTypes 중 substantive type이 있으면 → 유지
 *     (Journal Article, Review, Clinical Trial 등이 동반될 때 noise type 무시)
 *   - substantive type 없고 noise type만 있으면 → noise
 *   - publicationTypes 비어 있으면 → 유지 (안전)
 */
export function isSubstantivePaper(paper: Paper): boolean {
  if (paper.publicationTypes.length === 0) return true;
  const hasSubstantive = paper.publicationTypes.some(
    (t) => !NOISE_PUBLICATION_TYPES.has(t)
  );
  return hasSubstantive;
}

/** noise 비율 카운트 — UI에서 "N filtered" 표시용. */
export function countNoise(papers: Paper[]): number {
  let n = 0;
  for (const p of papers) {
    if (!isSubstantivePaper(p)) n++;
  }
  return n;
}
