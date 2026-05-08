import Link from "next/link";
import { notFound } from "next/navigation";
import SpecialtyJournalsList from "@/components/SpecialtyJournalsList";
import { getSpecialty } from "@/lib/journals";
import { searchJournalsBySubfield } from "@/lib/openalex";

// 임상과별 저널 추천 — OpenAlex Sources에서 인용수 desc 상위 10개.
// 카탈로그도 추천 결과도 자주 안 바뀌므로 ISR.
export const revalidate = 3600;

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const specialty = await getSpecialty(id);
  if (!specialty) return { title: "임상과 — Paperis" };
  return {
    title: `${specialty.name} 저널 — Paperis`,
    description: `${specialty.name}(${specialty.nameEn}) 주요 저널 — OpenAlex 인용수 상위 추천`,
  };
}

export default async function SpecialtyJournalsPage({ params }: Props) {
  const { id } = await params;
  const specialty = await getSpecialty(id);
  if (!specialty) notFound();

  const journals = await searchJournalsBySubfield(
    specialty.openAlexSubfieldId,
    { perPage: 10 }
  );

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
          {specialty.name}
        </h1>
        <p className="mt-0.5 text-sm text-zinc-500">{specialty.nameEn}</p>
        <p className="mt-3 text-xs text-zinc-500">
          OpenAlex 기준 인용수 상위 저널 {journals.length}건. 저널을 누르면 호
          탐색·주제 탐색·최근 트렌드로 들어갑니다.
        </p>
      </header>

      {journals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
          저널 추천을 가져오지 못했습니다. OpenAlex API가 일시적으로 응답하지
          않거나 field ID 매핑이 비어 있을 수 있습니다.
          <p className="mt-2 text-xs text-zinc-400">
            subfield:{" "}
            <code className="font-mono">{specialty.openAlexSubfieldId}</code>
          </p>
        </div>
      ) : (
        <SpecialtyJournalsList
          journals={journals}
          specialtyId={specialty.id}
        />
      )}
    </main>
  );
}
