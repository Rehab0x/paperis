// 영어 논문 제목을 한국어로 batch 번역 — "한국어 제목 표시" 기능용.
//
// 한 번 번역된 제목은 불변 — 서버 Redis 캐시 영구(LRU eviction에만 맡김),
// 클라 localStorage 캐시 영구. pmid가 키. lib/gemini.ts translateTitleToKorean
// 단일 호출과 별개 — 검색/호 탐색/주제 탐색은 페이지당 10-200건이라 batch
// JSON 호출이 필수 (개별 호출 시 quota·latency 폭주).

import { getAiProvider } from "@/lib/ai/registry";
import type { AiJsonSchema, AiProvider } from "@/lib/ai/types";

interface BatchInput {
  pmid: string;
  title: string;
}

const titleSchema: AiJsonSchema = {
  type: "object",
  properties: {
    translations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pmid: { type: "string" },
          titleKo: { type: "string" },
        },
        required: ["pmid", "titleKo"],
        propertyOrdering: ["pmid", "titleKo"],
      },
    },
  },
  required: ["translations"],
  propertyOrdering: ["translations"],
};

const SYSTEM = [
  "You translate biomedical paper titles from English to Korean for a Korean physician scanning a feed.",
  "For each paper, return ONE translated title — a single line, no quotes, no labels.",
  "Preserve precise English medical/rehabilitation terms when natural (spasticity, FIM, NIHSS, CIMT, RCT, Botox, fMRI, etc.). Translate the surrounding structure into clear concise Korean.",
  "Keep the meaning close to the original — do not summarize, paraphrase, or add commentary.",
  "Each item's pmid MUST exactly match an input paper's pmid.",
  "If the input title is already Korean (≥ 30% Hangul), return it unchanged.",
  "Output JSON only.",
].join(" ");

function userPrompt(papers: BatchInput[]): string {
  const blocks = papers.map(
    (p, i) => `#${i + 1}\npmid: ${p.pmid}\ntitle: ${p.title}`
  );
  return [
    "Translate each paper title below. Return one JSON object as { translations: [...] }.",
    "Order does not need to match input but pmid values must exactly match.",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

function isMostlyHangul(s: string): boolean {
  const trimmed = s.trim();
  if (!trimmed) return false;
  const hangul = trimmed.match(/[가-힣]/g)?.length ?? 0;
  return hangul / trimmed.length > 0.3;
}

export async function generateBatchTitleTranslations(
  papers: BatchInput[],
  provider?: AiProvider
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const needs: BatchInput[] = [];
  for (const p of papers) {
    if (!p.pmid || !p.title.trim()) continue;
    // 이미 한국어면 그대로 — quota 절약
    if (isMostlyHangul(p.title)) {
      out.set(p.pmid, p.title.trim());
      continue;
    }
    needs.push({ pmid: p.pmid, title: p.title.trim() });
  }
  if (needs.length === 0) return out;

  const ai = provider ?? getAiProvider("gemini");
  const validPmids = new Set(needs.map((p) => p.pmid));

  const parsed = await ai.generateJson<{
    translations?: Array<{ pmid?: unknown; titleKo?: unknown }>;
  }>({
    systemInstruction: SYSTEM,
    userPrompt: userPrompt(needs),
    temperature: 0.2,
    tier: "fast",
    jsonSchema: titleSchema,
  });

  for (const item of parsed.translations ?? []) {
    const pmid = typeof item.pmid === "string" ? item.pmid.trim() : "";
    const ko = typeof item.titleKo === "string" ? item.titleKo.trim() : "";
    if (!pmid || !validPmids.has(pmid) || !ko) continue;
    // 따옴표 stripping — 일부 모델이 종종 wrap
    const clean = ko.replace(/^["「""']|["」""']$/g, "").trim();
    if (clean) out.set(pmid, clean);
  }
  return out;
}
