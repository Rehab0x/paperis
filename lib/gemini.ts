import { GoogleGenAI, Type } from "@google/genai";
import type {
  Language,
  ListenStyle,
  NeedFilter,
  Paper,
  Recommendation,
} from "@/types";

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
function systemInstructionFor(mode: SummaryMode, lang: Language): string {
  const langLabel = languageLabel(lang);
  const baseGlossary =
    "Preserve English medical/rehabilitation terms exactly when they are more precise than a translation (e.g., spasticity, FIM, Barthel Index, CIMT, modified Ashworth scale, NIHSS, Fugl-Meyer). For other terms, prefer native language phrasing.";

  switch (mode) {
    case "read":
      return [
        `You are a clinical research assistant for physiatrists (rehabilitation physicians). Output strictly in ${langLabel}.`,
        "Produce a clinically focused summary of the given paper. Include: (1) study question & design, (2) population, (3) intervention/exposure with protocol details (dose, frequency, duration, device settings when relevant), (4) primary/secondary outcomes with concrete numbers and statistics (effect size, CI, p-values when reported), (5) clinical takeaways for rehabilitation practice, (6) limitations and cautions.",
        "Be concise but do not omit numeric results. Use clear headings and bullet points.",
        baseGlossary,
        "If the abstract is the only source, note that the summary is based on the abstract only.",
      ].join(" ");
    case "narration":
      return [
        `You are a seasoned rehabilitation medicine professor giving a 5-10 minute spoken lecture to residents. Output strictly in ${langLabel}.`,
        "Write a natural, conversational lecture script suitable for TTS playback. Focus on what is clinically interesting and practically relevant.",
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

// 사용자 프롬프트: 논문 메타 + Abstract
function userPromptFor(paper: Paper): string {
  const authorsLine =
    paper.authors.length > 0
      ? paper.authors.slice(0, 6).join(", ") +
        (paper.authors.length > 6 ? " et al." : "")
      : "N/A";
  const pubTypes =
    paper.publicationTypes.length > 0 ? paper.publicationTypes.join(", ") : "N/A";

  return [
    `Title: ${paper.title || "N/A"}`,
    `Authors: ${authorsLine}`,
    `Journal: ${paper.journal || "N/A"} (${paper.year || "N/A"})`,
    `Publication types: ${pubTypes}`,
    `PMID: ${paper.pmid}`,
    paper.doi ? `DOI: ${paper.doi}` : "",
    `Access: ${paper.access === "open" ? "Open Access (PMC available)" : "Abstract only"}`,
    "",
    "Abstract:",
    paper.abstract || "(abstract unavailable)",
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
  const systemInstruction = systemInstructionFor(mode, language);
  const userPrompt = userPromptFor(paper);

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

// --- AI 추천 3편 ---

const RECOMMEND_MODEL = DEFAULT_MODEL;

function filterGuidance(filter: NeedFilter): string {
  switch (filter) {
    case "treatment":
      return "User's niche is TREATMENT: prioritize interventional studies (RCTs, clinical trials) with concrete protocols and reported effect sizes.";
    case "diagnosis":
      return "User's niche is DIAGNOSIS: prioritize validation, reliability, accuracy, or measurement-property studies of assessment tools.";
    case "trend":
      return "User's niche is TRENDS: prioritize systematic reviews, meta-analyses, and papers introducing novel therapeutic concepts or frontier technology.";
    case "balanced":
    default:
      return "User's niche is BALANCED: pick a diverse mix covering different facets (one interventional, one diagnostic/observational, one big-picture review if possible).";
  }
}

function recommendUserPrompt(papers: Paper[], filter: NeedFilter): string {
  const list = papers
    .map((p, i) => {
      const abstract = p.abstract.slice(0, 500).replace(/\s+/g, " ").trim();
      const authors =
        p.authors.slice(0, 3).join(", ") +
        (p.authors.length > 3 ? ` et al.` : "");
      const types = p.publicationTypes.slice(0, 3).join(", ") || "N/A";
      return [
        `#${i + 1} PMID: ${p.pmid}`,
        `Title: ${p.title || "N/A"}`,
        `Authors: ${authors || "N/A"}`,
        `Journal: ${p.journal || "N/A"} (${p.year || "N/A"})`,
        `Types: ${types}`,
        `Access: ${p.access}`,
        `Abstract: ${abstract || "N/A"}`,
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return [
    `Select the 3 most valuable papers for a rehabilitation physician from the following ${papers.length} candidates.`,
    filterGuidance(filter),
    "Criteria: relevance to the niche, clinical applicability, recency, abstract quality (concrete numbers, clear methodology), and publication type weight.",
    "Rank from 1 (best) to 3. Output JSON only, following the provided schema. Each pmid must exactly match one from the list. Each reason must be a single sentence in Korean (<= 80 characters).",
    "",
    "Candidate papers:",
    list,
  ].join("\n");
}

const recommendSchema = {
  type: Type.OBJECT,
  properties: {
    recommendations: {
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
  required: ["recommendations"],
  propertyOrdering: ["recommendations"],
};

export async function recommendPapers(
  papers: Paper[],
  filter: NeedFilter = "balanced"
): Promise<Recommendation[]> {
  if (papers.length === 0) return [];
  if (papers.length <= 3) {
    // 후보가 3편 이하면 전원 추천으로 처리 (이유는 범용 문구)
    return papers.map((p) => ({
      pmid: p.pmid,
      reason: "후보가 3편 이하라 모두 추천합니다.",
    }));
  }

  const ai = getClient();
  const validPmids = new Set(papers.map((p) => p.pmid));

  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: RECOMMEND_MODEL,
      contents: [{ role: "user", parts: [{ text: recommendUserPrompt(papers, filter) }] }],
      config: {
        temperature: 0.3,
        responseMimeType: "application/json",
        responseSchema: recommendSchema,
      },
    })
  );

  const text = response.text ?? "";
  let parsed: { recommendations?: Array<{ pmid?: unknown; reason?: unknown }> };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Gemini 추천 응답을 JSON으로 파싱하지 못했습니다.");
  }

  const raw = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
  const seen = new Set<string>();
  const recs: Recommendation[] = [];
  for (const item of raw) {
    const pmid = typeof item.pmid === "string" ? item.pmid.trim() : "";
    const reason = typeof item.reason === "string" ? item.reason.trim() : "";
    if (!pmid || !reason) continue;
    if (!validPmids.has(pmid)) continue; // 환각 PMID 방지
    if (seen.has(pmid)) continue;
    seen.add(pmid);
    recs.push({ pmid, reason });
    if (recs.length >= 3) break;
  }
  return recs;
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
