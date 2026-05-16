// Toss Payments API wrapper.
//
// Toss는 두 종류 흐름:
//   1. 일반 결제 (1회) — BYOK 결제. 결제창 호출 → confirm
//   2. 빌링키 결제 (Pro 구독) — 카드 등록 → billingKey 발급 → 매월 자동결제
//
// 서버 측 호출은 Basic auth (secret_key + ":") base64. v3는 sandbox(test_sk_*)에서
// 동작 검증, M8에서 라이브 키 교체 + TOSS_LIVE_MODE=1.
//
// Idempotency-Key: orderId 기반. 같은 결제를 두 번 confirm해도 서버 중복 차감 안 함.

const TOSS_BASE = "https://api.tosspayments.com/v1";
const TIMEOUT_MS = 15000;

export class TossApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "TossApiError";
    this.code = code;
    this.status = status;
  }
}

function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new Error(
      "TOSS_SECRET_KEY가 설정되지 않았습니다. .env.local 또는 Vercel env 확인."
    );
  }
  return key;
}

function basicAuthHeader(): string {
  const secret = getSecretKey();
  // Toss API: Authorization: Basic base64("{secretKey}:")
  const token = Buffer.from(`${secret}:`).toString("base64");
  return `Basic ${token}`;
}

async function tossFetch<T>(
  path: string,
  init: RequestInit & { idempotencyKey?: string } = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", basicAuthHeader());
  headers.set("Content-Type", "application/json");
  if (init.idempotencyKey) {
    headers.set("Idempotency-Key", init.idempotencyKey);
  }
  const res = await fetch(`${TOSS_BASE}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // ignore — 비-JSON 응답
  }
  if (!res.ok) {
    const obj = data as { code?: string; message?: string } | null;
    throw new TossApiError(
      obj?.code ?? "TOSS_HTTP_ERROR",
      obj?.message ?? text.slice(0, 200) ?? `Toss API ${res.status}`,
      res.status
    );
  }
  return data as T;
}

// ── 일반 결제 (BYOK 1회) ──────────────────────────────────────────

export interface ConfirmPaymentInput {
  paymentKey: string;
  orderId: string;
  amount: number;
}

export interface PaymentSummary {
  paymentKey: string;
  orderId: string;
  status: string; // DONE / CANCELED / ABORTED 등
  totalAmount: number;
  approvedAt?: string;
  method?: string;
  card?: { number?: string; cardType?: string; ownerType?: string };
}

/**
 * 결제창에서 받은 paymentKey/orderId/amount로 결제 확정. 같은 orderId로 두 번
 * 호출해도 idempotency-key 덕에 중복 차감 없음.
 */
export async function confirmPayment(
  input: ConfirmPaymentInput
): Promise<PaymentSummary> {
  return tossFetch<PaymentSummary>("/payments/confirm", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey: input.orderId,
  });
}

// ── 빌링키 (Pro 구독) ──────────────────────────────────────────────

export interface IssueBillingKeyInput {
  authKey: string;       // 카드 등록 후 받은 토큰
  customerKey: string;   // 우리 쪽 사용자 식별자 (보통 user.id 또는 anon-id)
}

export interface BillingKeyResponse {
  mId: string;
  customerKey: string;
  authenticatedAt: string;
  method: string;
  billingKey: string;
  cardCompany?: string;
  cardNumber?: string;
}

/** 카드 등록 authKey → 영구 billingKey 발급. 사용자별 1개. */
export async function issueBillingKey(
  input: IssueBillingKeyInput
): Promise<BillingKeyResponse> {
  return tossFetch<BillingKeyResponse>("/billing/authorizations/issue", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface BillingChargeInput {
  billingKey: string;
  customerKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  customerEmail?: string;
  customerName?: string;
}

/** billingKey로 자동결제 (월별 cron이 호출). orderId로 idempotency. */
export async function chargeBilling(
  input: BillingChargeInput
): Promise<PaymentSummary> {
  const { billingKey, ...body } = input;
  return tossFetch<PaymentSummary>(`/billing/${billingKey}`, {
    method: "POST",
    body: JSON.stringify(body),
    idempotencyKey: input.orderId,
  });
}

// ── 헬퍼 ─────────────────────────────────────────────────────────

/**
 * orderId 생성 — `${prefix}-${userId}-${timestamp}-${random}`. Toss는 ASCII 64자
 * 안에서 어떤 형식이든 OK. 우리는 결제 종류·사용자·시간 식별을 위해 패턴 통일.
 */
export function newOrderId(
  prefix: "byok" | "pro" | "balanced",
  userId: string
): string {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .slice(0, 6);
  return `${prefix}-${userId.slice(0, 16)}-${ts}-${rand}`.slice(0, 64);
}

/** 라이브 모드 여부. M8에서 사업자등록 후 TOSS_LIVE_MODE=1 */
export function isLiveBilling(): boolean {
  return process.env.TOSS_LIVE_MODE === "1";
}

/**
 * 결제 가격 — service-cleanup Phase B (2026-05-16) 재구성.
 *   BYOK 1회: 9,900 → 19,900 (본인 키 + provider 자유 권한)
 *   Pro 월: 4,900 → 9,900 (TTS 150회/월)
 *   Balanced 월 (신설): 4,900 (TTS 50회/월)
 * 결제 라우트 + cron이 이 상수를 단일 source-of-truth로 참조.
 */
export const PRICING = {
  /** BYOK 1회 결제 — 평생 한도 우회 + 본인 키로 provider 자유 선택 */
  byokOnce: {
    amount: 19900,
    label: "BYOK 평생 — 19,900원 (1회)",
  },
  /** Balanced 월 구독 — 검색·요약 무제한 + TTS 50회/월 */
  balancedMonthly: {
    amount: 4900,
    label: "Balanced 월 구독 — 4,900원/월",
  },
  /** Pro 월 구독 — 검색·요약 무제한 + TTS 150회/월 */
  proMonthly: {
    amount: 9900,
    label: "Pro 월 구독 — 9,900원/월",
  },
} as const;
