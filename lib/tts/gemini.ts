// Gemini TTS provider — narration only (v2는 dialogue 미사용).
// 응답은 24kHz/16-bit/mono PCM이라 RIFF 헤더로 감싸 audio/wav로 만든다.

import { callWithRetry, friendlyErrorMessage, getGeminiClient } from "@/lib/gemini";
import type { TtsProvider, TtsSynthesizeInput, TtsSynthesizeResult } from "@/lib/tts/types";

const TTS_MODEL = "gemini-2.5-flash-preview-tts";
const SAMPLE_RATE = 24000;
const BITS_PER_SAMPLE = 16;
const CHANNELS = 1;

const VOICES = [
  "Kore",
  "Puck",
  "Charon",
  "Aoede",
  "Fenrir",
  "Leda",
  "Orus",
  "Zephyr",
] as const;

type GeminiVoice = (typeof VOICES)[number];

function isGeminiVoice(value: string): value is GeminiVoice {
  return (VOICES as readonly string[]).includes(value);
}

// 24kHz 16-bit mono PCM little-endian → RIFF WAV.
// 모든 DataView write에 true(little-endian)를 넣어야 브라우저가 바로 재생 가능.
function wrapWav(pcm: Uint8Array): Uint8Array {
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const dataSize = pcm.length;
  const chunkSize = 36 + dataSize;

  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const writeAscii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++)
      view.setUint8(offset + i, s.charCodeAt(i));
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
  candidates?: Array<{ content?: { parts?: PartLike[] } }>;
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

export class GeminiTtsProvider implements TtsProvider {
  readonly name = "gemini";
  readonly defaultVoice: GeminiVoice = "Kore";
  readonly availableVoices = VOICES;

  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const text = input.text.trim();
    if (!text) {
      throw new Error("합성할 텍스트가 비어 있습니다.");
    }
    const voice: GeminiVoice =
      input.voice && isGeminiVoice(input.voice)
        ? input.voice
        : this.defaultVoice;

    const ai = getGeminiClient();
    const langHint =
      input.language === "ko"
        ? "자연스럽고 차분한 한국어로, 의학 강의에 어울리는 또렷한 말투로 읽어주세요. 영어 의학 용어는 원어 발음 그대로."
        : "Read in natural, calm English at a clear medical-lecture pace.";

    try {
      const response = (await callWithRetry(() =>
        ai.models.generateContent({
          model: TTS_MODEL,
          contents: [
            { role: "user", parts: [{ text: `${langHint}\n\n${text}` }] },
          ],
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
      const audio = wrapWav(pcm);
      const durationMs = Math.round(
        (pcm.length / (SAMPLE_RATE * (BITS_PER_SAMPLE / 8) * CHANNELS)) * 1000
      );
      return {
        audio,
        format: "audio/wav",
        sampleRate: SAMPLE_RATE,
        durationMs,
        providerName: this.name,
        voice,
      };
    } catch (err) {
      throw new Error(friendlyErrorMessage(err, input.language));
    }
  }
}
