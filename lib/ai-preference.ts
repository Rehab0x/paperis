// 사용자가 선택한 AI provider — localStorage 기반. 클라가 fetch 시
// X-Paperis-Ai-Provider 헤더로 동봉 → 서버 라우트가 그 provider로 호출.
//
// 정책 (BYOK 게이트):
//   - 비-BYOK 사용자가 provider 선택해도 서버는 무시 (기본 gemini로 동작)
//   - BYOK 사용자만 실제 적용 (그 키가 있어야 호출 성공)
//
// Phase A에선 라우트가 아직 추상화 사용 X — preference만 저장. Phase D에서 라우트
// 일괄 마이그레이션 시 reading 시작.

import type { AiProviderName } from "@/lib/ai/types";

const STORAGE_KEY = "paperis.ai_provider";
const EVENT_NAME = "paperis:ai-provider-changed";
const HEADER_NAME = "x-paperis-ai-provider";

export const AI_PROVIDER_HEADER = HEADER_NAME;
export const AI_PROVIDER_DEFAULT: AiProviderName = "gemini";

const VALID: ReadonlyArray<AiProviderName> = ["gemini", "claude", "openai", "grok"];

function isValid(v: unknown): v is AiProviderName {
  return typeof v === "string" && (VALID as readonly string[]).includes(v);
}

export function getAiPreference(): AiProviderName {
  if (typeof window === "undefined") return AI_PROVIDER_DEFAULT;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (isValid(v)) return v;
  } catch {
    // private mode 등
  }
  return AI_PROVIDER_DEFAULT;
}

export function setAiPreference(name: AiProviderName): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, name);
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function subscribeAiPreference(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}

/**
 * 서버에서 요청 헤더로부터 사용자 선호 provider 읽기.
 * 헤더 없거나 invalid면 default (gemini).
 *
 * 정책: BYOK 게이트 — 비-BYOK 사용자 헤더는 무시(default).
 * 실제 게이트는 lib/ai/registry.ts의 getEffectiveProvider에서 처리.
 */
export function readAiPreference(req: Request): AiProviderName {
  const raw = req.headers.get(HEADER_NAME);
  if (isValid(raw)) return raw;
  return AI_PROVIDER_DEFAULT;
}
