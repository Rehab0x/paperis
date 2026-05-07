// 저널 최근 트렌드 분석 — 최근 N개월 abstract 모음을 Gemini에 보내
// "이 저널에서 요즘 다뤄지는 주제·새 흐름·논쟁"을 한 문단 + 5-7 bullet으로 요약.
//
// 마일스톤 5에서 Upstash Redis 캐시 (키: trend:{issn}:{yyyy-mm}) 추가 예정.

import { Type } from "@google/genai";
import { callWithRetry, getGeminiClient } from "@/lib/gemini";
import type { Language, Paper } from "@/types";

const MODEL = "gemini-2.5-flash";

export interface JournalTrend {
  /** 한 문장 — 이 시기에 저널이 강조한 핵심 흐름 */
  headline: string;
  /** 5-7개의 짧은 트렌드 항목 (각 80자 이내). 개별 논문이 아니라 *주제* 단위 */
  bullets: string[];
}

const trendSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    bullets: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["headline", "bullets"],
  propertyOrdering: ["headline", "bullets"],
};

function langLabel(lang: Language): string {
  return lang === "en" ? "English" : "Korean";
}

function trendSystemInstruction(
  language: Language,
  journalName: string,
  periodLabel: string
): string {
  return [
    `You are a clinical research analyst who reads recent issues of biomedical journals. Output strictly in ${langLabel(language)}.`,
    `Below are abstracts from ${journalName} for the period: ${periodLabel}.`,
    "Identify what topics this journal has been EMPHASIZING lately — recurring themes, emerging methodologies, controversies, populations of interest. NOT a list of individual papers.",
    "Return JSON: { headline (one sentence stating the dominant theme(s) of the period), bullets (5–7 short bullets, each <= 80 characters in the target language, capturing distinct trends) }.",
    "Be specific. Avoid generic statements like 'many studies on stroke'. Mention concrete subtopics, populations, methods, or outcomes.",
    "Preserve precise English medical/rehabilitation terms (spasticity, FIM, NIHSS, CIMT, FES, PRISMA, etc.) inside the target language.",
    "Do NOT invent themes that don't appear in the abstracts. Output JSON only.",
  ].join(" ");
}

function userPrompt(papers: Paper[]): string {
  // Gemini 한 호출에 들어갈 입력 길이 관리. 한 abstract당 최대 800자, 최대 80편.
  const blocks = papers.slice(0, 80).map((p, i) => {
    const abstract = (p.abstract || "").replace(/\s+/g, " ").trim().slice(0, 800);
    const types = p.publicationTypes.slice(0, 3).join(", ") || "";
    return [
      `#${i + 1}`,
      `pmid: ${p.pmid}`,
      `title: ${p.title || "(no title)"}`,
      types ? `types: ${types}` : "",
      `abstract: ${abstract || "(empty)"}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    "Analyze the following abstracts as a single corpus and extract the dominant themes/trends of this period. Return JSON with { headline, bullets }.",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

export async function generateJournalTrend(
  papers: Paper[],
  journalName: string,
  periodLabel: string,
  language: Language = "ko"
): Promise<JournalTrend> {
  if (papers.length === 0) {
    return { headline: "", bullets: [] };
  }
  const ai = getGeminiClient();
  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt(papers) }] }],
      config: {
        systemInstruction: trendSystemInstruction(
          language,
          journalName,
          periodLabel
        ),
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: trendSchema,
      },
    })
  );
  const text = response.text ?? "";
  let parsed: { headline?: unknown; bullets?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 트렌드 응답을 JSON으로 파싱하지 못했습니다.");
  }
  const headline =
    typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const bullets = Array.isArray(parsed.bullets)
    ? parsed.bullets
        .filter((b): b is string => typeof b === "string")
        .map((b) => b.trim())
        .filter(Boolean)
        .slice(0, 7)
    : [];
  return { headline, bullets };
}
