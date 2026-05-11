// AiProvider 인터페이스의 Claude 구현 — @anthropic-ai/sdk 사용.
//
// JSON 출력 패턴: tool_use input_schema를 사용. response_format이 아닌
// tool calling으로 강제. Anthropic 공식 권장 패턴 (Claude 4.6+).
//
// 모델 라인업:
//   fast = haiku 4.5 (빠르고 저렴)
//   balanced = sonnet 4.6 (요약/검색식)
//   heavy = sonnet 4.6 또는 opus 4.7 — 트렌드 등 복잡한 추론

import Anthropic from "@anthropic-ai/sdk";
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
  fast: "claude-haiku-4-5-20251001",
  balanced: "claude-sonnet-4-6",
  heavy: "claude-sonnet-4-6",
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
  return code === 429 || code === 500 || code === 502 || code === 503 || code === 529;
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
 * AiJsonSchema → JSON Schema (Claude tool input_schema 형식).
 * Claude는 표준 JSON Schema를 받아 — 우리 schema가 거의 그대로 호환.
 * type만 lowercase로.
 */
function toClaudeSchema(schema: AiJsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: schema.type,
  };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = [...schema.enum];
  if (schema.items) out.items = toClaudeSchema(schema.items);
  if (schema.properties) {
    const props: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      props[k] = toClaudeSchema(v);
    }
    out.properties = props;
  }
  if (schema.required) out.required = [...schema.required];
  // propertyOrdering은 Claude에 무시
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

export function createClaudeProvider(
  opts: AiProviderOptions = {}
): AiProvider {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiProviderError(
      "claude",
      "ANTHROPIC_API_KEY가 설정되지 않았습니다. 설정 → API 키 (BYOK)에서 입력해 주세요."
    );
  }
  const models: Record<ModelTier, string> = {
    ...DEFAULT_MODELS,
    ...(opts.models ?? {}),
  };
  const client = new Anthropic({ apiKey });

  return {
    name: "claude",
    models,

    async generateText(req: AiTextRequest): Promise<string> {
      const model = pickModel(models, req.tier, req.modelOverride);
      try {
        const res = await withRetry(() =>
          client.messages.create({
            model,
            max_tokens: req.maxOutputTokens ?? 2048,
            temperature: req.temperature ?? 0.4,
            system: req.systemInstruction,
            messages: [{ role: "user", content: req.userPrompt }],
          })
        );
        const text = res.content
          .filter((c): c is Anthropic.TextBlock => c.type === "text")
          .map((c) => c.text)
          .join("")
          .trim();
        return text;
      } catch (err) {
        throw new AiProviderError(
          "claude",
          err instanceof Error ? err.message : "Claude text 생성 실패",
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },

    async *generateStream(req: AiStreamRequest): AsyncIterable<string> {
      const model = pickModel(models, req.tier, req.modelOverride);
      try {
        const stream = client.messages.stream({
          model,
          max_tokens: req.maxOutputTokens ?? 4096,
          temperature: req.temperature ?? 0.4,
          system: req.systemInstruction,
          messages: [{ role: "user", content: req.userPrompt }],
        });
        for await (const event of stream) {
          if (req.signal?.aborted) {
            throw new AiProviderError("claude", "스트림 중단됨");
          }
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            yield event.delta.text;
          }
        }
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        throw new AiProviderError(
          "claude",
          err instanceof Error ? err.message : "Claude 스트림 실패",
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },

    async generateJson<T = unknown>(req: AiJsonRequest): Promise<T> {
      const model = pickModel(models, req.tier, req.modelOverride);
      // Claude는 tool_use로 구조화 JSON을 강제. tool 정의에 schema를 input_schema로 전달.
      const toolName = "respond_with_structured_data";
      const inputSchema = toClaudeSchema(req.jsonSchema);
      try {
        const res = await withRetry(() =>
          client.messages.create({
            model,
            max_tokens: req.maxOutputTokens ?? 4096,
            temperature: req.temperature ?? 0.3,
            system: req.systemInstruction,
            messages: [{ role: "user", content: req.userPrompt }],
            tools: [
              {
                name: toolName,
                description:
                  "Return the answer as a structured object matching the schema.",
                input_schema: inputSchema as Anthropic.Tool.InputSchema,
              },
            ],
            tool_choice: { type: "tool", name: toolName },
          })
        );
        const toolUse = res.content.find(
          (c): c is Anthropic.ToolUseBlock => c.type === "tool_use"
        );
        if (!toolUse) {
          throw new AiProviderError(
            "claude",
            "Claude tool_use 블록을 찾을 수 없습니다."
          );
        }
        return toolUse.input as T;
      } catch (err) {
        if (err instanceof AiProviderError) throw err;
        throw new AiProviderError(
          "claude",
          err instanceof Error ? err.message : "Claude JSON 생성 실패",
          { httpStatus: extractStatusCode(err), cause: err }
        );
      }
    },
  };
}
