import Link from "next/link";
import { notFound } from "next/navigation";
import IssueExplorer from "@/components/IssueExplorer";
import JournalTabs, { type JournalTab } from "@/components/JournalTabs";
import TopicExplorer from "@/components/TopicExplorer";
import TrendDigest from "@/components/TrendDigest";
import { getJournalCatalog, getSpecialty } from "@/lib/journals";
import { getJournalByIssn } from "@/lib/openalex";

// 저널 홈 — ISSN dynamic route. 탭은 ?tab=issue|topic|trend로 분기 (URL이 source of truth).
// default = issue. ?from=specialtyId 쿼리로 referrer 임상과를 받아 주제 탭에서
// 해당 임상과의 추천 태그만 노출 (무관 태그 노이즈 제거).
export const revalidate = 3600;

interface Props {
  params: Promise<{ issn: string }>;
  searchParams: Promise<{
    tab?: string;
    from?: string;
    /** trend 탭에 들어올 때 라이브러리에서 점프한 거면 year/quarter 미리 채워줌 */
    year?: string;
    quarter?: string;
  }>;
}

function parseTrendInitial(searchParams: {
  year?: string;
  quarter?: string;
}): { year: number | null; quarter: "all" | "Q1" | "Q2" | "Q3" | "Q4" | null } {
  const yRaw = Number(searchParams.year);
  const year =
    Number.isInteger(yRaw) && yRaw >= 2000 && yRaw <= 2100 ? yRaw : null;
  const q = searchParams.quarter;
  const quarter =
    q === "all" || q === "Q1" || q === "Q2" || q === "Q3" || q === "Q4"
      ? q
      : null;
  return { year, quarter };
}

const ISSN_RE = /^\d{4}-\d{3}[\dXx]$/;

function parseTab(value: string | undefined): JournalTab {
  if (value === "topic" || value === "trend") return value;
  return "issue";
}

export async function generateMetadata({ params }: Props) {
  const { issn: rawIssn } = await params;
  const issn = decodeURIComponent(rawIssn);
  if (!ISSN_RE.test(issn)) return { title: "저널 — Paperis" };
  const journal = await getJournalByIssn(issn);
  if (!journal) return { title: "저널 — Paperis" };
  return {
    title: `${journal.name} — Paperis`,
    description: `${journal.name} 호 탐색·주제 탐색·최근 트렌드`,
  };
}


export default async function JournalHomePage({
  params,
  searchParams,
}: Props) {
  const { issn: rawIssn } = await params;
  const sp = await searchParams;
  const { tab: tabRaw, from: fromRaw } = sp;
  const trendInitial = parseTrendInitial(sp);
  const issn = decodeURIComponent(rawIssn);
  if (!ISSN_RE.test(issn)) notFound();

  const journal = await getJournalByIssn(issn);
  if (!journal) notFound();

  const tab = parseTab(tabRaw);
  const queryIssn = journal.issnL ?? issn;
  // baseHref는 탭 전환에 쓰이므로 from을 보존해야 한다. JournalTabs에서 이어붙임.
  const baseHref = `/journal/${encodeURIComponent(issn)}`;
  const fromSpecialtyId = typeof fromRaw === "string" ? fromRaw : undefined;
  // referrer 임상과 메타 — 뒤로 가기 + 주제 탭 추천에 동시 사용
  const fromSpecialty = fromSpecialtyId
    ? await getSpecialty(fromSpecialtyId)
    : null;
  const suggestedTopics =
    tab === "topic" && fromSpecialty
      ? fromSpecialty.suggestedTopics.slice(0, 8)
      : [];
  const specialtyName = fromSpecialty?.name ?? null;

  // 뒤로 가기 — referrer가 있으면 그 임상과 저널 목록, 없으면 임상과 그리드
  const backHref = fromSpecialty
    ? `/journal/specialty/${encodeURIComponent(fromSpecialty.id)}`
    : "/journal";
  const backLabel = fromSpecialty
    ? `← ${fromSpecialty.name} 저널 목록`
    : "← 임상과 목록";

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32">
      <nav className="mb-3 text-xs text-zinc-500">
        <Link
          href={backHref}
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          {backLabel}
        </Link>
      </nav>

      <header className="mb-7">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {journal.name}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
          {journal.publisher ? <span>{journal.publisher}</span> : null}
          {journal.issnL ? (
            <span className="font-mono">ISSN-L {journal.issnL}</span>
          ) : null}
          {typeof journal.twoYearMeanCitedness === "number" ? (
            <span>2yr 인용도 {journal.twoYearMeanCitedness.toFixed(2)}</span>
          ) : null}
          {journal.worksCount > 0 ? (
            <span>논문 {journal.worksCount.toLocaleString()}편</span>
          ) : null}
        </p>
      </header>

      <JournalTabs
        current={tab}
        baseHref={baseHref}
        fromSpecialtyId={fromSpecialtyId}
      />

      {tab === "issue" ? (
        <IssueExplorer issn={queryIssn} journalName={journal.name} />
      ) : tab === "topic" ? (
        <TopicExplorer
          issn={queryIssn}
          journalName={journal.name}
          suggestedTopics={suggestedTopics}
          specialtyName={specialtyName}
        />
      ) : (
        <TrendDigest
          issn={queryIssn}
          journalName={journal.name}
          initialYear={trendInitial.year}
          initialQuarter={trendInitial.quarter}
        />
      )}
    </main>
  );
}
