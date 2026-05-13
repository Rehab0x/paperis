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

// JSON parse 에러도 retryable로 — Gemini 응답에 raw control char가 포함된 invalid JSON이
// 가끔 오는데 (특히 검색식 변환 같은 짧은 응답), 다시 호출하면 거의 항상 정상 응답이 옴.
const JSON_PARSE_ERROR_PATTERN =
  /Bad control character|Unexpected token|Unexpected end of JSON|in JSON at position/i;

export function isRetryableApiError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED)\b|overloaded|high demand|temporarily|try again later/i.test(
      raw
    )
  ) {
    return true;
  }
  if (JSON_PARSE_ERROR_PATTERN.test(raw)) return true;
  return false;
}

export function friendlyErrorMessage(err: unknown, language: Language): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    /\b(503|429|UNAVAILABLE|RESOURCE_EXHAUSTED)\b|overloaded|high demand|temporarily|try again later/i.test(
      raw
    )
  ) {
    return language === "ko"
      ? "Gemini 서비스가 일시적으로 혼잡합니다. 잠시 후 다시 시도해 주세요."
      : "Gemini is temporarily busy. Please try again shortly.";
  }
  if (JSON_PARSE_ERROR_PATTERN.test(raw)) {
    return language === "ko"
      ? "Gemini 응답이 일시적으로 깨져서 받지 못했습니다. 다시 시도해 주세요."
      : "Gemini returned a malformed response. Please try again.";
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
  // 영어 출력 — 의학용어 보존 지침 불필요 (자명).
  if (lang === "en") {
    return [
      "You are a clinical research assistant for physicians. Output strictly in English.",
      "Produce a clinically focused summary of the given paper. Include: (1) study question & design, (2) population, (3) intervention/exposure with protocol details (dose, frequency, duration, device settings), (4) primary/secondary outcomes with concrete numbers and statistics (effect size, CI, p-values when reported), (5) clinical takeaways, (6) limitations and cautions.",
      "Be concise but do not omit numeric results. Use clear headings and bullet points.",
      hasFullText
        ? "The user has provided the full text of the paper, so use full study details directly. Do NOT add a disclaimer about being abstract-only."
        : "Only the abstract is provided. State at the top that the summary is based on the abstract only.",
    ].join(" ");
  }
  // 한국어 — 영어 의학용어 inline 보존 지침 포함.
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
  // 영어 출력 — 한국어 인사·청자 호명 회피 지침을 영어로 변환.
  if (lang === "en") {
    return [
      "You produce a 4–7 minute spoken digest of a biomedical paper for headphone listening. Output strictly in English.",
      "DO NOT begin with greetings, audience addresses, or self-introduction (no 'Hello', no 'Welcome', no 'Today we will look at...', no 'Dear colleagues'). Open by stating the paper's central question/topic in one sentence and dive directly into the substance.",
      "Tone: clinically experienced narrator speaking to a single anonymous listener — neutral, focused, paced for spoken playback. Avoid second-person addresses ('you', 'we', 'everyone').",
      "Write natural conversational prose suitable for TTS. No headings, no bullet points, no markdown.",
      "Briefly explain a jargon term the first time it matters (e.g. NIHSS, CIMT, MCID), assuming a clinician audience.",
      hasFullText
        ? "Use the full text the user gave you to ground numbers and details. Do NOT add a disclaimer about abstract-only."
        : "Only the abstract is available. State that briefly, in one short clause, then proceed.",
    ].join(" ");
  }
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
  input: SummarizeStreamInput,
  provider?: import("@/lib/ai/types").AiProvider
): AsyncGenerator<string, void, void> {
  const { paper, mode } = input;
  const language: Language = input.language ?? "ko";
  if (!paper.abstract) {
    yield language === "ko"
      ? "이 논문은 본문이 제공되지 않아 요약을 생성할 수 없습니다."
      : "No body text is available for this paper, so a summary cannot be generated.";
    return;
  }

  const { getAiProvider } = await import("@/lib/ai/registry");
  const p = provider ?? getAiProvider("gemini");
  const sourceLabel = input.sourceLabel?.trim() || undefined;
  const hasFullText = Boolean(sourceLabel);
  const systemInstruction =
    mode === "read"
      ? readSystemInstruction(language, hasFullText)
      : narrationSystemInstruction(language, hasFullText);
  const userPrompt = userPromptForSummary(paper, sourceLabel);

  try {
    for await (const chunk of p.generateStream({
      systemInstruction,
      userPrompt,
      temperature: mode === "read" ? 0.4 : 0.7,
      tier: "balanced",
    })) {
      if (chunk) yield chunk;
    }
  } catch (err) {
    throw new Error(friendlyErrorMessage(err, language));
  }
}

// 비-스트리밍 narration 텍스트 (TTS provider에 던질 스크립트 한 번에 생성).
// 내부적으로 streamSummary를 누적.
export async function generateNarrationText(
  paper: Paper,
  language: Language = "ko",
  sourceLabel?: string,
  provider?: import("@/lib/ai/types").AiProvider
): Promise<string> {
  const chunks: string[] = [];
  for await (const c of streamSummary(
    { paper, mode: "narration", language, sourceLabel },
    provider
  )) {
    chunks.push(c);
  }
  return chunks.join("").trim();
}

// ─────────────────────────────────────────────
// 논문 제목 한국어 번역 (TTS 트랙 라이브러리 표시용)
// ─────────────────────────────────────────────

/**
 * 영어 논문 제목을 한국어로 번역. 의학 용어(spasticity, RCT, FIM 등)는 원어 유지.
 * 1줄, 따옴표 없이 본문만. 실패 시 원본 그대로.
 *
 * provider 매개변수 — 미지정 시 default(Gemini Flash Lite). Phase D 이후 라우트가
 * getEffectiveAiProvider(req)로 BYOK 선택 provider 주입.
 */
export async function translateTitleToKorean(
  title: string,
  provider?: import("@/lib/ai/types").AiProvider
): Promise<string> {
  const trimmed = title.trim();
  if (!trimmed) return trimmed;
  // 이미 한국어 위주면 번역 안 함
  const hangul = trimmed.match(/[가-힣]/g)?.length ?? 0;
  if (hangul / trimmed.length > 0.3) return trimmed;

  const { getAiProvider } = await import("@/lib/ai/registry");
  const p = provider ?? getAiProvider("gemini");

  const systemInstruction = [
    "You translate biomedical paper titles from English to Korean for a Korean physician.",
    "Output ONE line — only the translated title. No quotes, no labels, no explanation.",
    "Preserve precise English medical/rehabilitation terms when natural (spasticity, FIM, NIHSS, CIMT, RCT, Botox). Translate the surrounding structure into clear, concise Korean.",
    "Keep it close to the original meaning — do not summarize or paraphrase.",
  ].join(" ");

  try {
    const out = await p.generateText({
      systemInstruction,
      userPrompt: trimmed,
      temperature: 0.2,
      maxOutputTokens: 200,
      tier: "fast",
    });
    return out.replace(/^["「"']|["」"']$/g, "") || trimmed;
  } catch {
    return trimmed;
  }
}
