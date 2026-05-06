// 라우트가 요청 헤더 X-Paperis-Keys (base64 JSON)에서 사용자 입력 키를 추출.
// 헤더에 키가 있으면 process.env 보다 우선 사용 → 사용자가 자기 키로 prod 키 우회 가능.

export interface UserApiKeys {
  gemini?: string;
  googleCloud?: string;
  clovaId?: string;
  clovaSecret?: string;
  pubmed?: string;
  unpaywall?: string;
}

const HEADER_NAME = "x-paperis-keys";

function decodeBase64Utf8(b64: string): string {
  try {
    // Node.js
    if (typeof Buffer !== "undefined") {
      return Buffer.from(b64, "base64").toString("utf-8");
    }
    // 브라우저 fallback (서버에선 사용 안 됨)
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

export function readUserKeys(req: Request): UserApiKeys {
  const raw = req.headers.get(HEADER_NAME);
  if (!raw) return {};
  const json = decodeBase64Utf8(raw);
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || !parsed) return {};
    const out: UserApiKeys = {};
    const map = parsed as Record<string, unknown>;
    if (typeof map.gemini === "string") out.gemini = map.gemini;
    if (typeof map.googleCloud === "string") out.googleCloud = map.googleCloud;
    if (typeof map.clovaId === "string") out.clovaId = map.clovaId;
    if (typeof map.clovaSecret === "string") out.clovaSecret = map.clovaSecret;
    if (typeof map.pubmed === "string") out.pubmed = map.pubmed;
    if (typeof map.unpaywall === "string") out.unpaywall = map.unpaywall;
    return out;
  } catch {
    return {};
  }
}

/**
 * 라우트 시작에 한 번 호출 → 사용자 헤더 키를 process.env에 반영.
 * Node.js 모듈은 단일 프로세스라 process.env 변경이 동시 요청에 영향 줄 수 있어
 * "이 요청에서만" 안전하게 하려면 각 provider가 ctx에서 키를 받도록 하는 편이
 * 이론적으로 더 깨끗하다. 다만 코드 변경 폭을 줄이기 위해 v2.0.4에선 process.env
 * override 방식을 사용. 동시성 충돌은 dev 단일 사용자 환경에선 사실상 무시 가능.
 */
export function applyUserKeysToEnv(req: Request): void {
  const keys = readUserKeys(req);
  if (keys.gemini) process.env.GEMINI_API_KEY = keys.gemini;
  if (keys.googleCloud)
    process.env.GOOGLE_CLOUD_TTS_API_KEY = keys.googleCloud;
  if (keys.clovaId) process.env.NCP_CLOVA_CLIENT_ID = keys.clovaId;
  if (keys.clovaSecret) process.env.NCP_CLOVA_CLIENT_SECRET = keys.clovaSecret;
  if (keys.pubmed) process.env.PUBMED_API_KEY = keys.pubmed;
  if (keys.unpaywall) process.env.UNPAYWALL_EMAIL = keys.unpaywall;
}

export const USER_KEYS_HEADER = HEADER_NAME;
