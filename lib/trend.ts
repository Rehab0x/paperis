// 저널 트렌드 분석 — 한 시기(year + quarter)의 abstract corpus를 themes 단위로
// 심층 분석. docs/TREND_IMPROVEMENT.md 기준 v2.
//
// 변경 (v1 → v2):
//   - 결과: headline + bullets[80자] → headline + themes[direction/insight/PMIDs]
//     + methodologyShift + clinicalImplication + narrationScript
//   - 기간: rolling N개월 → 고정 year/quarter (의미 단위, 캐시 효율)
//   - 환각 PMID 필터: representativePmids에 abstract corpus 외의 PMID 들어오면 제거

import { Type } from "@google/genai";
import { callWithRetry, getGeminiClient } from "@/lib/gemini";
import type { Language, Paper } from "@/types";

const MODEL = "gemini-2.5-flash";

export type TrendDirection = "↑ 증가" | "🆕 신규" | "⚡ 논쟁" | "→ 지속";

export interface TrendTheme {
  topic: string;
  direction: TrendDirection;
  /** 임상적 의미 — WHY it matters (150자 이내, 주제명 재진술 X) */
  insight: string;
  /** corpus 안의 대표 PMID 1-2개. 환각 PMID는 호출자가 사후 필터 */
  representativePmids: string[];
}

export interface JournalTrend {
  /** 이 시기 전체를 관통하는 핵심 한 문장 */
  headline: string;
  /** 3-5개 주제 */
  themes: TrendTheme[];
  /** 연구 방법론 변화 (없으면 빈 문자열) */
  methodologyShift: string;
  /** 임상의에게 의미하는 바 (2-3문장) */
  clinicalImplication: string;
  /** TTS용 나레이션 스크립트 — 자연스러운 문장 흐름. 7-10분 또는 3-5분 */
  narrationScript: string;
}

const trendSchema = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING },
    themes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING },
          direction: {
            type: Type.STRING,
            enum: ["↑ 증가", "🆕 신규", "⚡ 논쟁", "→ 지속"],
          },
          insight: { type: Type.STRING },
          representativePmids: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["topic", "direction", "insight", "representativePmids"],
        propertyOrdering: [
          "topic",
          "direction",
          "insight",
          "representativePmids",
        ],
      },
    },
    methodologyShift: { type: Type.STRING },
    clinicalImplication: { type: Type.STRING },
    narrationScript: { type: Type.STRING },
  },
  required: [
    "headline",
    "themes",
    "methodologyShift",
    "clinicalImplication",
    "narrationScript",
  ],
  propertyOrdering: [
    "headline",
    "themes",
    "methodologyShift",
    "clinicalImplication",
    "narrationScript",
  ],
};

function langLabel(lang: Language): string {
  return lang === "en" ? "English" : "Korean";
}

function trendSystemInstruction(
  language: Language,
  journalName: string,
  periodLabel: string,
  paperCount: number
): string {
  const longNarration = paperCount > 60;
  return [
    `You are a senior clinical research analyst with deep expertise in rehabilitation medicine.`,
    `Output strictly in ${langLabel(language)}, preserving English medical terms inline (e.g. spasticity, FIM, NIHSS, CIMT, FES, PRISMA, RCT, MCID).`,
    `You will analyze ${paperCount} abstracts from "${journalName}" (${periodLabel}) as a single corpus.`,
    `Your task: identify what this journal has been EMPHASIZING during this period — NOT a list of individual papers, but THEMATIC TRENDS with clinical meaning.`,
    `For each theme, you MUST specify:`,
    `- direction: is this topic newly emerging (🆕 신규), increasing in volume (↑ 증가), actively debated with conflicting evidence (⚡ 논쟁), or consistently ongoing (→ 지속)?`,
    `- insight: WHY does this matter clinically? What should a busy physiatrist take away? Do NOT just restate the topic — state the implication.`,
    `- representativePmids: 1-2 PMIDs from the corpus that best exemplify this theme. Only use PMIDs that actually appear in the provided abstracts.`,
    `methodologyShift: Note if a new outcome measure, study design, or assessment tool is appearing repeatedly (e.g. "여러 연구에서 MCID 기반 반응자 분석 도입 증가"). Leave empty string if no notable shift.`,
    `clinicalImplication: 2-3 sentences on what a busy clinician should take away from this period's literature as a whole.`,
    `narrationScript: Write a natural spoken-word script (NOT bullet points) for TTS narration. Structure: brief intro → each theme explained conversationally → closing implication. Target length: ${longNarration ? "7–10분" : "3–5분"} when read aloud at normal pace. Tone: senior colleague briefing a busy clinician, not an academic lecture. Use Korean sentence flow naturally, embed English terms where standard.`,
    `RULES:`,
    `- 3 to 5 themes only.`,
    `- Be specific. Bad: "뇌졸중 재활 연구 증가". Good: "상지 CIMT 60시간 임계값 검증(↑ 증가) — 5편의 RCT가 반복 검증하며 Modified CIMT 프로토콜 재설계 근거 강화."`,
    `- Do NOT invent themes or PMIDs not in the abstracts.`,
    `- Output valid JSON only, no markdown fences.`,
  ].join(" ");
}

