import Link from "next/link";
import { getServerLocale } from "@/lib/i18n";

// /help/api-keys — BYOK 사용자를 위한 API 키 발급 가이드.
// SettingsDrawer의 "📖 API 키 발급 가이드 보기" 링크 + 인라인 "Get key ↗" 링크
// 옆에서 진입. 서버 컴포넌트 — cookies() 통해 locale 분기.
//
// 모든 키는 사용자 본인 명의 계정에서 발급 받아야 하며 입력은 localStorage에
// 저장. BYOK 결제는 한도 해제용 "공식 unlock"이고 자기 키 입력 자체는 막지
// 않는 정책이라, 가이드는 BYOK 결제자만의 페이지로 한정하지 않음.

export const metadata = {
  title: "API 키 발급 가이드 — Paperis",
};

export default async function ApiKeysGuidePage() {
  const locale = await getServerLocale();
  return locale === "en" ? <GuideEn /> : <GuideKo />;
}

// ───────── 한국어 ─────────

function GuideKo() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <p className="text-xs text-paperis-text-3">
        <Link href="/app" className="hover:text-paperis-text">
          ← Paperis로 돌아가기
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-paperis-text">
        API 키 발급 가이드
      </h1>
      <p className="mt-2 text-sm text-paperis-text-2">
        Paperis는 사용자가 직접 발급한 API 키를 입력하면 무료 한도 없이 사용할
        수 있습니다. 본 가이드는 각 제공사에서 키를 발급 받는 단계별 절차를
        안내합니다.
      </p>

      <Notice locale="ko" />

      <Toc locale="ko" />

      <Section id="gemini" title="Google Gemini (AI · 권장)" stepsHref="https://aistudio.google.com/apikey">
        <p>
          Paperis의 기본 AI는 Gemini입니다. 검색식 변환·요약·트렌드 분석 모두
          Gemini로 동작하며, 가장 쉽게 발급할 수 있습니다.
        </p>
        <ol>
          <li>Google 계정으로 <ExtLink href="https://aistudio.google.com/apikey">Google AI Studio</ExtLink>에 접속합니다.</li>
          <li>우상단 <strong>Get API key</strong> → <strong>Create API key</strong> 클릭.</li>
          <li>발급된 키(<code>AIza...</code>로 시작)를 복사합니다.</li>
          <li>Paperis 설정 → API 키 → <code>GEMINI_API_KEY</code> 칸에 붙여넣기.</li>
        </ol>
        <p className="text-xs text-paperis-text-3">
          Gemini API의 무료 등급은 분당 요청 제한이 있습니다. 일반적인 Paperis
          사용량에서는 충분합니다.
        </p>
      </Section>

      <Section id="anthropic" title="Anthropic Claude (AI)" stepsHref="https://console.anthropic.com/settings/keys">
        <ol>
          <li><ExtLink href="https://console.anthropic.com/settings/keys">Anthropic Console → Keys</ExtLink> 접속.</li>
          <li>계정이 없다면 가입(이메일·전화번호 인증) 후 결제 수단 등록 ($5 크레딧 충전 필요).</li>
          <li><strong>Create Key</strong> → 이름 입력(예: paperis) → <strong>Generate</strong>.</li>
          <li>발급된 키(<code>sk-ant-...</code>)를 복사 후 <code>ANTHROPIC_API_KEY</code> 칸에 붙여넣기.</li>
        </ol>
        <p className="text-xs text-paperis-text-3">
          Claude는 한 번 발급된 키를 다시 볼 수 없으니 발급 직후 안전한 곳에
          보관하세요.
        </p>
      </Section>

      <Section id="openai" title="OpenAI (AI)" stepsHref="https://platform.openai.com/api-keys">
        <ol>
          <li><ExtLink href="https://platform.openai.com/api-keys">OpenAI Platform → API keys</ExtLink> 접속.</li>
          <li>결제 수단 등록 후 크레딧 충전.</li>
          <li><strong>+ Create new secret key</strong> → 권한·이름 설정 → <strong>Create</strong>.</li>
          <li>발급된 키(<code>sk-...</code>)를 복사 후 <code>OPENAI_API_KEY</code> 칸에 붙여넣기.</li>
        </ol>
      </Section>

      <Section id="grok" title="Grok (xAI · AI)" stepsHref="https://console.x.ai/">
        <ol>
          <li><ExtLink href="https://console.x.ai/">xAI Console</ExtLink>에 X(트위터) 또는 이메일로 가입.</li>
          <li>좌측 <strong>API Keys</strong> 메뉴에서 <strong>Create API key</strong>.</li>
          <li>발급된 키(<code>xai-...</code>)를 복사 후 <code>XAI_API_KEY</code> 칸에 붙여넣기.</li>
        </ol>
      </Section>

      <Section id="google-cloud" title="Google Cloud TTS (음성 합성)" stepsHref="https://console.cloud.google.com/apis/credentials">
        <p>
          영어 음성 청취 시 Paperis의 기본 TTS는 Google Cloud Neural2/WaveNet
          입니다. 한국어 청취는 별도 입력 없이 Clova가 기본입니다.
        </p>
        <ol>
          <li><ExtLink href="https://console.cloud.google.com/">Google Cloud Console</ExtLink>에 가입(신규 가입 시 $300 무료 크레딧).</li>
          <li>프로젝트 생성 → 좌측 메뉴 <strong>APIs & Services → Library</strong> → "Cloud Text-to-Speech API" 검색 → <strong>Enable</strong>.</li>
          <li><strong>APIs & Services → Credentials</strong> → <strong>+ Create Credentials → API key</strong>.</li>
          <li>발급된 키를 복사 후 <code>GOOGLE_CLOUD_TTS_API_KEY</code> 칸에 붙여넣기.</li>
          <li>(권장) 발급된 키의 <strong>API restrictions</strong>에서 Cloud Text-to-Speech API만 허용 — 키 유출 시 다른 서비스 비용 청구 방지.</li>
        </ol>
      </Section>

      <Section id="clova" title="네이버 클로바 보이스 (음성 합성)" stepsHref="https://www.ncloud.com/product/aiService/clovaVoice">
        <p>
          한국어 음성 청취의 기본 제공사. <strong>Client ID</strong>와 <strong>Client Secret</strong> 두 개의 값을 모두 입력해야 작동합니다.
        </p>
        <ol>
          <li><ExtLink href="https://www.ncloud.com/">네이버 클라우드 플랫폼</ExtLink> 가입 + 결제 수단 등록.</li>
          <li>콘솔 → <strong>Services → AI·Application Service → CLOVA Voice</strong>.</li>
          <li><strong>Application 등록</strong> → CLOVA Voice 선택 → 도메인 등 등록.</li>
          <li>발급된 <strong>Client ID</strong>를 <code>NCP_CLOVA_CLIENT_ID</code>에, <strong>Client Secret</strong>을 <code>NCP_CLOVA_CLIENT_SECRET</code>에 입력.</li>
        </ol>
        <p className="text-xs text-paperis-text-3">
          Clova Voice Premium은 글자수 기반 과금이며, Paperis는 1900자 청크로
          분할 호출합니다.
        </p>
      </Section>

      <Section id="pubmed" title="PubMed (논문 검색 · 선택)" stepsHref="https://www.ncbi.nlm.nih.gov/account/settings/">
        <p>
          PubMed 키 없이도 사용할 수 있으나 초당 3회 제한이 걸립니다. 트렌드
          분석 등 다량 요청 시 키 발급을 권장합니다.
        </p>
        <ol>
          <li><ExtLink href="https://www.ncbi.nlm.nih.gov/account/">NCBI(My NCBI) 계정</ExtLink>으로 로그인.</li>
          <li>우상단 사용자명 → <strong>Account settings</strong>.</li>
          <li>아래로 스크롤하여 <strong>API Key Management</strong> → <strong>Create an API Key</strong>.</li>
          <li>발급된 키를 <code>PUBMED_API_KEY</code> 칸에 붙여넣기.</li>
        </ol>
      </Section>

      <Section id="unpaywall" title="Unpaywall (오픈액세스 풀텍스트 · 선택)">
        <p>
          Unpaywall은 별도의 API 키 발급이 아니라 <strong>이메일 주소만</strong>{" "}
          요구합니다. 학술 검색 무료 풀텍스트 fallback에 사용됩니다.
        </p>
        <ol>
          <li>본인이 사용하는 이메일 주소를 그대로 <code>UNPAYWALL_EMAIL</code> 칸에 입력.</li>
          <li>가입 절차 없음 — 입력 즉시 활성화.</li>
        </ol>
      </Section>

      <hr className="my-10 border-paperis-border" />
      <FooterNav locale="ko" />
    </main>
  );
}

