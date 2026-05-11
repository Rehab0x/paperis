// AiProvider 인터페이스의 OpenAI 구현 — openai SDK + chat.completions.
//
// JSON 출력 패턴: response_format json_schema (OpenAI structured outputs, strict).
// 모델: gpt-5 시리즈가 출시되어 있을 수 있으나 안정성 위해 gpt-4.1 라인업 기본.
//
// xAI Grok도 OpenAI 호환 API라 같은 SDK + baseURL 변경으로 처리 — grok-provider.ts에서 재사용.

import OpenAI from "openai";
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

const DEFAULT_MODELS: Record<ModelTier, string> = {
  fast: "gpt-4.1-mini",
  balanced: "gpt-4.1",
  heavy: "gpt-4.1",
};

const MAX_RETRY_ATTEMPTS = 3;
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function extractStatusCode(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: number; statusCode?: number };
  return e.status ?? e.statusCode;
}

function isRetryable(err: unknown): boolean {
  const code = extractStatusCode(err);
  return code === 429 || code === 500 || code === 502 || code === 503;
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === MAX_RETRY_ATTEMPTS) throw err;
      await sleep(500 * Math.pow(2, attempt - 1));
    }
  }
  throw lastErr;
}

/**
 * AiJsonSchema → OpenAI structured outputs schema.
 * OpenAI strict mode는 additionalProperties: false 필수, required는 모든 property.
 */
function toOpenAiSchema(schema: AiJsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = [...schema.enum];
  if (schema.items) out.items = toOpenAiSchema(schema.items);
  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = toOpenAiSchema(v);
    }
    out.properties = props;
    out.additionalProperties = false;
    // OpenAI strict: required는 모든 property — 우리 schema의 required와 강제 일치
    out.required = Object.keys(schema.properties);
  }
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

interface OpenAiLikeProviderConfig {
  name: "openai" | "grok";
  defaultModels: Record<ModelTier, string>;
  apiKeyEnv: string;
  apiKeyMissingMessage: string;
  baseURL?: string;
}

function createOpenAiLikeProvider(
  config: OpenAiLikeProviderConfig,
  opts: AiProviderOptions = {}
): AiProvider {
  const apiKey = opts.apiKey ?? process.env[config.apiKeyEnv];
  if (!apiKey) {
    throw new AiProviderError(config.name, config.apiKeyMissingMessage);
  }
  const models: Record<ModelTier, string> = {
    ...config.defaultModels,
    ...(opts.models ?? {}),
  };
  const client = new OpenAI({
    apiKey,
    baseURL: config.baseURL,
  });

  return {
    name: config.name,
    models,

    async generateText(req: AiTextRequest): Promise<string> {
      const model = pickModel(models, req.tier, req.modelOverride);
      try {
        const res = await withRetry(() =>
          client.chat.completions.create({
            model,
            max_tokens: req.maxOutputTokens ?? 2048,
            temperature: req.temperature ?? 0.4,
            messages: [
              ...(req.systemInstruction
                ? [{ role: "system" as const, content: req.systemInstruction }]
                : []),
              { role: "user" as const, content: req.userPrompt },
            ],
          })
        );
        return (res.choices[0]?.message?.content ?? "").trim();
      } catch (err) {
        throw new AiProviderError(
          config.name,
          err instanceof Error ? err.message : `${config.name} text 생성 실패`,
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },

    async *generateStream(req: AiStreamRequest): AsyncIterable<string> {
      const model = pickModel(models, req.tier, req.modelOverride);
      try {
        const stream = await client.chat.completions.create({
          model,
          max_tokens: req.maxOutputTokens ?? 4096,
          temperature: req.temperature ?? 0.4,
          stream: true,
          messages: [
            ...(req.systemInstruction
              ? [{ role: "system" as const, content: req.systemInstruction }]
              : []),
            { role: "user" as const, content: req.userPrompt },
          ],
        });
        for await (const chunk of stream) {
          if (req.signal?.aborted) {
            throw new AiProviderError(config.name, "스트림 중단됨");
          }
          const delta = chunk.choices[0]?.delta?.content;
          if (delta) yield delta;
        }
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        throw new AiProviderError(
          config.name,
          err instanceof Error ? err.message : `${config.name} 스트림 실패`,
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },

    async generateJson<T = unknown>(req: AiJsonRequest): Promise<T> {
      const model = pickModel(models, req.tier, req.modelOverride);
      const schema = toOpenAiSchema(req.jsonSchema);
      try {
        const res = await withRetry(() =>
          client.chat.completions.create({
            model,
            max_tokens: req.maxOutputTokens ?? 4096,
            temperature: req.temperature ?? 0.3,
            messages: [
              ...(req.systemInstruction
                ? [{ role: "system" as const, content: req.systemInstruction }]
                : []),
              { role: "user" as const, content: req.userPrompt },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "structured_response",
                strict: true,
                schema,
              },
            },
          })
        );
        const text = res.choices[0]?.message?.content ?? "";
        if (!text) {
          throw new AiProviderError(
            config.name,
            `${config.name} JSON 응답이 비어 있습니다.`
          );
        }
        try {
          return JSON.parse(text) as T;
        } catch (parseErr) {
          throw new AiProviderError(
            config.name,
            `${config.name} JSON 파싱 실패: ${text.slice(0, 200)}`,
            { cause: parseErr }
          );
        }
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        throw new AiProviderError(
          config.name,
          err instanceof Error ? err.message : `${config.name} JSON 생성 실패`,
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },
  };
}

export function createOpenAiProvider(opts: AiProviderOptions = {}): AiProvider {
  return createOpenAiLikeProvider(
    {
      name: "openai",
      defaultModels: DEFAULT_MODELS,
      apiKeyEnv: "OPENAI_API_KEY",
      apiKeyMissingMessage:
        "OPENAI_API_KEY가 설정되지 않았습니다. 설정 → API 키 (BYOK)에서 입력해 주세요.",
    },
    opts
  );
}

export function createGrokProvider(opts: AiProviderOptions = {}): AiProvider {
  // xAI Grok 모델 라인업 (2026-05 기준).
  const grokModels: Record<ModelTier, string> = {
    fast: "grok-4-fast",
    balanced: "grok-4",
    heavy: "grok-4",
  };
  return createOpenAiLikeProvider(
    {
      name: "grok",
      defaultModels: grokModels,
      apiKeyEnv: "XAI_API_KEY",
      apiKeyMissingMessage:
        "XAI_API_KEY가 설정되지 않았습니다. 설정 → API 키 (BYOK)에서 입력해 주세요.",
      baseURL: "https://api.x.ai/v1",
    },
    opts
  );
}
