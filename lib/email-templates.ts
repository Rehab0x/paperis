// 이메일 템플릿 — 단순 HTML 문자열. 별도 템플릿 엔진 없이 함수가 변수 보간.
//
// 톤: 짧고 명확. 발송 사유 1줄 + 주요 정보 + CTA 버튼 + 푸터.
// locale 분기 (ko/en). 사용자 record에 locale이 없으니 default ko.
//
// 색상은 paperis-accent(#c44b1e)와 흰 배경 — 라이트 모드 톤.

import type { Language } from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "https://paperis.vercel.app";

function wrap(title: string, body: string, locale: Language): string {
  const footer =
    locale === "en"
      ? `<p style="margin:24px 0 0;color:#8a857b;font-size:12px;line-height:1.6">
          You're receiving this because you signed up at Paperis. Manage your
          account at <a href="${BASE_URL}/account" style="color:#c44b1e">paperis.vercel.app/account</a>.
        </p>`
      : `<p style="margin:24px 0 0;color:#8a857b;font-size:12px;line-height:1.6">
          Paperis에 가입하셔서 이 메일을 받으셨습니다. 계정·구독은
          <a href="${BASE_URL}/account" style="color:#c44b1e">paperis.vercel.app/account</a>에서 관리할 수 있습니다.
        </p>`;
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fafaf7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Pretendard Variable',Pretendard,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;border:1px solid #e6e3da;border-radius:16px;margin-top:32px">
    <h1 style="margin:0 0 16px;font-family:'Fraunces',Georgia,serif;font-size:24px;font-weight:500;color:#1a1a1a;letter-spacing:-0.01em">
      Paperis<span style="color:#c44b1e">.</span>
    </h1>
    <h2 style="margin:0 0 16px;font-size:18px;font-weight:600;color:#1a1a1a">${title}</h2>
    ${body}
    ${footer}
  </div>
</body>
</html>`;
}

function btn(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin:16px 0;padding:10px 20px;background:#c44b1e;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px">${label}</a>`;
}

// ── Welcome ─────────────────────────────────────────────

export function welcomeTemplate(opts: {
  name?: string | null;
  locale?: Language;
}): { subject: string; html: string } {
  const locale = opts.locale ?? "ko";
  const name = opts.name ?? "";
  if (locale === "en") {
    return {
      subject: "Welcome to Paperis",
      html: wrap(
        `Welcome${name ? `, ${name}` : ""}`,
        `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
          Paperis curates PubMed papers by specialty and journal so you can keep up between cases.
          The 1st-priority workflow is commute listening — search → summary → TTS → library.
        </p>
        <p style="margin:0;color:#5a564e;font-size:14px;line-height:1.7">
          Pick a specialty to start:
        </p>
        ${btn(`${BASE_URL}/journal`, "Pick a specialty →")}
        <p style="margin:0;color:#8a857b;font-size:12px;line-height:1.6">
          Free tier — 10 summaries · 5 TTS · 3 trend analyses per month. Upgrade in Settings if you want more.
        </p>`,
        locale
      ),
    };
  }
  return {
    subject: "Paperis에 가입해주셔서 감사합니다",
    html: wrap(
      `${name ? `${name}님, ` : ""}환영합니다`,
      `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
        Paperis는 임상과·저널 단위로 PubMed 논문을 큐레이션해 출퇴근길이나 점심시간에 청취할 수 있는 서비스입니다.
        검색·미니 요약·풀텍스트·TTS·라이브러리가 한 흐름으로 묶여 있어요.
      </p>
      <p style="margin:0;color:#5a564e;font-size:14px;line-height:1.7">
        임상과를 골라 시작해보세요:
      </p>
      ${btn(`${BASE_URL}/journal`, "임상과 고르기 →")}
      <p style="margin:0;color:#8a857b;font-size:12px;line-height:1.6">
        Free — 요약 월 10회 · TTS 5회 · 트렌드 분석 3회 무료. 한도가 부족하면 Balanced(4,900/월) 또는 Pro(9,900/월)로 업그레이드 가능합니다.
      </p>`,
      locale
    ),
  };
}

// ── Quota threshold ─────────────────────────────────────

