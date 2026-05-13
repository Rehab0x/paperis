import Link from "next/link";
import { notFound } from "next/navigation";
import SpecialtyJournalsList from "@/components/SpecialtyJournalsList";
import { fmt, getMessages, getServerLocale } from "@/lib/i18n";
import { getSpecialty, type Specialty } from "@/lib/journals";
import {
  getJournalByIssn,
  searchJournalsBySubfield,
  type JournalSummary,
} from "@/lib/openalex";

// 임상과별 저널 추천 — 시드(카탈로그 화이트리스트) + 자동(OpenAlex subfield 비중).
// 시드는 항상 위, 자동 추천이 그 아래로. dedupe by openAlexId.
// over-fetch(20개) → client에서 차단 적용 후 상위 10개 (차단으로 자리가 줄어도 보충).
export const revalidate = 3600;

interface Props {
  params: Promise<{ id: string }>;
}

const TARGET_COUNT = 10;
const OVER_FETCH = 20;

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const [specialty, locale] = await Promise.all([
    getSpecialty(id),
    getServerLocale(),
  ]);
  const m = getMessages(locale).app;
  if (!specialty) return { title: m.journalSpecialty.metaFallback };
  const localName = locale === "en" ? specialty.nameEn : specialty.name;
  return {
    title: fmt(m.journalSpecialty.metaTitle, { name: localName }),
    description: fmt(m.journalSpecialty.metaDescription, {
      name: localName,
      nameEn: specialty.nameEn,
    }),
  };
}

/**
 * 시드 + 자동 추천을 합쳐 후보 N개 반환. 시드 우선, 자동 추천이 보충.
 *
 * 시드 fetch는 ISSN-L별 병렬 (OpenAlex API). 자동 추천은 Works group_by + Sources
 * batch fetch (over-fetch로 차단 보충 여유 확보).
 */
async function loadCandidateJournals(
  specialty: Specialty,
  totalNeeded: number
): Promise<JournalSummary[]> {
  const seedIssns = specialty.manualSeedJournals ?? [];
  const seedTasks = seedIssns.map((issn) => getJournalByIssn(issn));
  const [seedResults, autoResults] = await Promise.all([
    Promise.all(seedTasks),
    searchJournalsBySubfield(specialty.openAlexSubfieldId, {
      perPage: totalNeeded,
    }),
  ]);
  const seeds = seedResults.filter((j): j is JournalSummary => Boolean(j));

  const seenIds = new Set(seeds.map((j) => j.openAlexId));
  const merged: JournalSummary[] = [...seeds];
  for (const j of autoResults) {
    if (seenIds.has(j.openAlexId)) continue;
    merged.push(j);
    seenIds.add(j.openAlexId);
  }
  return merged.slice(0, totalNeeded);
}

export default async function SpecialtyJournalsPage({ params }: Props) {
  const { id } = await params;
  const [specialty, locale] = await Promise.all([
    getSpecialty(id),
    getServerLocale(),
  ]);
  if (!specialty) notFound();
  const m = getMessages(locale).app;

  const journals = await loadCandidateJournals(specialty, OVER_FETCH);
  const localName = locale === "en" ? specialty.nameEn : specialty.name;
  const secondaryName = locale === "en" ? specialty.name : specialty.nameEn;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32">
      <nav className="mb-3 text-xs text-paperis-text-3">
        <Link
          href="/journal"
          className="text-paperis-text-3 transition hover:text-paperis-text"
        >
          {m.journalSpecialty.back}
        </Link>
      </nav>

      <header className="mb-7">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-paperis-text">
          {localName}
        </h1>
        {locale === "en" ? null : (
          <p className="mt-0.5 text-sm text-paperis-text-3">{secondaryName}</p>
        )}
        <p className="mt-3 text-xs text-paperis-text-3">
          {fmt(m.journalSpecialty.intro, { n: TARGET_COUNT })}
        </p>
      </header>

      {journals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-paperis-border bg-paperis-surface p-8 text-center text-sm text-paperis-text-3">
          {m.journalSpecialty.fetchFailed}
          <p className="mt-2 text-xs text-paperis-text-3">
            subfield:{" "}
            <code className="font-mono">{specialty.openAlexSubfieldId}</code>
          </p>
        </div>
      ) : (
        <SpecialtyJournalsList
          journals={journals}
          specialtyId={specialty.id}
          targetCount={TARGET_COUNT}
        />
      )}
    </main>
  );
}
