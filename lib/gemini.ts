import { GoogleGenAI, Type } from "@google/genai";
import type { Language, ListenStyle, NeedFilter, Paper } from "@/types";

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_RETRY_ATTEMPTS = 3;

// Google 에러 본문에서 사람이 읽을 수 있는 메시지를 뽑아낸다.
// 실제 에러는 다음과 같이 두 겹으로 감싸져 있는 경우가 많음:
// {"error":{"message":"{\n  \"error\": { \"code\": 503, \"message\": \"...\" } }", ...}}
export function extractApiErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const outer = JSON.parse(raw);
    const innerRaw =
      typeof outer?.error?.message === "string" ? outer.error.message : "";
    if (innerRaw) {
      try {
        const inner = JSON.parse(innerRaw);
        const msg = inner?.error?.message;
        if (typeof msg === "string" && msg.trim()) return msg.trim();
      } catch {
        // inner가 일반 문자열일 수도 있음
      }
      return innerRaw;
    }
    if (typeof outer?.error?.status === "string") return outer.error.status;
  } catch {
    // JSON이 아니면 원문 그대로
  }
  const m = /"message"\s*:\s*"([^"\n]+?)"/.exec(raw);
  return m?.[1] ?? raw;
}

export function isRetryableApiError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  return /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED)\b|overloaded|high demand|temporarily|try again later/i.test(
    raw
  );
}

export function friendlyErrorMessage(err: unknown, language: Language): string {
  if (isRetryableApiError(err)) {
    return language === "ko"
      ? "Gemini 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요."
      : "Gemini is temporarily busy. Please try again shortly.";
  }
  return extractApiErrorMessage(err);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 재시도 가능한 에러에 대해 지수 백오프로 재호출. 비스트리밍 전용.
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = MAX_RETRY_ATTEMPTS
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableApiError(err) || attempt === maxAttempts) throw err;
      const delay = 500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export type SummaryMode = "read" | ListenStyle; // "read" | "narration" | "dialogue"

export interface SummarizeInput {
  paper: Paper;
  mode?: SummaryMode;
  language?: Language;
  /**
   * paper.abstract에 들어 있는 텍스트의 출처 라벨.
   * 미제공 시 "Abstract"로 간주(disclaimer 자동 부착).
   * 예) "PMC full text", "User-uploaded PDF"
   */
  sourceLabel?: string;
  /**
   * narration 모드에서 짧게(약 1-2분) 생성할지 여부.
   * 출퇴근용 플레이리스트에서 여러 편을 묶어 듣기 위해 사용.
   */
  brief?: boolean;
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY가 설정되지 않았습니다. .env.local에 키를 추가해 주세요."
    );
  }
  return new GoogleGenAI({ apiKey });
}

function languageLabel(lang: Language): string {
  return lang === "en" ? "English" : "Korean";
}

// 시스템 인스트럭션: 모드별
function systemInstructionFor(
  mode: SummaryMode,
  lang: Language,
  hasFullText: boolean,
  brief = false
): string {
  const langLabel = languageLabel(lang);
  const baseGlossary =
    "Preserve English medical/rehabilitation terms exactly when they are more precise than a translation (e.g., spasticity, FIM, Barthel Index, CIMT, modified Ashworth scale, NIHSS, Fugl-Meyer). For other terms, prefer native language phrasing.";

  const sourceNote = hasFullText
    ? "The user has provided the full text of the paper, so use the full study details (methods, results tables, discussion) directly. Do NOT add a disclaimer about being abstract-only."
    : "Only the abstract is provided. State at the top that the summary is based on the abstract only.";

  switch (mode) {
    case "read":
      return [
        `You are a clinical research assistant for physiatrists (rehabilitation physicians). Output strictly in ${langLabel}.`,
        "Produce a clinically focused summary of the given paper. Include: (1) study question & design, (2) population, (3) intervention/exposure with protocol details (dose, frequency, duration, device settings when relevant), (4) primary/secondary outcomes with concrete numbers and statistics (effect size, CI, p-values when reported), (5) clinical takeaways for rehabilitation practice, (6) limitations and cautions.",
        "Be concise but do not omit numeric results. Use clear headings and bullet points.",
        baseGlossary,
        sourceNote,
      ].join(" ");
    case "narration":
      return [
        brief
          ? `You are a rehabilitation medicine attending giving a brief 1-2 minute spoken digest to residents during morning rounds. Output strictly in ${langLabel}.`
          : `You are a seasoned rehabilitation medicine professor giving a 5-10 minute spoken lecture to residents. Output strictly in ${langLabel}.`,
        brief
          ? "Cover only: (a) what the study asked and how, (b) the key numerical result, (c) the single most actionable clinical takeaway. Skip nuanced limitations unless critical. Aim for a tight, fast-paced commute-friendly digest."
          : "Write a natural, conversational lecture script suitable for TTS playback. Focus on what is clinically interesting and practically relevant.",
        "Do not use headings, bullet points, or markdown. Write flowing spoken prose only. Explain jargon in plain terms the first time it appears, but keep core terminology precise.",
        baseGlossary,
      ].join(" ");
    case "dialogue":
      return [
        `You are scripting a 5-10 minute conversation between two physiatrists discussing this paper for TTS playback. Output strictly in ${langLabel}.`,
        "Use the exact format: each turn starts with '[A]: ' or '[B]: ' on its own line. A explains and teaches; B asks probing clinical questions and occasionally pushes back.",
        "Keep turns short (1-4 sentences). Cover study design, key numerical results, practical implications, and at least one honest limitation.",
        "No markdown, no headings, no bullet points — dialogue lines only.",
        baseGlossary,
      ].join(" ");
  }
}

