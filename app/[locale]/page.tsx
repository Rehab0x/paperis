import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import LangToggle from "./LangToggle";
import { getMessages, isLocale, type Locale } from "@/lib/i18n";

// 랜딩 전용 footer는 제거 — 글로벌 Footer(components/Footer.tsx)가 root layout에서
// 모든 페이지에 자동 노출. 약관 링크/copyright 통합.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const m = getMessages(locale);
  const description = m.landing.hero.sub.replace(/\n/g, " ");
  return {
    title:
      locale === "ko"
        ? "Paperis — 읽을 시간이 없다면, 들으세요"
        : "Paperis — Too busy to read papers? Listen instead.",
    description,
    openGraph: {
      title:
        locale === "ko"
          ? "Paperis — 읽을 시간이 없다면, 들으세요"
          : "Paperis — Listen to PubMed papers on your commute",
      description,
      locale: locale === "ko" ? "ko_KR" : "en_US",
      type: "website",
    },
  };
}

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const m = getMessages(locale).landing;

  return (
    <div className="flex w-full flex-col bg-paperis-bg text-paperis-text">
      <Nav locale={locale} ctaLabel={m.nav.cta} toggleLabels={m.langToggle} />
      <Hero locale={locale} hero={m.hero} />
      <Stats items={m.stats.items} />
      <Divider />
      <How label={m.how.label} title={m.how.title} steps={m.how.steps} />
      <Divider />
      <Features
        label={m.features.label}
        title={m.features.title}
        items={m.features.items}
      />
      <Divider />
      <Pricing
        label={m.pricing.label}
        title={m.pricing.title}
        plans={m.pricing.plans}
      />
    </div>
  );
}

// ── NAV ─────────────────────────────────────────────────────
function Nav({
  locale,
  ctaLabel,
  toggleLabels,
}: {
  locale: Locale;
  ctaLabel: string;
  toggleLabels: { ko: string; en: string };
}) {
  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex items-center justify-between border-b border-paperis-border bg-paperis-bg/85 px-6 py-4 backdrop-blur-xl sm:px-8">
      <Link
        href={`/${locale}`}
        className="font-serif text-[22px] font-medium tracking-tight"
      >
        Paperis<span className="text-paperis-accent">.</span>
      </Link>
      <div className="flex items-center gap-2">
        <LangToggle currentLocale={locale} labels={toggleLabels} />
        <Link
          href="/app"
          className="rounded-lg bg-paperis-accent px-4 py-2 text-[13px] font-semibold text-white transition hover:opacity-85"
        >
          {ctaLabel}
        </Link>
      </div>
    </nav>
  );
}

// ── HERO ────────────────────────────────────────────────────
function Hero({
  locale,
  hero,
}: {
  locale: Locale;
  hero: {
    badge: string;
    titleLine1: string;
    titleEm: string;
    sub: string;
    ctaPrimary: string;
    ctaSecondary: string;
    note: string;
  };
}) {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pb-20 pt-32 text-center sm:px-8">
      {/* 배경 글로우 — accent 컬러 라디얼 그라데이션 */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 0%, color-mix(in srgb, var(--paperis-accent) 7%, transparent) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 20% 80%, color-mix(in srgb, var(--paperis-accent) 4%, transparent) 0%, transparent 60%)",
        }}
      />
      <div className="paperis-stagger relative z-10 flex flex-col items-center">
        <div className="mb-8 inline-flex items-center gap-1.5 rounded-full border border-paperis-accent/20 bg-paperis-accent-dim/60 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-paperis-accent">
          {hero.badge}
        </div>
        <h1 className="mx-auto mb-6 max-w-3xl font-serif text-[clamp(38px,6vw,72px)] font-medium leading-[1.1] tracking-[-0.03em]">
          {hero.titleLine1}
          <br />
          <em className="not-italic italic text-paperis-accent">
            {hero.titleEm}
          </em>
        </h1>
        <p className="mx-auto mb-12 max-w-[520px] text-[clamp(15px,2vw,18px)] leading-[1.7] text-paperis-text-2 whitespace-pre-line">
          {hero.sub}
        </p>
        <div className="mb-16 flex flex-wrap justify-center gap-3">
          <Link
            href="/app"
            className="rounded-xl bg-paperis-accent px-7 py-3.5 text-[15px] font-bold text-white transition hover:opacity-85"
          >
            {hero.ctaPrimary}
          </Link>
          <Link
            href="#how"
            className="rounded-xl border border-paperis-border bg-transparent px-7 py-3.5 text-[15px] font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
          >
            {hero.ctaSecondary}
          </Link>
        </div>
        <p className="text-xs text-paperis-text-3">{hero.note}</p>
      </div>
    </section>
  );
}

