// Google Cloud Text-to-Speech provider.
// REST API + API key 인증으로 가장 단순 (service account 키 파일 불필요).
//
// Cloud TTS는 한 번 호출당 5000 byte 한도. Clova(2000)보다 훨씬 큼 — narration
// 4-7분(보통 1-3KB)은 한 번에 들어가지만, 안전 마진으로 4500 byte chunk로 분할.
// MP3로 받아 byte concat (Clova와 동일 패턴).
//
// 가격: 월 1M자 무료. 이후 Neural2/WaveNet $16/1M자, Standard $4/1M자.
// 사용자 환경의 GOOGLE_CLOUD_TTS_API_KEY 사용 (GEMINI_API_KEY와 별개).

import type {
  TtsProvider,
  TtsSynthesizeInput,
  TtsSynthesizeResult,
} from "@/lib/tts/types";

const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";
const CHUNK_MAX_BYTES = 4500;

// 한국어 Neural2/WaveNet 우선 (자연스러움 우수), 영어는 Neural2.
const VOICES_KO = [
  "ko-KR-Neural2-A", // 여성, 차분 (default)
  "ko-KR-Neural2-B", // 여성
  "ko-KR-Neural2-C", // 남성
  "ko-KR-Wavenet-A",
  "ko-KR-Wavenet-B",
  "ko-KR-Wavenet-C",
  "ko-KR-Wavenet-D",
] as const;
const VOICES_EN = [
  "en-US-Neural2-F", // 여성 (default)
  "en-US-Neural2-J", // 남성
  "en-US-Wavenet-F",
] as const;
const ALL_VOICES = [...VOICES_KO, ...VOICES_EN] as const;
type GoogleVoice = (typeof ALL_VOICES)[number];

function isGoogleVoice(v: string): v is GoogleVoice {
  return (ALL_VOICES as readonly string[]).includes(v);
}

const utf8 = new TextEncoder();
function utf8ByteLen(s: string): number {
  return utf8.encode(s).length;
}

function splitForGoogle(text: string, maxBytes = CHUNK_MAX_BYTES): string[] {
  const out: string[] = [];
  const sentences = text
    .split(/(?<=[.!?。?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let current = "";
  const push = () => {
    if (current.trim()) out.push(current.trim());
    current = "";
  };
  const forceSplit = (s: string): string[] => {
    const chunks: string[] = [];
    let buf = "";
    for (const ch of s) {
      if (utf8ByteLen(buf + ch) > maxBytes) {
        if (buf) chunks.push(buf);
        buf = ch;
      } else {
        buf += ch;
      }
    }
    if (buf) chunks.push(buf);
    return chunks;
  };

  for (const s of sentences) {
    if (utf8ByteLen(s) > maxBytes) {
      push();
      for (const c of forceSplit(s)) out.push(c);
      continue;
    }
    const candidate = current ? `${current} ${s}` : s;
    if (utf8ByteLen(candidate) > maxBytes) {
      push();
      current = s;
    } else {
      current = candidate;
    }
  }
  push();
  return out;
}

function concatMp3(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function synthesizeChunk(
  text: string,
  voice: GoogleVoice,
  languageCode: string,
  speakingRate: number,
  apiKey: string
): Promise<Uint8Array> {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode, name: voice },
      audioConfig: { audioEncoding: "MP3", speakingRate },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Google Cloud TTS 실패 (${res.status}): ${errText.slice(0, 240) || res.statusText}`
    );
  }
  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    throw new Error("Google Cloud TTS 응답에 audioContent가 없습니다.");
  }
  return new Uint8Array(Buffer.from(data.audioContent, "base64"));
}

export class GoogleCloudTtsProvider implements TtsProvider {
  readonly name = "google-cloud";
  readonly defaultVoice: GoogleVoice = "ko-KR-Neural2-A";
  readonly availableVoices = ALL_VOICES;

  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "Google Cloud TTS 키가 설정되지 않았습니다. .env.local에 GOOGLE_CLOUD_TTS_API_KEY 를 추가해 주세요."
      );
    }
    const text = input.text.trim();
    if (!text) {
      throw new Error("합성할 텍스트가 비어 있습니다.");
    }

    // voice가 language와 mismatch (예: 한국어 화자 voice인데 영어 텍스트)면
    // 그 language의 default voice로 강제 swap. 사용자가 ko 모드에서 ko 화자를
    // 골라 두었다가 en 모드로 옮겨와도 영어 voice로 자동 보정.
    const defaultForLang: GoogleVoice =
      input.language === "en" ? "en-US-Neural2-F" : "ko-KR-Neural2-A";
    const requested =
      input.voice && isGoogleVoice(input.voice) ? input.voice : null;
    const voiceMatchesLang =
      requested &&
      ((input.language === "en" && requested.startsWith("en-")) ||
        (input.language === "ko" && requested.startsWith("ko-")));
    const voice: GoogleVoice = voiceMatchesLang ? requested! : defaultForLang;
    const languageCode = voice.startsWith("ko-") ? "ko-KR" : "en-US";

    const chunks = splitForGoogle(text);
    if (chunks.length === 0) {
      throw new Error("텍스트 분할 결과가 비어 있습니다.");
    }
    // 사용자 단위 → Cloud TTS speakingRate (1.0 = 보통). 한 단계당 약 0.15.
    const speakingRate =
      input.speakingRate === -1 ? 0.85 : input.speakingRate === 1 ? 1.2 : 1.0;
    const audioChunks: Uint8Array[] = [];
    for (const chunk of chunks) {
      audioChunks.push(
        await synthesizeChunk(chunk, voice, languageCode, speakingRate, apiKey)
      );
    }
    const audio = concatMp3(audioChunks);
    // MP3 128kbps 가정 추정. audio element가 loadedmetadata에서 정확한 길이 계산.
    const durationMs = Math.round(audio.byteLength / 16);

    return {
      audio,
      format: "audio/mpeg",
      sampleRate: 24000,
      durationMs,
      providerName: this.name,
      voice,
    };
  }
}
