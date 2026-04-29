// 미니 요약 — 카드에 한눈에 보여줄 4-5개 bullet.
// 논문 타입(research / review)별로 강조점을 달리해 프롬프트가 분기된다.
// 한 번의 Gemini 호출로 여러 편을 batch 처리(JSON 모드 + responseSchema).

import { Type } from "@google/genai";
import { callWithRetry, getGeminiClient } from "@/lib/gemini";
import { classifyPaperType } from "@/lib/paper-type";
import type { Language, MiniSummary, Paper } from "@/types";

const MODEL = "gemini-2.5-flash";

const summarySchema = {
  type: Type.OBJECT,
  properties: {
    summaries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pmid: { type: Type.STRING },
          paperType: { type: Type.STRING }, // "research" | "review"
          bullets: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["pmid", "paperType", "bullets"],
        propertyOrdering: ["pmid", "paperType", "bullets"],
      },
    },
  },
  required: ["summaries"],
  propertyOrdering: ["summaries"],
};

function langLabel(lang: Language): string {
  return lang === "en" ? "English" : "Korean";
}

function systemInstruction(lang: Language): string {
  return [
    `You write tiny clinical mini-summaries of biomedical papers for a busy rehabilitation physician. Output strictly in ${langLabel(lang)}.`,
    "For each paper, return EXACTLY 5 short bullets, each <= 70 characters in the target language. No leading dashes — return only the bullet text.",
    "Bullet 1 is ALWAYS a one-line topic statement that tells the reader what this paper is about, before any numbers or methodology. Use the form below.",
    "  - research: '~한 ~인구에서 ~의 ~효과를 본 연구' style. Specify population + intervention/exposure + outcome focus. e.g. '아급성기 뇌졸중 환자에서 거울치료가 상지 기능에 주는 효과를 본 RCT'.",
    "  - review: '~에 대한 리뷰/메타분석' style. Specify scope. e.g. '뇌졸중 후 경직 관리에 보툴리눔 톡신 효과를 평가한 체계적 문헌고찰'.",
    "Bullets 2–5 then go deeper, branching by paperType:",
    "  - research: bullet 2 = study design + N. bullet 3 = intervention/exposure protocol with key parameters. bullet 4 = primary outcome with concrete numbers (effect size, p-value, CI when reported). bullet 5 = clinical takeaway or the most important caveat.",
    "  - review: bullet 2 = methods (databases, # of studies, PRISMA 여부 등). bullet 3 = headline conclusion. bullet 4 = quantitative findings or major themes. bullet 5 = clinical implication or notable disagreement/caveat.",
    "Preserve precise English medical terms (spasticity, FIM, NIHSS, CIMT, FES, PRISMA, etc.) inside the target language.",
    "Do NOT invent numbers that are not in the abstract. If the abstract is empty, return one bullet that says the abstract is missing.",
    "Each item's pmid MUST exactly match an input paper's pmid. paperType must be 'research' or 'review' (use the value provided unless the abstract clearly contradicts it).",
    "Output JSON only.",
  ].join(" ");
}

function userPrompt(papers: Paper[]): string {
  const blocks = papers.map((p, i) => {
    const types = p.publicationTypes.slice(0, 4).join(", ") || "N/A";
    const initial = classifyPaperType(p.publicationTypes);
    const abstract = p.abstract.replace(/\s+/g, " ").trim();
    return [
      `#${i + 1}`,
      `pmid: ${p.pmid}`,
      `title: ${p.title || "N/A"}`,
      `journal: ${p.journal || "N/A"} (${p.year || "N/A"})`,
      `publicationTypes: ${types}`,
      `paperType (suggested): ${initial}`,
      `abstract: ${abstract || "(empty)"}`,
    ].join("\n");
  });
  return [
    "Summarize each paper below. Return one JSON object as { summaries: [...] } where each entry corresponds to one paper.",
    "Order does not need to match input but pmid values must exactly match.",
    "",
    blocks.join("\n\n---\n\n"),
  ].join("\n");
}

export async function generateMiniSummaries(
  papers: Paper[],
  language: Language = "ko"
): Promise<MiniSummary[]> {
  if (papers.length === 0) return [];

  const ai = getGeminiClient();
  const validPmids = new Set(papers.map((p) => p.pmid));

  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [{ role: "user", parts: [{ text: userPrompt(papers) }] }],
      config: {
        systemInstruction: systemInstruction(language),
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: summarySchema,
      },
    })
  );

  const text = response.text ?? "";
  let parsed: {
    summaries?: Array<{
      pmid?: unknown;
      paperType?: unknown;
      bullets?: unknown;
    }>;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 미니 요약 응답을 JSON으로 파싱하지 못했습니다.");
  }

  const out: MiniSummary[] = [];
  for (const item of parsed.summaries ?? []) {
    const pmid = typeof item.pmid === "string" ? item.pmid.trim() : "";
    if (!pmid || !validPmids.has(pmid)) continue;
    const paperType: MiniSummary["paperType"] =
      item.paperType === "review" ? "review" : "research";
    const bullets = Array.isArray(item.bullets)
      ? item.bullets
          .filter((b): b is string => typeof b === "string")
          .map((b) => b.trim())
          .filter(Boolean)
          .slice(0, 5)
      : [];
    if (bullets.length === 0) continue;
    out.push({ pmid, paperType, bullets });
  }
  return out;
}
