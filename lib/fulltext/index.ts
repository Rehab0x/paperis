// 풀텍스트 체인 오케스트레이터.
// 순서: Unpaywall(DOI 기반) → Europe PMC(DOI/PMCID/PMID) → PMC efetch(PMCID).
// 각 단계는 try/catch 후 다음으로 폴백. 실패 시 단계별 skipReason/failReason을 모아 반환 →
// UI에서 사용자에게 어디서 막혔는지 보여주고 다음 액션(예: UNPAYWALL_EMAIL 설정)을 제안.

import { fetchEuropePmcFullText } from "@/lib/fulltext/europe-pmc";
import { fetchPmcFullText } from "@/lib/fulltext/pmc";
import { fetchUnpaywallFullText } from "@/lib/fulltext/unpaywall";
import type {
  FullTextAttempt,
  FullTextResponse,
  FullTextSource,
  Paper,
} from "@/types";

interface ChainInput {
  doi?: string | null;
  pmcId?: string | null;
  pmid?: string | null;
}

function ok(
  source: FullTextSource,
  r: { text: string; sourceUrl?: string }
): FullTextResponse {
  return {
    ok: true,
    text: r.text,
    source,
    sourceUrl: r.sourceUrl,
    charCount: r.text.length,
  };
}

export async function fetchFullText(
  input: ChainInput
): Promise<FullTextResponse> {
  const attempted: FullTextAttempt[] = [];

  // 1) Unpaywall — DOI + UNPAYWALL_EMAIL 둘 다 있어야 함
  if (!input.doi) {
    attempted.push({ source: "unpaywall", skipReason: "DOI 없음" });
  } else if (!process.env.UNPAYWALL_EMAIL) {
    attempted.push({
      source: "unpaywall",
      skipReason: "UNPAYWALL_EMAIL 미설정 — .env.local에 이메일을 넣으면 OA 본문 매칭률이 크게 올라갑니다",
    });
  } else {
    try {
      const r = await fetchUnpaywallFullText(input.doi);
      if (r) return ok("unpaywall", r);
      attempted.push({
        source: "unpaywall",
        failReason: "OA URL을 찾지 못했거나 본문이 너무 짧습니다",
      });
    } catch (err) {
      attempted.push({
        source: "unpaywall",
        failReason: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }

  // 2) Europe PMC — DOI / PMCID / PMID 중 하나라도 있으면 시도
  if (!input.doi && !input.pmcId && !input.pmid) {
    attempted.push({
      source: "europepmc",
      skipReason: "DOI / PMCID / PMID 모두 없음",
    });
  } else {
    try {
      const r = await fetchEuropePmcFullText({
        doi: input.doi ?? null,
        pmcId: input.pmcId ?? null,
        pmid: input.pmid ?? null,
      });
      if (r) return ok("europepmc", r);
      attempted.push({
        source: "europepmc",
        failReason:
          "Europe PMC에 풀텍스트가 인덱싱되지 않은 논문입니다 (대개 비-OA)",
      });
    } catch (err) {
      attempted.push({
        source: "europepmc",
        failReason: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }

  // 3) PMC efetch — PMCID 필수
  if (!input.pmcId) {
    attempted.push({ source: "pmc", skipReason: "PMCID 없음 (비-OA 추정)" });
  } else {
    try {
      const r = await fetchPmcFullText(input.pmcId);
      if (r) return ok("pmc", r);
      attempted.push({
        source: "pmc",
        failReason: "PMC efetch가 본문을 반환하지 않음",
      });
    } catch (err) {
      attempted.push({
        source: "pmc",
        failReason: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }

  return { ok: false, attempted };
}

export function chainInputFromPaper(paper: Paper): ChainInput {
  return {
    doi: paper.doi,
    pmcId: paper.pmcId,
    pmid: paper.pmid,
  };
}