// 사용자 프롬프트: 논문 메타 + 본문(Abstract 또는 Full text)
function userPromptFor(paper: Paper, sourceLabel?: string): string {
  const authorsLine =
    paper.authors.length > 0
      ? paper.authors.slice(0, 6).join(", ") +
        (paper.authors.length > 6 ? " et al." : "")
      : "N/A";
  const pubTypes =
    paper.publicationTypes.length > 0 ? paper.publicationTypes.join(", ") : "N/A";
  const bodyHeader = sourceLabel ? `${sourceLabel}:` : "Abstract:";
  const accessLine = sourceLabel
    ? `Source: ${sourceLabel}`
    : `Access: ${paper.access === "open" ? "Open Access (PMC available)" : "Abstract only"}`;

  return [
    `Title: ${paper.title || "N/A"}`,
    `Authors: ${authorsLine}`,
    `Journal: ${paper.journal || "N/A"} (${paper.year || "N/A"})`,
    `Publication types: ${pubTypes}`,
    `PMID: ${paper.pmid}`,
    paper.doi ? `DOI: ${paper.doi}` : "",
    accessLine,
    "",
    bodyHeader,
    paper.abstract || "(text unavailable)",
  ]
    .filter(Boolean)
    .join("\n");
}

// 공개 API: 스트리밍 텍스트 제너레이터
export async function* streamSummary(
  input: SummarizeInput
): AsyncGenerator<string, void, void> {
  const { paper } = input;
  const mode: SummaryMode = input.mode ?? "read";
  const language: Language = input.language ?? "ko";

  if (!paper.abstract && paper.access !== "open") {
    // 실제로는 Abstract가 있어야 의미 있음
    yield language === "ko"
      ? "이 논문은 Abstract가 제공되지 않아 요약을 생성할 수 없습니다."
      : "No abstract is available for this paper, so a summary cannot be generated.";
    return;
  }

  const ai = getClient();
  const sourceLabel = input.sourceLabel?.trim() || undefined;
  const hasFullText = Boolean(sourceLabel);
  const systemInstruction = systemInstructionFor(
    mode,
    language,
    hasFullText,
    input.brief ?? false
  );
  const userPrompt = userPromptFor(paper, sourceLabel);

  // 503/UNAVAILABLE 같은 일시 오류는 첫 청크가 나오기 전까지만 재시도 가능.
  // 스트림 중간에 끊어지면 이미 부분 출력을 소비했을 수 있으므로 그대로 실패로 올린다.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    let yielded = false;
    try {
      const response = await ai.models.generateContentStream({
        model: DEFAULT_MODEL,
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction,
          temperature: mode === "read" ? 0.4 : 0.7,
        },
      });
      for await (const chunk of response) {
        const text = chunk.text;
        if (text) {
          yielded = true;
          yield text;
        }
      }
      return;
    } catch (err) {
      lastErr = err;
      if (yielded || !isRetryableApiError(err) || attempt === MAX_RETRY_ATTEMPTS) {
        throw new Error(friendlyErrorMessage(err, language));
      }
      const delay = 500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw new Error(friendlyErrorMessage(lastErr, language));
}

// --- AI 추천 이유 생성 ---
// 결정론적 스코어링이 골라준 top 3에 대해 "왜 추천하는지"만 한국어 한 문장으로 생성.
// 픽킹 자체는 lib/scoring.ts에서 하므로 환각 PMID 위험 없음.

const RECOMMEND_MODEL = DEFAULT_MODEL;

const reasonSchema = {
  type: Type.OBJECT,
  properties: {
    reasons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pmid: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ["pmid", "reason"],
        propertyOrdering: ["pmid", "reason"],
      },
    },
  },
  required: ["reasons"],
  propertyOrdering: ["reasons"],
};

export interface ExplainCandidate {
  paper: Paper;
  topFactor: "recency" | "citations" | "journal" | "niche";
  citedByCount?: number;
  publicationYear?: number | null;
  journalName?: string | null;
  journalCitedness?: number | null;
  scoreTotal: number;
}

const FACTOR_LABEL: Record<ExplainCandidate["topFactor"], string> = {
  recency: "recency (latest)",
  citations: "citations (high citation count)",
  journal: "journal impact",
  niche: "niche fit (publication type)",
};

