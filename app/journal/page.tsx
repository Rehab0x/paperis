import Link from "next/link";
import { getJournalCatalog } from "@/lib/journals";

// 저널 큐레이션 진입 — 임상과 그리드.
// 카탈로그는 GitHub raw + revalidate 3600으로 받아 ISR로 캐싱.
export const revalidate = 3600;

export const metadata = {
  title: "임상과 선택 — Paperis",
  description: "재활의학과·심장내과·신경과 등 임상과별 저널 큐레이션",
};

export default async function JournalLandingPage() {
  const catalog = await getJournalCatalog();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          임상과를 고르세요
        </h1>
        <p className="mt-1.5 text-sm text-zinc-500">
          임상과별 주요 저널 — 호 탐색, 주제 탐색, 최근 트렌드를 한 번에.
        </p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.specialties.map((s) => (
          <li key={s.id}>
            <Link
              href={`/journal/specialty/${s.id}`}
              className="block h-full rounded-2xl border border-zinc-200 bg-white p-5 transition hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
            >
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                {s.name}
              </h2>
              <p className="mt-0.5 text-xs text-zinc-500">{s.nameEn}</p>
              {s.suggestedTopics.length > 0 ? (
                <p className="mt-3 text-xs leading-relaxed text-zinc-500">
                  추천 주제 ·{" "}
                  {s.suggestedTopics.slice(0, 3).join(" / ")}
                  {s.suggestedTopics.length > 3 ? " …" : ""}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 text-[11px] text-zinc-400">
        임상과 추가 요청 — GitHub의{" "}
        <code className="font-mono">data/journals.json</code> 편집(또는 PR)
      </p>
    </main>
  );
}