// ── STATS ───────────────────────────────────────────────────
function Stats({
  items,
}: {
  items: { num: string; label: string; source: string }[];
}) {
  return (
    <section className="mx-auto w-full max-w-[900px] px-6 pb-20 sm:px-8">
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-paperis-border bg-paperis-border sm:grid-cols-3">
        {items.map((it) => (
          <div
            key={it.num + it.label}
            className="bg-paperis-surface px-7 py-8 text-center"
          >
            <div className="mb-2.5 font-serif text-[44px] font-normal leading-none text-paperis-accent">
              {it.num}
            </div>
            <div className="text-[13px] leading-snug text-paperis-text-2">
              {it.label}
            </div>
            <div className="mt-1.5 text-[10px] italic text-paperis-text-3">
              {it.source}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── HOW ─────────────────────────────────────────────────────
function How({
  label,
  title,
  steps,
}: {
  label: string;
  title: string;
  steps: { icon: string; title: string; desc: string }[];
}) {
  return (
    <section
      id="how"
      className="mx-auto w-full max-w-[900px] scroll-mt-24 px-6 py-20 sm:px-8"
    >
      <SectionHeader label={label} title={title} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.title}
            className="rounded-2xl border border-paperis-border bg-paperis-surface p-7 transition hover:border-paperis-text-3"
          >
            <div className="mb-4 font-serif text-3xl font-normal leading-none text-paperis-text-3">
              {String(i + 1).padStart(2, "0")}
            </div>
            <div className="mb-3 text-3xl">{s.icon}</div>
            <h3 className="mb-2 text-base font-semibold leading-tight">
              {s.title}
            </h3>
            <p className="text-sm leading-relaxed text-paperis-text-2">
              {s.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── FEATURES ────────────────────────────────────────────────
function Features({
  label,
  title,
  items,
}: {
  label: string;
  title: string;
  items: { icon: string; title: string; desc: string }[];
}) {
  return (
    <section className="mx-auto w-full max-w-[900px] px-6 py-20 sm:px-8">
      <SectionHeader label={label} title={title} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {items.map((f) => (
          <div
            key={f.title}
            className="rounded-2xl border border-paperis-border bg-paperis-surface p-7"
          >
            <div className="mb-3.5 text-2xl">{f.icon}</div>
            <h3 className="mb-2 text-[15px] font-semibold">{f.title}</h3>
            <p className="text-sm leading-relaxed text-paperis-text-2">
              {f.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── PRICING ─────────────────────────────────────────────────
function Pricing({
  label,
  title,
  plans,
}: {
  label: string;
  title: string;
  plans: {
    badge: string;
    name: string;
    price: string;
    period: string;
    items: string[];
    cta: string;
    featured: boolean;
  }[];
}) {
  return (
    <section className="mx-auto w-full max-w-[900px] px-6 py-20 sm:px-8">
      <SectionHeader label={label} title={title} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={[
              "flex flex-col rounded-2xl border p-7",
              p.featured
                ? "border-paperis-accent/30 bg-gradient-to-br from-paperis-accent-dim/80 to-paperis-surface"
                : "border-paperis-border bg-paperis-surface",
            ].join(" ")}
          >
            <div className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.08em] text-paperis-accent">
              {p.badge}
            </div>
            <div className="mb-1.5 font-serif text-[22px] font-medium">
              {p.name}
            </div>
            <div className="mb-5">
              <span className="text-3xl font-bold tracking-[-0.02em] tabular-nums">
                {p.price}
              </span>
              <span className="text-[13px] text-paperis-text-3">
                {p.period}
              </span>
            </div>
            <ul className="mb-6 flex flex-1 flex-col gap-2.5">
              {p.items.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2 text-[13px] leading-snug text-paperis-text-2"
                >
                  <span className="mt-px shrink-0 font-bold text-paperis-accent">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              href="/app"
              className={[
                "w-full rounded-lg py-3 text-center text-sm font-semibold transition",
                p.featured
                  ? "bg-paperis-accent text-white hover:opacity-85"
                  : "border border-paperis-border text-paperis-text-2 hover:border-paperis-text-3 hover:text-paperis-text",
              ].join(" ")}
            >
              {p.cta}
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── SECTION HEADER (shared) ─────────────────────────────────
function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <>
      <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-[0.1em] text-paperis-text-3">
        {label}
      </p>
      <h2 className="mb-14 text-center font-serif text-[clamp(28px,4vw,42px)] font-medium leading-tight tracking-[-0.02em]">
        {title}
      </h2>
    </>
  );
}

// ── DIVIDER ─────────────────────────────────────────────────
function Divider() {
  return (
    <div className="mx-auto h-px max-w-[900px] bg-paperis-border" />
  );
}