function explainPrompt(candidates: ExplainCandidate[], filter: NeedFilter): string {
  const list = candidates
    .map((c, i) => {
      const abstract = c.paper.abstract.slice(0, 360).replace(/\s+/g, " ").trim();
      const types = c.paper.publicationTypes.slice(0, 3).join(", ") || "N/A";
      return [
        `#${i + 1} PMID: ${c.paper.pmid}`,
        `Title: ${c.paper.title || "N/A"}`,
        `Journal: ${c.journalName ?? c.paper.journal ?? "N/A"} (${c.publicationYear ?? c.paper.year ?? "N/A"})`,
        `Types: ${types}`,
        `Citations: ${c.citedByCount ?? 0}`,
        c.journalCitedness != null
          ? `Journal 2yr mean citedness: ${c.journalCitedness.toFixed(2)}`
          : null,
        `Top factor (decided by deterministic scoring): ${FACTOR_LABEL[c.topFactor]}`,
        `Abstract: ${abstract || "N/A"}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");

  return [
    "These 3 papers were already selected by a deterministic ranker for a rehabilitation physician.",
    `User's niche filter is "${filter}".`,
    "Write ONE Korean sentence per paper (<= 80 characters) explaining WHY this paper is worth reading next.",
    "Anchor the reason on the paper's strongest factor (top factor below) but keep it natural — do not literally say 'top factor: recency'.",
    "Do not invent numbers; only use the metadata I give you.",
    "Output JSON only, following the schema. The pmid in each item must exactly match the pmid in my list.",
    "",
    "Selected papers:",
    list,
  ].join("\n");
}

export async function explainRecommendations(
  candidates: ExplainCandidate[],
  filter: NeedFilter
): Promise<Map<string, string>> {
  if (candidates.length === 0) return new Map();

  const ai = getClient();
  const validPmids = new Set(candidates.map((c) => c.paper.pmid));

  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: RECOMMEND_MODEL,
      contents: [
        { role: "user", parts: [{ text: explainPrompt(candidates, filter) }] },
      ],
      config: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: reasonSchema,
      },
    })
  );

  const text = response.text ?? "";
  let parsed: { reasons?: Array<{ pmid?: unknown; reason?: unknown }> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 추천 이유 응답을 JSON으로 파싱하지 못했습니다.");
  }

  const out = new Map<string, string>();
  for (const item of parsed.reasons ?? []) {
    const pmid = typeof item.pmid === "string" ? item.pmid.trim() : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!pmid || !reason) continue;
    if (!validPmids.has(pmid)) continue;
    out.set(pmid, reason);
  }
  return out;
}

// --- 연관 주제 검색어 생성 ---

export interface RelatedQuery {
  query: string;
  note: string;
}

const relatedQuerySchema = {
  type: Type.OBJECT,
  properties: {
    query: { type: Type.STRING },
    note: { type: Type.STRING },
  },
  required: ["query", "note"],
  propertyOrdering: ["query", "note"],
};

function relatedQueryPrompt(paper: Paper, hint?: string): string {
  const abstract = paper.abstract.slice(0, 600).replace(/\s+/g, " ").trim();
  const hintLine = hint && hint.trim()
    ? `User's follow-up interest (Korean allowed): "${hint.trim()}"`
    : "No specific follow-up hint given — broaden to adjacent topics.";

  return [
    "You help a rehabilitation physician explore related research on PubMed.",
    "Given a seed paper and an optional follow-up interest, craft a single concise PubMed search string (5-15 tokens) that will find topically related but not duplicate papers.",
    "Use PubMed syntax where helpful (AND/OR, [Title/Abstract], [MeSH Terms]). Preserve precise medical terms. Avoid the seed paper's authors and avoid overly narrow filters that will return zero.",
    "If the hint is given, aim directly at that angle. If not, prefer adjacent interventions, comparable outcomes, or closely related populations.",
    'Return JSON only: { "query": "...", "note": "<Korean 1-sentence explanation of what angle you searched>" }.',
    "",
    `Seed paper:`,
    `Title: ${paper.title || "N/A"}`,
    `Journal: ${paper.journal || "N/A"} (${paper.year || "N/A"})`,
    `PMID: ${paper.pmid}`,
    `Abstract: ${abstract || "N/A"}`,
    "",
    hintLine,
  ].join("\n");
}

export async function generateRelatedQuery(
  paper: Paper,
  hint?: string
): Promise<RelatedQuery> {
  const ai = getClient();
  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: DEFAULT_MODEL,
      contents: [
        { role: "user", parts: [{ text: relatedQueryPrompt(paper, hint) }] },
      ],
      config: {
        temperature: 0.4,
        responseMimeType: "application/json",
        responseSchema: relatedQuerySchema,
      },
    })
  );

  const text = response.text ?? "";
  let parsed: { query?: unknown; note?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 연관 검색어 응답을 JSON으로 파싱하지 못했습니다.");
  }
  const query = typeof parsed.query === "string" ? parsed.query.trim() : "";
  const note = typeof parsed.note === "string" ? parsed.note.trim() : "";
  if (!query) throw new Error("검색어 생성 결과가 비어 있습니다.");
  return { query, note };
}
