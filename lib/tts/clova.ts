// Naver Clova Voice (Premium) provider.
// NCP(Naver Cloud Platform)의 tts-premium API.
// Gemini TTS 대비 한국어 자연스러움이 좋고 응답이 빠르고 안정적이지만,
// 한 번 호출당 텍스트 한도가 약 2000 bytes(utf-8)라 4–7분 narration은
// 문장 단위로 chunk 분할 → 순차 호출 → MP3 frame을 byte concat으로 합친다.
//
// MP3 raw frames은 self-describing이라 단순 byte 연결로 일반 audio element가
// 끊김 없이 재생한다 (ID3 tag가 안 붙는다는 전제 — Clova는 raw frame만 반환).

import type {
  TtsProvider,
  TtsSynthesizeInput,
  TtsSynthesizeResult,
} from "@/lib/tts/types";

const CLOVA_ENDPOINT =
  "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts";

// 한 번 호출당 안전 마진 둔 텍스트 한도. 공식은 2000 bytes 정도.
const CHUNK_MAX_BYTES = 1900;

// Clova Premium에서 자주 쓰이는 화자 일부를 노출 (전체 목록은 NCP 콘솔 참고).
// 의학 강의/낭독 톤에 맞는 차분한 한국어 화자를 default로.
const VOICES_KO = ["nara", "nminyoung", "nyoungil", "vdain", "ngoeun"] as const;
const VOICES_EN = ["clara", "matt", "danna"] as const;
const ALL_VOICES = [...VOICES_KO, ...VOICES_EN] as const;
type ClovaVoice = (typeof ALL_VOICES)[number];

function isClovaVoice(v: string): v is ClovaVoice {
  return (ALL_VOICES as readonly string[]).includes(v);
}

const utf8 = new TextEncoder();

function utf8ByteLen(s: string): number {
  return utf8.encode(s).length;
}

/**
 * 문장 단위로 자른 다음 utf-8 byte 한도 안에 들어갈 만큼 묶어 chunk 배열로 반환.
 * 한 문장이 한도보다 크면 한국어 음절(또는 영어 단어) 단위로 강제 분할.
 */
function splitForClova(text: string, maxBytes = CHUNK_MAX_BYTES): string[] {
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

interface ClovaCreds {
  clientId: string;
  clientSecret: string;
}

function getCreds(): ClovaCreds {
  const clientId = process.env.NCP_CLOVA_CLIENT_ID;
  const clientSecret = process.env.NCP_CLOVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "Clova TTS 키가 설정되지 않았습니다. .env.local에 NCP_CLOVA_CLIENT_ID, NCP_CLOVA_CLIENT_SECRET 를 추가해 주세요."
    );
  }
  return { clientId, clientSecret };
}

async function synthesizeChunk(
  text: string,
  voice: ClovaVoice,
  speed: number,
  creds: ClovaCreds
): Promise<Uint8Array> {
  const params = new URLSearchParams();
  params.set("speaker", voice);
  params.set("text", text);
  params.set("volume", "0");
  params.set("speed", String(speed));
  params.set("pitch", "0");
  params.set("format", "mp3");

  const res = await fetch(CLOVA_ENDPOINT, {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": creds.clientId,
      "X-NCP-APIGW-API-KEY": creds.clientSecret,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
    signal: AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Clova TTS 실패 (${res.status}): ${errText.slice(0, 240) || res.statusText}`
    );
  }
  return new Uint8Array(await res.arrayBuffer());
}

export class ClovaTtsProvider implements TtsProvider {
  readonly name = "clova";
  readonly defaultVoice: ClovaVoice = "nara";
  readonly availableVoices = ALL_VOICES;

  async synthesize(input: TtsSynthesizeInput): Promise<TtsSynthesizeResult> {
    const text = input.text.trim();
    if (!text) {
      throw new Error("합성할 텍스트가 비어 있습니다.");
    }
    const creds = getCreds();

    const voice: ClovaVoice =
      input.voice && isClovaVoice(input.voice)
        ? input.voice
        : input.language === "en"
          ? "clara"
          : "nara";

    const chunks = splitForClova(text);
    if (chunks.length === 0) {
      throw new Error("텍스트 분할 결과가 비어 있습니다.");
    }
    // -1(느림) → 2(Clova는 음수가 빠름이라 반전 매핑 — Clova 0 = 보통),
    // 0 → 0, 1 → -2 (한 단계 빠름). Clova range -5..5.
    const clovaSpeed =
      input.speakingRate === -1 ? 2 : input.speakingRate === 1 ? -2 : 0;

    const audioChunks: Uint8Array[] = [];
    for (const chunk of chunks) {
      const buf = await synthesizeChunk(chunk, voice, clovaSpeed, creds);
      audioChunks.push(buf);
    }
    const audio = concatMp3(audioChunks);

    // MP3 128kbps 가정으로 추정 (16 bytes/ms). audio element가 loadedmetadata
    // 시점에 정확한 길이를 알게 되니 이 값은 라이브러리 표시용 추정치.
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
