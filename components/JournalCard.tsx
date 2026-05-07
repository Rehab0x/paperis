import Link from "next/link";
import type { JournalSummary } from "@/lib/openalex";

/**
 * 저널 한 건을 표시하는 카드. server component 친화 — props만으로 렌더.
 *
 * `href`가 주어지면 카드 전체가 클릭 영역. 다음 PR(저널 홈) 도착 전까지는
 * 부모 페이지가 href를 비워 두면 plain 카드로만 표시된다.
 */
export default function JournalCard({
  journal,
  href,
}: {
  journal: JournalSummary;
  href?: string;
}) {
  const Inner = (
    <div
      className={[
        "h-full rounded-2xl border border-zinc-200 bg-white p-4 transition dark:border-zinc-800 dark:bg-zinc-950",
        href
          ? "hover:border-zinc-400 hover:shadow-sm dark:hover:border-zinc-600"
          : "",
      ].join(" ")}
    >
      <h3 className="text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
        {journal.name}
      </h3>
      {journal.publisher ? (
        <p className="mt-0.5 text-xs text-zinc-500">{journal.publisher}</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {journal.issnL ? (
          <>
            <dt className="text-zinc-400">ISSN-L</dt>
            <dd className="font-mono text-zinc-700 dark:text-zinc-300">
              {journal.issnL}
            </dd>
          </>
        ) : null}
        {typeof journal.twoYearMeanCitedness === "number" ? (
          <>
            <dt className="text-zinc-400">2yr 인용도</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {journal.twoYearMeanCitedness.toFixed(2)}
            </dd>
          </>
        ) : null}
        {journal.worksCount > 0 ? (
          <>
            <dt className="text-zinc-400">논문 수</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {journal.worksCount.toLocaleString()}
            </dd>
          </>
        ) : null}
        {journal.citedByCount > 0 ? (
          <>
            <dt className="text-zinc-400">총 인용</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {journal.citedByCount.toLocaleString()}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );
  if (!href) return Inner;
  return (
    <Link href={href} className="block h-full">
      {Inner}
    </Link>
  );
}