// ───────── English ─────────

function GuideEn() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 pb-32">
      <p className="text-xs text-paperis-text-3">
        <Link href="/app" className="hover:text-paperis-text">
          ← Back to Paperis
        </Link>
      </p>
      <h1 className="mt-3 font-serif text-3xl font-medium tracking-tight text-paperis-text">
        API key setup guide
      </h1>
      <p className="mt-2 text-sm text-paperis-text-2">
        Paperis lets you supply your own API keys to remove free-tier limits.
        This guide walks through how to obtain each key from its provider.
      </p>

      <Notice locale="en" />

      <Toc locale="en" />

      <Section id="gemini" title="Google Gemini (AI · recommended)" stepsHref="https://aistudio.google.com/apikey">
        <p>
          Gemini is the default AI in Paperis — used for query translation,
          summarization, and trend analysis. It is also the easiest key to
          obtain.
        </p>
        <ol>
          <li>Open <ExtLink href="https://aistudio.google.com/apikey">Google AI Studio</ExtLink> with any Google account.</li>
          <li>Click <strong>Get API key</strong> → <strong>Create API key</strong>.</li>
          <li>Copy the key (starts with <code>AIza...</code>).</li>
          <li>Paste it into Paperis Settings → API keys → <code>GEMINI_API_KEY</code>.</li>
        </ol>
        <p className="text-xs text-paperis-text-3">
          The Gemini free tier has per-minute request limits, which are
          comfortable for typical Paperis usage.
        </p>
      </Section>

      <Section id="anthropic" title="Anthropic Claude (AI)" stepsHref="https://console.anthropic.com/settings/keys">
        <ol>
          <li>Open <ExtLink href="https://console.anthropic.com/settings/keys">Anthropic Console → Keys</ExtLink>.</li>
          <li>Sign up if needed (email + phone verification) and add a payment method ($5 minimum credit).</li>
          <li>Click <strong>Create Key</strong>, name it (e.g. paperis), then <strong>Generate</strong>.</li>
          <li>Copy the key (<code>sk-ant-...</code>) into <code>ANTHROPIC_API_KEY</code>.</li>
        </ol>
        <p className="text-xs text-paperis-text-3">
          Claude keys can only be viewed once at creation — save it immediately
          in a secure place.
        </p>
      </Section>

      <Section id="openai" title="OpenAI (AI)" stepsHref="https://platform.openai.com/api-keys">
        <ol>
          <li>Open <ExtLink href="https://platform.openai.com/api-keys">OpenAI Platform → API keys</ExtLink>.</li>
          <li>Add a payment method and load some credit.</li>
          <li>Click <strong>+ Create new secret key</strong>, configure permissions and name, then <strong>Create</strong>.</li>
          <li>Copy the key (<code>sk-...</code>) into <code>OPENAI_API_KEY</code>.</li>
        </ol>
      </Section>

      <Section id="grok" title="Grok (xAI · AI)" stepsHref="https://console.x.ai/">
        <ol>
          <li>Sign up at the <ExtLink href="https://console.x.ai/">xAI Console</ExtLink> (X / Twitter login or email).</li>
          <li>Open <strong>API Keys</strong> from the sidebar and click <strong>Create API key</strong>.</li>
          <li>Copy the key (<code>xai-...</code>) into <code>XAI_API_KEY</code>.</li>
        </ol>
      </Section>

      <Section id="google-cloud" title="Google Cloud TTS (speech synthesis)" stepsHref="https://console.cloud.google.com/apis/credentials">
        <p>
          Google Cloud Neural2/WaveNet is the default TTS engine for English
          listening. Korean listening defaults to Clova and does not require
          this key.
        </p>
        <ol>
          <li>Sign up for <ExtLink href="https://console.cloud.google.com/">Google Cloud Console</ExtLink> ($300 free credit for new accounts).</li>
          <li>Create a project, open <strong>APIs & Services → Library</strong>, search "Cloud Text-to-Speech API" and click <strong>Enable</strong>.</li>
          <li>Open <strong>APIs & Services → Credentials</strong> and click <strong>+ Create Credentials → API key</strong>.</li>
          <li>Paste the key into <code>GOOGLE_CLOUD_TTS_API_KEY</code>.</li>
          <li>(Recommended) Restrict the key under <strong>API restrictions</strong> to Cloud Text-to-Speech only — protects you if the key ever leaks.</li>
        </ol>
      </Section>

      <Section id="clova" title="Naver CLOVA Voice (speech synthesis)" stepsHref="https://www.ncloud.com/product/aiService/clovaVoice">
        <p>
          Default provider for Korean speech. Requires both a{" "}
          <strong>Client ID</strong> and a <strong>Client Secret</strong>.
        </p>
        <ol>
          <li>Sign up for <ExtLink href="https://www.ncloud.com/">Naver Cloud Platform</ExtLink> and register a payment method.</li>
          <li>Open <strong>Services → AI·Application Service → CLOVA Voice</strong>.</li>
          <li>Register an <strong>Application</strong>, select CLOVA Voice, and add a domain.</li>
          <li>Paste the <strong>Client ID</strong> into <code>NCP_CLOVA_CLIENT_ID</code> and the <strong>Client Secret</strong> into <code>NCP_CLOVA_CLIENT_SECRET</code>.</li>
        </ol>
        <p className="text-xs text-paperis-text-3">
          CLOVA Voice Premium bills per character. Paperis splits long scripts
          into ~1900-character chunks automatically.
        </p>
      </Section>

      <Section id="pubmed" title="PubMed (article search · optional)" stepsHref="https://www.ncbi.nlm.nih.gov/account/settings/">
        <p>
          PubMed is usable without a key but limited to 3 requests/second.
          Adding a key is recommended for trend analysis or other heavy use.
        </p>
        <ol>
          <li>Sign in to your <ExtLink href="https://www.ncbi.nlm.nih.gov/account/">NCBI (My NCBI) account</ExtLink>.</li>
          <li>Click your username (top right) → <strong>Account settings</strong>.</li>
          <li>Scroll to <strong>API Key Management</strong> → <strong>Create an API Key</strong>.</li>
          <li>Paste the key into <code>PUBMED_API_KEY</code>.</li>
        </ol>
      </Section>

      <Section id="unpaywall" title="Unpaywall (open-access fulltext · optional)">
        <p>
          Unpaywall does not issue a key — it only needs an{" "}
          <strong>email address</strong>. Used as a free fulltext fallback.
        </p>
        <ol>
          <li>Enter any email you can receive at into <code>UNPAYWALL_EMAIL</code>.</li>
          <li>No signup — works immediately.</li>
        </ol>
      </Section>

      <hr className="my-10 border-paperis-border" />
      <FooterNav locale="en" />
    </main>
  );
}

