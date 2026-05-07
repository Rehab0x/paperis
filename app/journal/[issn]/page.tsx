import Link from "next/link";
import { notFound } from "next/navigation";
import IssueExplorer from "@/components/IssueExplorer";
import { getJournalByIssn } from "@/lib/openalex";

// 저널 홈 — ISSN dynamic route. 첫 진입 시 IssueExplorer가 default month로 자동 fetch.
//
// 다음 PR(M3 PR3+)에서 탭 추가: 트렌드 / 호 탐색 / 주제 탐색.
// 지금은 호 탐색만 활성. 저널 홈 자체는 server component (저널 메타 fetch).
export const revalidate = 3600;

interface Props {
  params: Promise<{ issn: string }>;
}

const ISSN_RE = /^\d{4}-\d{3}[\dXx]$/;

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

export default async function JournalHomePage({ params }: Props) {
  const { issn: rawIssn } = await params;
  const issn = decodeURIComponent(rawIssn);
  if (!ISSN_RE.test(issn)) notFound();

  const journal = await getJournalByIssn(issn);
  if (!journal) notFound();

  // PubMed [ISSN] 쿼리는 보통 print/electronic 어느 쪽도 동작하지만, OpenAlex의
  // issn_l(linking ISSN)이 가장 안정적이라 그쪽을 우선.
  const queryIssn = journal.issnL ?? issn;

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

      {/* M3 PR3에서 탭 컨테이너로 확장. 지금은 호 탐색만. */}
      <nav
        aria-label="저널 진입 방식"
        className="mb-5 flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
      >
        <span className="border-b-2 border-zinc-900 px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100">
          📅 호 탐색
        </span>
        <span className="cursor-not-allowed px-3 py-2 text-sm text-zinc-300 dark:text-zinc-700">
          🏷️ 주제 (곧)
        </span>
        <span className="cursor-not-allowed px-3 py-2 text-sm text-zinc-300 dark:text-zinc-700">
          📈 트렌드 (곧)
        </span>
      </nav>

      <IssueExplorer issn={queryIssn} journalName={journal.name} />
    </main>
  );
}
