// 자연어 → PubMed 검색식 변환. provider-agnostic (gemini/claude/...).
// 결정론적 변환이라 fast tier 모델로 충분.

import { getAiProvider } from "@/lib/ai/registry";
import type { AiJsonSchema, AiProvider } from "@/lib/ai/types";

const querySchema: AiJsonSchema = {
  type: "object",
  properties: {
    query: { type: "string" },
    note: { type: "string" },
  },
  required: ["query", "note"],
  propertyOrdering: ["query", "note"],
};

const SYSTEM_INSTRUCTION = [
  "You translate a natural-language biomedical question (Korean or English) into a PubMed search expression that returns a useful result set.",
  "CRITICAL: faithfully follow the user's actual topic. Never invent a different clinical domain. If the user asks about hepatitis, return a hepatitis query — not stroke, not rehabilitation, not anything else.",
  "Goal: optimize for RECALL first, precision second. Most users would rather see 200–2000 results sorted by relevance than 0 results. Empty result sets are a failure mode.",
  "Concatenate ALL clauses with explicit AND. Never juxtapose two bracketed filters without an AND between them.",
  "Bracket usage rule: use [MeSH Terms] sparingly — many real queries lose recall when forced through MeSH. For each conceptual term, prefer either no bracket OR an OR-group like '(spasticity[Title/Abstract] OR \"muscle spasticity\"[MeSH Terms])'. NEVER use [MeSH Terms] alone unless you are highly confident that exact MeSH heading exists.",
  "For short English keyword phrases (e.g. 'spasticity after stroke', 'statin liver injury'), the simplest correct translation is often '(termA) AND (termB)' with no brackets at all. Do NOT over-engineer.",
  "Stay concise (3–15 tokens before language/abstract filters). Do not add date filters unless the user asked.",
  'Always end with " AND english[Language] AND hasabstract[Filter]" to keep results consumable.',
  "Preserve precise medical terms in English (e.g., hepatitis, statin, Parkinson disease, spasticity, NIHSS).",
  "If the user query is too vague, broaden using closely-related synonyms within the SAME domain — do not switch domains.",
  "Return JSON only, following the schema. Note (Korean, 1 sentence, <= 60 chars) explains the angle you searched, in the user's actual topic.",
  "Examples:",
  "  user: 'spasticity after stroke' → query: '(spasticity) AND (stroke OR cerebrovascular accident) AND english[Language] AND hasabstract[Filter]'",
  "  user: '뇌졸중 후 경직' → query: '(spasticity OR \"muscle spasticity\") AND (stroke OR \"cerebrovascular accident\") AND english[Language] AND hasabstract[Filter]'",
  "  user: 'autoimmune hepatitis coffee' → query: '(autoimmune hepatitis) AND (coffee) AND english[Language] AND hasabstract[Filter]'",
].join(" ");

export interface TranslationResult {
  query: string;
  note: string;
}

export async function translateNaturalLanguage(
  nl: string,
  provider?: AiProvider
): Promise<TranslationResult> {
  const trimmed = nl.trim();
  if (!trimmed) {
    throw new Error("자연어 검색어가 비어 있습니다.");
  }

  const p = provider ?? getAiProvider("gemini");
  const parsed = await p.generateJson<{ query?: unknown; note?: unknown }>({
    systemInstruction: SYSTEM_INSTRUCTION,
    userPrompt: trimmed,
    temperature: 0.2,
    // 자연어 검색은 입력 다양성이 있어 fast(가장 가벼움)보다 balanced(3.1 Lite)가 안전.
    // 3.1 Lite는 비용도 저렴해 fast 대비 손해 거의 없음.
    tier: "balanced",
    jsonSchema: querySchema,
  });

  // Gemini가 가끔 query에 raw 제어문자(\n, \r, \t)를 섞어 반환 — sanitize
  const sanitize = (s: string) =>
    s.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  const query = typeof parsed.query === "string" ? sanitize(parsed.query) : "";
  const note = typeof parsed.note === "string" ? sanitize(parsed.note) : "";
  if (!query) {
    throw new Error("Gemini가 빈 검색식을 반환했습니다.");
  }
  return { query, note };
}
