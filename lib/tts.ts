import { GoogleGenAI } from "@google/genai";
import { callWithRetry, friendlyErrorMessage } from "@/lib/gemini";
import type { Language } from "@/types";

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

// Gemini TTS 프리빌트 음성 (2026.04 기준)
export type TtsVoice =
  | "Kore"
  | "Puck"
  | "Charon"
  | "Aoede"
  | "Fenrir"
  | "Leda"
  | "Orus"
  | "Zephyr";

export interface DialogueVoices {
  A: TtsVoice;
  B: TtsVoice;
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

// Gemini TTS 응답(24kHz 16-bit mono PCM little-endian)을 WAV로 감싸기
function wrapWav(pcm: Uint8Array): Uint8Array {
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const dataSize = pcm.length;
  const chunkSize = 36 + dataSize;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, chunkSize, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // Subchunk1Size (PCM)
  view.setUint16(20, 1, true); // AudioFormat = 1 (PCM)
  view.setUint16(22, CHANNELS, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeAscii(36, "data");
  view.setUint32(40, dataSize, true);

  const out = new Uint8Array(44 + dataSize);
  out.set(new Uint8Array(header), 0);
  out.set(pcm, 44);
  return out;
}

type InlineDataLike = { data?: string; mimeType?: string };
type PartLike = { inlineData?: InlineDataLike };
type GenerateContentLike = {
  candidates?: Array<{
    content?: { parts?: PartLike[] };
  }>;
};

function extractPcm(response: GenerateContentLike): Uint8Array {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part.inlineData?.data;
    if (typeof data === "string" && data.length > 0) {
      return Uint8Array.from(Buffer.from(data, "base64"));
    }
  }
  throw new Error("Gemini TTS 응답에 오디오 데이터가 없습니다.");
}

// [A]: / [B]: 형식을 Gemini 멀티스피커가 인식할 수 있게 A:/B:로 정규화
export function normalizeDialogueScript(script: string): string {
  return script
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*\[([AB])\]\s*[:：]\s*/, "$1: "))
    .join("\n")
    .trim();
}

// 스크립트가 대화체 스피커 태그를 포함하는지 확인
function hasDialogueTags(script: string): boolean {
  return /(^|\n)\s*(\[?A\]?|\[?B\]?)\s*[:：]/m.test(script);
}

// 단일 스피커(내레이션) 합성
export async function synthesizeNarration(
  text: string,
  voice: TtsVoice,
  language: Language
): Promise<Uint8Array> {
  if (!text.trim()) return new Uint8Array(0);
  const ai = getClient();
  const langHint =
    language === "ko"
      ? "자연스럽고 차분한 한국어로, 의학 강의에 어울리는 또렷한 말투로 읽어주세요. 영어 의학 용어는 원어 발음 그대로."
      : "Read in natural, calm English at a clear medical-lecture pace.";

  try {
    const response = (await callWithRetry(() =>
      ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ role: "user", parts: [{ text: `${langHint}\n\n${text}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
      })
    )) as GenerateContentLike;

    const pcm = extractPcm(response);
    return wrapWav(pcm);
  } catch (err) {
    throw new Error(friendlyErrorMessage(err, language));
  }
}

// 멀티 스피커(대화체) 합성 — 한 번의 호출로 A/B 모두 처리
export async function synthesizeDialogue(
  script: string,
  voices: DialogueVoices,
  language: Language
): Promise<Uint8Array> {
  const normalized = normalizeDialogueScript(script);
  if (!normalized) return new Uint8Array(0);
  if (!hasDialogueTags(normalized)) {
    // 태그가 없으면 나레이션으로 폴백
    return synthesizeNarration(normalized, voices.A, language);
  }

  const ai = getClient();
  const langHint =
    language === "ko"
      ? "두 명의 재활의학과 의사가 한국어로 논문을 토론하는 자연스러운 대화입니다. A는 설명하고 B는 질문합니다. 영어 의학 용어는 원어 발음 그대로."
      : "A natural English conversation between two physiatrists discussing a paper. A explains and B asks questions.";

  try {
    const response = (await callWithRetry(() =>
      ai.models.generateContent({
        model: TTS_MODEL,
        contents: [
          { role: "user", parts: [{ text: `${langHint}\n\n${normalized}` }] },
        ],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: "A",
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voices.A } },
                },
                {
                  speaker: "B",
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voices.B } },
                },
              ],
            },
          },
        },
      })
    )) as GenerateContentLike;

    const pcm = extractPcm(response);
    return wrapWav(pcm);
  } catch (err) {
    throw new Error(friendlyErrorMessage(err, language));
  }
}