export function quotaThresholdTemplate(opts: {
  kind: "summary" | "tts" | "trend";
  remaining: number;
  limit: number;
  locale?: Language;
}): { subject: string; html: string } {
  const locale = opts.locale ?? "ko";
  const kindLabelKo = {
    summary: "요약",
    tts: "TTS",
    trend: "트렌드 분석",
  }[opts.kind];
  const kindLabelEn = {
    summary: "summaries",
    tts: "TTS",
    trend: "trend analyses",
  }[opts.kind];
  if (locale === "en") {
    return {
      subject: `Paperis — ${kindLabelEn} quota almost used (${opts.remaining}/${opts.limit} left)`,
      html: wrap(
        `${opts.remaining}/${opts.limit} ${kindLabelEn} left this month`,
        `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
          You're close to your free monthly quota. Upgrade to remove limits — Balanced (KRW 4,900/mo, TTS 50)
          or Pro (KRW 9,900/mo, TTS 150), or BYOK (KRW 19,900 lifetime).
        </p>
        ${btn(`${BASE_URL}/billing`, "Upgrade →")}
        <p style="margin:0;color:#8a857b;font-size:12px;line-height:1.6">
          The quota resets on the 1st of each month (KST midnight).
        </p>`,
        locale
      ),
    };
  }
  return {
    subject: `Paperis — 이번 달 ${kindLabelKo} 한도가 거의 소진됐어요 (${opts.remaining}/${opts.limit} 남음)`,
    html: wrap(
      `이번 달 ${kindLabelKo} ${opts.remaining}/${opts.limit} 남음`,
      `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
        무료 월 한도가 거의 소진됐습니다. 한도를 풀려면 Balanced(4,900원/월, TTS 50회) ·
        Pro(9,900원/월, TTS 150회) · BYOK(19,900원 평생) 중에서 선택할 수 있습니다.
      </p>
      ${btn(`${BASE_URL}/billing`, "업그레이드 →")}
      <p style="margin:0;color:#8a857b;font-size:12px;line-height:1.6">
        매월 1일 KST 자정에 자동 초기화됩니다.
      </p>`,
      locale
    ),
  };
}

// ── Payment success ─────────────────────────────────────

export function paymentSuccessTemplate(opts: {
  plan: "byok" | "balanced" | "pro";
  amount: number;
  expiresAt?: Date | null;
  locale?: Language;
}): { subject: string; html: string } {
  const locale = opts.locale ?? "ko";
  const planLabel = opts.plan.toUpperCase();
  const expires =
    opts.expiresAt && opts.plan !== "byok"
      ? opts.expiresAt.toLocaleDateString(
          locale === "en" ? "en-US" : "ko-KR",
          { year: "numeric", month: "long", day: "numeric" }
        )
      : null;
  if (locale === "en") {
    return {
      subject: `Paperis — ${planLabel} payment received`,
      html: wrap(
        `${planLabel} activated`,
        `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
          We've received your payment of KRW ${opts.amount.toLocaleString()} for ${planLabel}.
          ${expires ? `Next billing on <strong>${expires}</strong>.` : opts.plan === "byok" ? "BYOK is a lifetime license — no renewal." : ""}
        </p>
        ${btn(`${BASE_URL}/account`, "View account →")}`,
        locale
      ),
    };
  }
  return {
    subject: `Paperis — ${planLabel} 결제 완료`,
    html: wrap(
      `${planLabel} 활성화되었습니다`,
      `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
        ${opts.amount.toLocaleString()}원 ${planLabel} 결제가 완료되었습니다.
        ${expires ? `다음 결제일: <strong>${expires}</strong>.` : opts.plan === "byok" ? "BYOK는 평생 이용권이라 별도 갱신·해지 없이 사용 가능합니다." : ""}
      </p>
      ${btn(`${BASE_URL}/account`, "계정 보기 →")}`,
      locale
    ),
  };
}

// ── Payment failure / suspended ──────────────────────────

export function paymentFailureTemplate(opts: {
  plan: "balanced" | "pro";
  reason?: string;
  locale?: Language;
}): { subject: string; html: string } {
  const locale = opts.locale ?? "ko";
  if (locale === "en") {
    return {
      subject: `Paperis — ${opts.plan.toUpperCase()} payment failed`,
      html: wrap(
        "Payment failed",
        `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
          We couldn't charge your ${opts.plan} subscription this month.
          ${opts.reason ? `Reason: <em>${opts.reason}</em>.` : ""}
          The subscription is suspended — please update your card to continue.
        </p>
        ${btn(`${BASE_URL}/billing`, "Update card →")}`,
        locale
      ),
    };
  }
  return {
    subject: `Paperis — ${opts.plan.toUpperCase()} 자동결제 실패`,
    html: wrap(
      "결제 실패 — 카드 확인 필요",
      `<p style="margin:0 0 12px;color:#5a564e;font-size:14px;line-height:1.7">
        ${opts.plan} 구독의 이번 달 자동결제가 실패했습니다.
        ${opts.reason ? `사유: <em>${opts.reason}</em>.` : ""}
        구독이 일시 정지되었습니다 — 카드를 다시 등록하면 즉시 복구됩니다.
      </p>
      ${btn(`${BASE_URL}/billing`, "카드 다시 등록 →")}`,
      locale
    ),
  };
}
