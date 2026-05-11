// 멀티 AI provider 추상화 — Gemini / Claude / OpenAI / Grok 공통 인터페이스.
//
// 각 provider는 같은 시그니처로 텍스트·스트림·구조화 JSON을 반환.
// schema는 provider-agnostic JSON Schema를 받아 각 SDK의 표현으로 내부 변환.
//
// 라우트는 provider 선택만 받으면 같은 코드로 동작 — Phase D에서 라우트 일괄
// 마이그레이션. 지금(Phase A)은 추상화 레이어만 존재, 라우트는 아직 lib/gemini.ts
// 등 직접 호출 그대로.

export type AiProviderName = "gemini" | "claude" | "openai" | "grok";

/**
 * 라우트가 모델을 직접 지정하지 않고 등급으로 요청 → provider가 자기 라인업의
 * 적합한 모델 선택. fast = 짧고 빠름(번역/필터), balanced = 요약/검색식,
 * heavy = 트렌드 분석/긴 요약 등 추론 중심.
 */
export type ModelTier = "fast" | "balanced" | "heavy";

export interface AiTextRequest {
  /** System instruction / persona / 규칙 */
  systemInstruction?: string;
  /** 사용자 입력 (단일 turn) */
  userPrompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** 모델 등급 (provider가 자기 라인업에서 선택). 미지정 시 balanced */
  tier?: ModelTier;
  /** 모델 ID 직접 지정 (tier보다 우선). 디버깅/세밀 제어용 */
  modelOverride?: string;
}

export interface AiStreamRequest extends AiTextRequest {
  signal?: AbortSignal;
}

/**
 * 구조화 JSON 요청. schema는 표준 JSON Schema (subset).
 * 각 provider가 자기 SDK 형식으로 변환:
 *   - Gemini: responseSchema + responseMimeType
 *   - Claude: tool_use input_schema
 *   - OpenAI: response_format json_schema (strict)
 *   - Grok: OpenAI 호환
 *
 * 지원 키워드: type, properties, required, items, enum, description.
 * 다른 키워드(oneOf, allOf, $ref 등)는 일단 미지원 — 필요해지면 확장.
 */
export interface AiJsonRequest extends AiTextRequest {
  jsonSchema: AiJsonSchema;
}

export interface AiJsonSchema {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  description?: string;
  properties?: Record<string, AiJsonSchema>;
  required?: string[];
  items?: AiJsonSchema;
  enum?: ReadonlyArray<string | number>;
  /** Gemini 호환 — JSON 객체 키 순서 보장 (다른 provider에는 무시됨) */
  propertyOrdering?: string[];
}

/**
 * provider 통합 인터페이스. 라우트가 의존하는 유일한 추상.
 */
export interface AiProvider {
  readonly name: AiProviderName;
  /** 각 tier별 기본 모델 ID — provider 인스턴스 생성 시 결정 */
  readonly models: Record<ModelTier, string>;

  generateText(req: AiTextRequest): Promise<string>;
  /** AsyncIterable로 청크 스트리밍. 청크는 누적이 아닌 delta(추가분) */
  generateStream(req: AiStreamRequest): AsyncIterable<string>;
  generateJson<T = unknown>(req: AiJsonRequest): Promise<T>;
}

/**
 * provider 생성 옵션 (라우트가 호출 시 옵션 override 가능).
 * registry.getProvider(name, opts)에서 사용.
 */
export interface AiProviderOptions {
  /** API 키. 미지정 시 process.env (provider 구현체별 기본 env name 참조) */
  apiKey?: string;
  /** 각 tier별 모델 override */
  models?: Partial<Record<ModelTier, string>>;
}

/**
 * provider 호출 실패 시 던지는 에러 — 라우트가 friendlyMessage로 변환.
 */
export class AiProviderError extends Error {
  readonly providerName: AiProviderName;
  readonly httpStatus?: number;
  readonly originalError?: unknown;

  constructor(
    providerName: AiProviderName,
    message: string,
    options?: { httpStatus?: number; cause?: unknown }
  ) {
    super(message);
    this.name = "AiProviderError";
    this.providerName = providerName;
    this.httpStatus = options?.httpStatus;
    this.originalError = options?.cause;
  }
}
