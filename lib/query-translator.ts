// 자연어 → PubMed 검색식 변환 (Gemini 2.0 Flash + responseSchema).
// 결정론적 변환 작업이라 작은 모델로 충분하고, 응답을 JSON으로 강제해 파싱 실패 위험을 낮춘다.
// 캐시는 lib/query-cache.ts에서 처리하고 이 모듈은 순수 변환만 책임진다.

import { Type } from "@google/genai";
import { callWithRetry, getGeminiClient } from "@/lib/gemini";

// gemini-2.0-flash는 신규 사용자 대상 retire됨. 같은 "작고 빠른 결정론적 변환" 자리에는
// gemini-2.5-flash-lite(GA)를 사용. 요약/TTS의 gemini-2.5-flash와는 의도적으로 분리.
const QUERY_TRANSLATOR_MODEL = "gemini-2.5-flash-lite";

const querySchema = {
  type: Type.OBJECT,
  properties: {
    query: { type: Type.STRING },
    note: { type: Type.STRING },
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
  nl: string
): Promise<TranslationResult> {
  const trimmed = nl.trim();
  if (!trimmed) {
    throw new Error("자연어 검색어가 비어 있습니다.");
  }

  const ai = getGeminiClient();
  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: QUERY_TRANSLATOR_MODEL,
      contents: [{ role: "user", parts: [{ text: trimmed }] }],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: querySchema,
      },
    })
  );

  const text = response.text ?? "";
  let parsed: { query?: unknown; note?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 검색식 응답을 JSON으로 파싱하지 못했습니다.");
  }

  // Gemini가 가끔 query에 raw 제어문자(\n, \r, \t 등)를 섞어 반환한다 — 그대로
  // PubMed esearch URL에 넣으면 NCBI가 HTML 에러 페이지를 돌려주고 res.json()이
  // "Bad control character ..."로 throw한다. 여기서 제거.
  const sanitize = (s: string) =>
    s.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
  const query = typeof parsed.query === "string" ? sanitize(parsed.query) : "";
  const note = typeof parsed.note === "string" ? sanitize(parsed.note) : "";
  if (!query) {
    throw new Error("Gemini가 빈 검색식을 반환했습니다.");
  }
  return { query, note };
}