// ───────── 공용 컴포넌트 ─────────

function Notice({ locale }: { locale: "ko" | "en" }) {
  if (locale === "en") {
    return (
      <div className="mt-6 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/30 px-4 py-3 text-xs text-paperis-text-2">
        <p>
          <strong>Security:</strong> Keys you enter are stored in your
          browser's localStorage and never sent to a Paperis-controlled
          database. Each request forwards them once over HTTPS, and the server
          uses them only for that request. Treat them like passwords — do not
          enter them on a shared computer.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-xl border border-paperis-accent/40 bg-paperis-accent-dim/30 px-4 py-3 text-xs text-paperis-text-2">
      <p>
        <strong>보안 안내:</strong> 입력한 키는 사용자 브라우저의 localStorage에
        보관되며 Paperis 서버 DB에 저장되지 않습니다. 매 요청마다 HTTPS로 한 번
        전달되어 그 요청 처리에만 사용됩니다. 비밀번호와 동일하게 다루시고
        공용 컴퓨터에서는 입력하지 마세요.
      </p>
    </div>
  );
}

function Toc({ locale }: { locale: "ko" | "en" }) {
  const items: { id: string; ko: string; en: string }[] = [
    { id: "gemini", ko: "Google Gemini (권장)", en: "Google Gemini (recommended)" },
    { id: "anthropic", ko: "Anthropic Claude", en: "Anthropic Claude" },
    { id: "openai", ko: "OpenAI", en: "OpenAI" },
    { id: "grok", ko: "Grok (xAI)", en: "Grok (xAI)" },
    { id: "google-cloud", ko: "Google Cloud TTS", en: "Google Cloud TTS" },
    { id: "clova", ko: "네이버 클로바 보이스", en: "Naver CLOVA Voice" },
    { id: "pubmed", ko: "PubMed (선택)", en: "PubMed (optional)" },
    { id: "unpaywall", ko: "Unpaywall (선택)", en: "Unpaywall (optional)" },
  ];
  return (
    <nav className="mt-6 rounded-xl border border-paperis-border bg-paperis-surface px-4 py-3">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-paperis-text-3">
        {locale === "en" ? "Contents" : "목차"}
      </h2>
      <ul className="grid grid-cols-1 gap-1 text-sm text-paperis-text-2 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.id}>
            <a href={`#${it.id}`} className="transition hover:text-paperis-accent">
              · {locale === "en" ? it.en : it.ko}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Section({
  id,
  title,
  stepsHref,
  children,
}: {
  id: string;
  title: string;
  stepsHref?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className="mt-10 scroll-mt-24 border-t border-paperis-border pt-8"
    >
      <h2 className="flex flex-wrap items-baseline gap-3 font-serif text-2xl font-medium tracking-tight text-paperis-text">
        {title}
        {stepsHref ? (
          <a
            href={stepsHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open provider page"
            className="text-xs text-paperis-accent underline-offset-2 hover:underline"
          >
            ↗
          </a>
        ) : null}
      </h2>
      <div className="prose prose-zinc dark:prose-invert mt-3 max-w-none text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function ExtLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-paperis-accent underline-offset-2 hover:underline"
    >
      {children}
    </a>
  );
}

function FooterNav({ locale }: { locale: "ko" | "en" }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-paperis-text-3">
      <Link href="/app" className="transition hover:text-paperis-text">
        {locale === "en" ? "← Back to Paperis" : "← Paperis로 돌아가기"}
      </Link>
      <span>
        {locale === "en"
          ? "Questions? Open Settings → API keys to enter your keys."
          : "키를 발급 받으셨다면 설정 → API 키에서 입력하세요."}
      </span>
    </div>
  );
}
