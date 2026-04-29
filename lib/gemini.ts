// Gemini 공통 유틸리티: 클라이언트 생성, 에러 정규화, 재시도, 사용자용 메시지,
// 그리고 긴 요약 스트리밍 / TTS narration 텍스트 생성.

import { GoogleGenAI } from "@google/genai";
import type { Language, Paper } from "@/types";

export const MAX_RETRY_ATTEMPTS = 3;

// Google 에러 본문에서 사람이 읽을 수 있는 메시지를 뽑는다.
// 실제 에러는 다음과 같이 두 겹으로 감싸져 있는 경우가 많다:
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 재시도 가능한 에러에 한해 지수 백오프로 재호출. 비-스트리밍 전용.
// 백오프: 500ms·1000ms·2000ms + 0~250ms jitter.
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
      const delay =
        500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw lastErr;
}

let cachedClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY가 설정되지 않았습니다. .env.local에 키를 추가해 주세요."
    );
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

// ─────────────────────────────────────────────
// 긴 요약 (read) / TTS narration 텍스트 생성
// ─────────────────────────────────────────────

const SUMMARY_MODEL = "gemini-2.5-flash";

export type SummaryMode = "read" | "narration";

export interface SummarizeStreamInput {
  paper: Paper;
  mode: SummaryMode;
  language?: Language;
  /**
   * paper.abstract에 들어 있는 텍스트의 출처 라벨.
   * 미제공 시 abstract 기준으로 disclaimer 자동 부착.
   * 예) "PMC full text", "Europe PMC full text", "User-uploaded PDF"
   */
  sourceLabel?: string;
}

function languageLabel(lang: Language): string {
  return lang === "en" ? "English" : "Korean";
}

function readSystemInstruction(lang: Language, hasFullText: boolean): string {
  const L = languageLabel(lang);
  return [
    `You are a clinical research assistant for physiatrists (rehabilitation physicians). Output strictly in ${L}.`,
    "Produce a clinically focused summary of the given paper. Include: (1) study question & design, (2) population, (3) intervention/exposure with protocol details (dose, frequency, duration, device settings), (4) primary/secondary outcomes with concrete numbers and statistics (effect size, CI, p-values when reported), (5) clinical takeaways for rehabilitation practice, (6) limitations and cautions.",
    "Be concise but do not omit numeric results. Use clear headings and bullet points.",
    "Preserve precise English medical/rehabilitation terms (spasticity, FIM, Barthel, NIHSS, CIMT, FES, Fugl-Meyer) inside the target language.",
    hasFullText
      ? "The user has provided the full text of the paper, so use full study details directly. Do NOT add a disclaimer about being abstract-only."
      : "Only the abstract is provided. State at the top that the summary is based on the abstract only.",
  ].join(" ");
}

function narrationSystemInstruction(
  lang: Language,
  hasFullText: boolean
): string {
  const L = languageLabel(lang);
  return [
    `You produce a 4–7 minute spoken digest of a biomedical paper for headphone listening. Output strictly in ${L}.`,
    "DO NOT begin with greetings, audience addresses, or self-introduction (no '전공의 여러분', no '안녕하세요', no 'Welcome', no 'Today we will look at...'). Open by stating the paper's central question/topic in one sentence and dive directly into the substance.",
    "Tone: clinically experienced narrator speaking to a single anonymous listener — neutral, focused, paced for spoken playback. Avoid words like '여러분', 'we', 'you'.",
    "Write natural conversational prose suitable for TTS. No headings, no bullet points, no markdown.",
    "Preserve precise English medical terms (spasticity, FIM, NIHSS, CIMT, FES, Fugl-Meyer) inside the target language. Explain a jargon term briefly the first time it matters.",
    hasFullText
      ? "Use the full text the user gave you to ground numbers and details. Do NOT add a disclaimer about abstract-only."
      : "Only the abstract is available. State that briefly, in one short clause, then proceed.",
  ].join(" ");
}

function userPromptForSummary(paper: Paper, sourceLabel?: string): string {
  const authorsLine =
    paper.authors.length > 0
      ? paper.authors.slice(0, 6).join(", ") +
        (paper.authors.length > 6 ? " et al." : "")
      : "N/A";
  const pubTypes =
    paper.publicationTypes.length > 0
      ? paper.publicationTypes.join(", ")
      : "N/A";
  const bodyHeader = sourceLabel ? `${sourceLabel}:` : "Abstract:";
  const accessLine = sourceLabel
    ? `Source: ${sourceLabel}`
    : `Access: ${
        paper.access === "open" ? "Open Access (PMC)" : "Abstract only"
      }`;

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

export async function* streamSummary(
  input: SummarizeStreamInput
): AsyncGenerator<string, void, void> {
  const { paper, mode } = input;
  const language: Language = input.language ?? "ko";
  if (!paper.abstract) {
    yield language === "ko"
      ? "이 논문은 본문이 제공되지 않아 요약을 생성할 수 없습니다."
      : "No body text is available for this paper, so a summary cannot be generated.";
    return;
  }

  const ai = getGeminiClient();
  const sourceLabel = input.sourceLabel?.trim() || undefined;
  const hasFullText = Boolean(sourceLabel);
  const systemInstruction =
    mode === "read"
      ? readSystemInstruction(language, hasFullText)
      : narrationSystemInstruction(language, hasFullText);
  const userPrompt = userPromptForSummary(paper, sourceLabel);

  // 503/UNAVAILABLE 같은 일시 오류는 첫 청크가 나오기 전까지만 재시도 가능.
  // 스트림 중간에 끊어지면 부분 출력을 이미 소비했을 수 있어 그대로 실패로 올린다.
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    let yielded = false;
    try {
      const response = await ai.models.generateContentStream({
        model: SUMMARY_MODEL,
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
      const delay =
        500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw new Error(friendlyErrorMessage(lastErr, language));
}

// 비-스트리밍 narration 텍스트 (TTS provider에 던질 스크립트 한 번에 생성).
// 내부적으로 streamSummary를 누적.
export async function generateNarrationText(
  paper: Paper,
  language: Language = "ko",
  sourceLabel?: string
): Promise<string> {
  const chunks: string[] = [];
  for await (const c of streamSummary({
    paper,
    mode: "narration",
    language,
    sourceLabel,
  })) {
    chunks.push(c);
  }
  return chunks.join("").trim();
}