function userPrompt(papers: Paper[]): string {
  // 시간순(오래된 것부터 최신 순)으로 정렬해서 입력 — Gemini가 시기별 변화를 인지
  const sorted = [...papers].reverse();

  const blocks = sorted.slice(0, 80).map((p, i) => {
    const abstract = (p.abstract || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 800);
    const types = p.publicationTypes.slice(0, 3).join(", ") || "Unknown";
    const pubDate = p.pubDate || "";
    return [
      `[${i + 1}] pmid:${p.pmid}`,
      `date:${pubDate}`,
      `type:${types}`,
      `title:${p.title || "(no title)"}`,
      `abstract:${abstract || "(empty)"}`,
    ].join(" | ");
  });
  return [
    `Analyze these ${blocks.length} abstracts as a corpus. Identify dominant themes and trends.`,
    `Papers are ordered chronologically (oldest first) — note if topics shift over time.`,
    `Return JSON matching the schema exactly.`,
    "",
    blocks.join("\n"),
  ].join("\n");
}

/**
 * 트렌드 분석 — 환각 PMID 필터링 포함.
 * 반환된 themes의 representativePmids에서 corpus에 없는 PMID는 제거됨.
 */
export async function generateJournalTrend(
  papers: Paper[],
  journalName: string,
  periodLabel: string,
  language: Language = "ko"
): Promise<JournalTrend> {
  if (papers.length === 0) {
    return {
      headline: "",
      themes: [],
      methodologyShift: "",
      clinicalImplication: "",
      narrationScript: "",
    };
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
          periodLabel,
          Math.min(papers.length, 80)
        ),
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: trendSchema,
      },
    })
  );
  const text = response.text ?? "";
  let parsed: {
    headline?: unknown;
    themes?: Array<{
      topic?: unknown;
      direction?: unknown;
      insight?: unknown;
      representativePmids?: unknown;
    }>;
    methodologyShift?: unknown;
    clinicalImplication?: unknown;
    narrationScript?: unknown;
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 트렌드 응답을 JSON으로 파싱하지 못했습니다.");
  }

  const validPmids = new Set(papers.map((p) => p.pmid));
  const VALID_DIRECTIONS = new Set<TrendDirection>([
    "↑ 증가",
    "🆕 신규",
    "⚡ 논쟁",
    "→ 지속",
  ]);

  const themes: TrendTheme[] = [];
  for (const t of parsed.themes ?? []) {
    if (themes.length >= 5) break;
    const topic = typeof t.topic === "string" ? t.topic.trim() : "";
    const direction =
      typeof t.direction === "string" &&
      VALID_DIRECTIONS.has(t.direction as TrendDirection)
        ? (t.direction as TrendDirection)
        : "→ 지속";
    const insight = typeof t.insight === "string" ? t.insight.trim() : "";
    if (!topic || !insight) continue;
    const pmids = Array.isArray(t.representativePmids)
      ? t.representativePmids
          .filter(
            (p): p is string =>
              typeof p === "string" && validPmids.has(p.trim())
          )
          .map((p) => p.trim())
          .slice(0, 2)
      : [];
    themes.push({ topic, direction, insight, representativePmids: pmids });
  }

  const headline =
    typeof parsed.headline === "string" ? parsed.headline.trim() : "";
  const methodologyShift =
    typeof parsed.methodologyShift === "string"
      ? parsed.methodologyShift.trim()
      : "";
  const clinicalImplication =
    typeof parsed.clinicalImplication === "string"
      ? parsed.clinicalImplication.trim()
      : "";
  const narrationScript =
    typeof parsed.narrationScript === "string"
      ? parsed.narrationScript.trim()
      : "";

  return {
    headline,
    themes,
    methodologyShift,
    clinicalImplication,
    narrationScript,
  };
}
