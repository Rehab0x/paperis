// AiProvider 인터페이스의 Gemini 구현 — @google/genai SDK 사용.
//
// 기존 lib/gemini.ts는 직접 ai.models.generateContent를 호출하는 함수들의 집합.
// 이 파일은 그 패턴을 AiProvider 인터페이스로 캡슐화. Phase A에선 routes는 여전히
// 기존 함수 사용 — 이 provider는 Phase B 이후 활용 시작.

import { GoogleGenAI } from "@google/genai";
import {
  AiProviderError,
  type AiJsonRequest,
  type AiJsonSchema,
  type AiProvider,
  type AiProviderOptions,
  type AiStreamRequest,
  type AiTextRequest,
  type ModelTier,
} from "./types";

// 기본 모델 라인업 — 작업 유형별 비용/품질 분리.
//   fast    = 헤드라인·제목 번역 등 가장 가벼운 1줄 작업 (가장 저렴)
//   balanced = 자연어 검색·미니 요약·narration script (속도+적당한 품질, 3.1 Lite가 가격 우위)
//   heavy   = 논문 긴 요약·트렌드 풀 분석 (품질 최우선)
//
// 2026-05-16 hotfix: heavy를 `gemini-3.0-flash`로 설정했으나 v1beta API에서
// "model not found" 에러 → 실제 model ID 미확인. 검증된 2.5-flash로 임시 복구.
// 정확한 3.x heavy ID 확인되면 다시 갱신.
const DEFAULT_MODELS: Record<ModelTier, string> = {
  fast: "gemini-2.5-flash-lite",
  balanced: "gemini-3.1-flash-lite",
  heavy: "gemini-2.5-flash",
};

const MAX_RETRY_ATTEMPTS = 3;
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ApiErrorShape {
  code?: number | string;
  status?: number | string;
  message?: string;
}

function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as ApiErrorShape;
  const code = typeof e.status === "number" ? e.status : e.code;
  if (typeof code === "number") return code;
  if (typeof code === "string") {
    const n = parseInt(code, 10);
    if (!isNaN(n)) return n;
  }
  return undefined;
}

function isRetryable(err: unknown): boolean {
  const code = extractStatusCode(err);
  if (code === 429 || code === 503 || code === 502 || code === 500) return true;
  return false;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRY_ATTEMPTS) throw err;
      const delay =
        500 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 250);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/**
 * AiJsonSchema (표준 JSON Schema 부분집합)를 Gemini SDK가 받는 형식으로 변환.
 * Gemini는 "type" 값으로 "OBJECT" / "STRING" / "ARRAY" / "NUMBER" / "BOOLEAN" /
 * "INTEGER" 대문자 enum을 받지만 SDK가 lowercase 문자열도 자동 변환해 줌.
 * 우리는 그대로 전달 (Gemini SDK가 알아서 처리).
 */
function toGeminiSchema(schema: AiJsonSchema): unknown {
  const out: Record<string, unknown> = {
    type: schema.type.toUpperCase(),
  };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = [...schema.enum];
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = toGeminiSchema(v);
    }
    out.properties = props;
  }
  if (schema.required) out.required = [...schema.required];
  if (schema.propertyOrdering) out.propertyOrdering = [...schema.propertyOrdering];
  return out;
}

function pickModel(
  models: Record<ModelTier, string>,
  tier: ModelTier | undefined,
  override: string | undefined
): string {
  if (override) return override;
  return models[tier ?? "balanced"];
}

export function createGeminiProvider(
  opts: AiProviderOptions = {}
): AiProvider {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new AiProviderError(
      "gemini",
      "GEMINI_API_KEY가 설정되지 않았습니다. 설정 또는 .env.local에 추가."
    );
  }
  const models: Record<ModelTier, string> = {
    ...DEFAULT_MODELS,
    ...(opts.models ?? {}),
  };
  const client = new GoogleGenAI({ apiKey });

  return {
    name: "gemini",
    models,

    async generateText(req: AiTextRequest): Promise<string> {
      const model = pickModel(models, req.tier, req.modelOverride);
      try {
        const res = await withRetry(() =>
          client.models.generateContent({
            model,
            contents: req.userPrompt,
            config: {
              systemInstruction: req.systemInstruction,
              temperature: req.temperature ?? 0.4,
              maxOutputTokens: req.maxOutputTokens,
            },
          })
        );
        return (res.text ?? "").trim();
      } catch (err) {
        throw new AiProviderError(
          "gemini",
          err instanceof Error ? err.message : "Gemini text 생성 실패",
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },

    async *generateStream(req: AiStreamRequest): AsyncIterable<string> {
      const model = pickModel(models, req.tier, req.modelOverride);
      let yielded = false;
      let lastErr: unknown;
      for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
        try {
          const response = await client.models.generateContentStream({
            model,
            contents: [{ role: "user", parts: [{ text: req.userPrompt }] }],
            config: {
              systemInstruction: req.systemInstruction,
              temperature: req.temperature ?? 0.4,
              maxOutputTokens: req.maxOutputTokens,
            },
          });
          for await (const chunk of response) {
            if (req.signal?.aborted) {
              throw new AiProviderError("gemini", "스트림 중단됨");
            }
            const text = chunk.text;
            if (text) {
              yielded = true;
              yield text;
            }
          }
          return;
        } catch (err) {
          lastErr = err;
          if (yielded || !isRetryable(err) || attempt === MAX_RETRY_ATTEMPTS) {
            throw new AiProviderError(
              "gemini",
              err instanceof Error ? err.message : "Gemini 스트림 실패",
              { httpStatus: extractStatusCode(err), cause: err }
            );
          }
          await sleep(500 * Math.pow(2, attempt - 1));
        }
      }
      throw new AiProviderError(
        "gemini",
        lastErr instanceof Error ? lastErr.message : "Gemini 스트림 실패"
      );
    },

    async generateJson<T = unknown>(req: AiJsonRequest): Promise<T> {
      const model = pickModel(models, req.tier, req.modelOverride);
      try {
        const res = await withRetry(() =>
          client.models.generateContent({
            model,
            contents: req.userPrompt,
            config: {
              systemInstruction: req.systemInstruction,
              temperature: req.temperature ?? 0.3,
              maxOutputTokens: req.maxOutputTokens,
              responseMimeType: "application/json",
              responseSchema: toGeminiSchema(req.jsonSchema) as never,
            },
          })
        );
        const text = (res.text ?? "").trim();
        if (!text) {
          throw new AiProviderError("gemini", "Gemini JSON 응답이 비어 있습니다.");
        }
        try {
          return JSON.parse(text) as T;
        } catch (parseErr) {
          throw new AiProviderError(
            "gemini",
            `Gemini JSON 파싱 실패: ${text.slice(0, 200)}`,
            { cause: parseErr }
          );
        }
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        throw new AiProviderError(
          "gemini",
          err instanceof Error ? err.message : "Gemini JSON 생성 실패",
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },
  };
}
