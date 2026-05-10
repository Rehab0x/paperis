// 풀텍스트 체인 오케스트레이터.
// 순서:
//   1. Unpaywall          DOI + UNPAYWALL_EMAIL
//   2. OpenAlex OA URL    DOI 또는 PMID — 1순위 보강 (FULLTEXT_CHAIN_IMPROVEMENT.md)
//   3. Europe PMC         DOI/PMCID/PMID
//   4. PMC efetch         PMCID
//   5. Semantic Scholar   PMID/DOI — openAccessPdf 필드
//   6. medRxiv 프리프린트  DOI — UI에 "프리프린트" 안내 필수
// 각 단계 try/catch 후 다음으로 폴백. 실패 시 attempted 배열에 skipReason/failReason 누적.

import { fetchEuropePmcFullText } from "@/lib/fulltext/europe-pmc";
import { fetchMedRxivFullText } from "@/lib/fulltext/medrxiv";
import { fetchOpenAlexFullText } from "@/lib/fulltext/openalex";
import { fetchPmcFullText } from "@/lib/fulltext/pmc";
import { fetchSemanticScholarFullText } from "@/lib/fulltext/semantic-scholar";
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

  // 2) OpenAlex OA URL — DOI 또는 PMID 있으면 시도. open_access.oa_url에 publisher
  //    OA, 기관 레포, preprint 등이 모두 포함돼 Unpaywall이 못 찾은 경로도 잡힘.
  if (!input.doi && !input.pmid) {
    attempted.push({
      source: "openalex",
      skipReason: "DOI / PMID 모두 없음",
    });
  } else {
    try {
      const r = await fetchOpenAlexFullText({
        doi: input.doi ?? null,
        pmid: input.pmid ?? null,
      });
      if (r) return ok("openalex", r);
      attempted.push({
        source: "openalex",
        failReason: "OpenAlex가 OA URL을 보유하지 않거나 본문 추출에 실패",
      });
    } catch (err) {
      attempted.push({
        source: "openalex",
        failReason: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }

  // 3) Europe PMC — DOI / PMCID / PMID 중 하나라도 있으면 시도
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

  // 4) PMC efetch — PMCID 필수
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

  // 5) Semantic Scholar — openAccessPdf 필드. PMID/DOI 둘 중 하나면 시도.
  if (!input.doi && !input.pmid) {
    attempted.push({ source: "s2", skipReason: "DOI / PMID 모두 없음" });
  } else {
    try {
      const r = await fetchSemanticScholarFullText({
        doi: input.doi ?? null,
        pmid: input.pmid ?? null,
      });
      if (r) return ok("s2", r);
      attempted.push({
        source: "s2",
        failReason: "Semantic Scholar가 openAccessPdf를 보유하지 않음",
      });
    } catch (err) {
      attempted.push({
        source: "s2",
        failReason: err instanceof Error ? err.message : "알 수 없는 오류",
      });
    }
  }

  // 6) medRxiv 프리프린트 — DOI 필수. 최종본 아닌 preprint라 UI에 안내 필요.
  if (!input.doi) {
    attempted.push({ source: "medrxiv", skipReason: "DOI 없음" });
  } else {
    try {
      const r = await fetchMedRxivFullText(input.doi);
      if (r) return ok("medrxiv", r);
      attempted.push({
        source: "medrxiv",
        failReason: "medRxiv에 등록된 프리프린트 없음",
      });
    } catch (err) {
      attempted.push({
        source: "medrxiv",
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
