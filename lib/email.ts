// 이메일 발송 — Resend API 직접 fetch.
//
// 환경변수: RESEND_API_KEY (없으면 silent noop)
//          EMAIL_FROM (없으면 onboarding@resend.dev — Resend의 free 발신 도메인)
//          EMAIL_REPLY_TO (선택)
//
// 모든 호출은 fire-and-forget 패턴: 실패해도 호출자 로직(결제/사용량 등)을 막지 않는다.
// 결제·한도 이벤트는 transactional — 마케팅 수신 동의 무관.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** 기본 발신자 override가 필요할 때 */
  from?: string;
  replyTo?: string;
  /** 마케팅성 이메일이면 true — 수신 동의 안 한 사용자에겐 발송 안 함 */
  marketing?: boolean;
}

export interface SendEmailResult {
  ok: boolean;
  skippedReason?:
    | "no-api-key"
    | "no-recipient"
    | "marketing-opt-out";
  id?: string;
  error?: string;
}

/**
 * Resend로 이메일 1통 발송. 실패해도 throw 안 함 — 호출자가 ok 확인하거나 무시.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, skippedReason: "no-api-key" };
  }
  if (!input.to || !input.to.includes("@")) {
    return { ok: false, skippedReason: "no-recipient" };
  }

  const from =
    input.from ?? process.env.EMAIL_FROM ?? "Paperis <onboarding@resend.dev>";
  const replyTo = input.replyTo ?? process.env.EMAIL_REPLY_TO;

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text ?? stripHtml(input.html),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[email] Resend error", res.status, text.slice(0, 200));
      return { ok: false, error: `Resend ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (err) {
    console.warn("[email] send failed", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/** 마케팅 이메일 — marketingAgreed=true인 경우만 발송. */
export async function sendMarketingEmail(
  input: SendEmailInput & { marketingAgreed: boolean }
): Promise<SendEmailResult> {
  if (!input.marketingAgreed) {
    return { ok: false, skippedReason: "marketing-opt-out" };
  }
  return sendEmail(input);
}

/** 본문 HTML을 plain text fallback으로 단순 변환 (Resend는 둘 다 받는 게 권장). */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
