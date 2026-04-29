// TTS 추상화 — provider 갈아끼우기 위한 인터페이스.
// 현재는 Gemini만, 추후 OpenAI/Naver 등을 같은 모양으로 추가.

import type { Language } from "@/types";

export interface TtsSynthesizeInput {
  text: string;
  language: Language;
  voice?: string;
}

export interface TtsSynthesizeResult {
  /** WAV 바이트 (24kHz 16-bit mono PCM을 RIFF 헤더로 감싼 형태) */
  audio: Uint8Array;
  format: "audio/wav";
  sampleRate: number;
  durationMs: number;
  providerName: string;
  voice: string;
}

export interface TtsProvider {
  readonly name: string;
  readonly defaultVoice: string;
  readonly availableVoices: readonly string[];
  synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult>;
}
