import Link from "next/link";
import { notFound } from "next/navigation";
import IssueExplorer from "@/components/IssueExplorer";
import JournalTabs, { type JournalTab } from "@/components/JournalTabs";
import TopicExplorer from "@/components/TopicExplorer";
import TrendDigest from "@/components/TrendDigest";
import { getJournalCatalog } from "@/lib/journals";
import { getJournalByIssn } from "@/lib/openalex";

// 저널 홈 — ISSN dynamic route. 탭은 ?tab=issue|topic|trend로 분기 (URL이 source of truth).
// default = issue.
export const revalidate = 3600;

interface Props {
  params: Promise<{ issn: string }>;
  searchParams: Promise<{ tab?: string }>;
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

/**
 * 카탈로그를 훑어서 이 저널과 매칭되는 임상과의 추천 주제를 합쳐 반환.
 * (일치 판정 로직은 단순 — 이름 매칭이 더 정밀해지면 OpenAlex의 subfield 매핑을
 * 카탈로그에 추가하는 방식으로 확장 가능)
 */
async function suggestedTopicsForJournal(): Promise<string[]> {
  // 현재 카탈로그의 모든 임상과 추천 주제를 합쳐서 dedupe.
  // 정확한 임상과↔저널 매핑은 마일스톤 4(저널 개인화)에서 user_journal_prefs로.
  try {
    const catalog = await getJournalCatalog();
    const set = new Set<string>();
    for (const s of catalog.specialties) {
      for (const t of s.suggestedTopics) set.add(t);
    }
    return Array.from(set).slice(0, 8);
  } catch {
    return [];
  }
}

export default async function JournalHomePage({
  params,
  searchParams,
}: Props) {
  const { issn: rawIssn } = await params;
  const { tab: tabRaw } = await searchParams;
  const issn = decodeURIComponent(rawIssn);
  if (!ISSN_RE.test(issn)) notFound();

  const journal = await getJournalByIssn(issn);
  if (!journal) notFound();

  const tab = parseTab(tabRaw);
  const queryIssn = journal.issnL ?? issn;
  const baseHref = `/journal/${encodeURIComponent(issn)}`;
  const suggestedTopics =
    tab === "topic" ? await suggestedTopicsForJournal() : [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32">
      <nav className="mb-3 text-xs text-zinc-500">
        <Link
          href="/journal"
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← 임상과 목록
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

      <JournalTabs current={tab} baseHref={baseHref} />

      {tab === "issue" ? (
        <IssueExplorer issn={queryIssn} journalName={journal.name} />
      ) : tab === "topic" ? (
        <TopicExplorer
          issn={queryIssn}
          journalName={journal.name}
          suggestedTopics={suggestedTopics}
        />
      ) : (
        <TrendDigest issn={queryIssn} journalName={journal.name} />
      )}
    </main>
  );
}
