// PubMed PublicationType 목록을 보고 논문이 "review" 계열인지 일반 "research" 인지 분류.
// 미니 요약은 두 부류에서 강조점이 달라야 해서 (research = 효과 크기·통계, review = 합의·논쟁) 프롬프트가 갈린다.

import type { PaperType } from "@/types";

const REVIEW_PATTERNS: ReadonlyArray<RegExp> = [
  /^Review$/i,
  /Systematic\s*Review/i,
  /Meta-?Analysis/i,
  /Narrative\s*Review/i,
  /Scoping\s*Review/i,
  /Umbrella\s*Review/i,
];

export function classifyPaperType(publicationTypes: string[]): PaperType {
  for (const pt of publicationTypes) {
    for (const re of REVIEW_PATTERNS) {
      if (re.test(pt)) return "review";
    }
  }
  return "research";
}
