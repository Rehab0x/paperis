import MySpecialtiesGrid from "@/components/MySpecialtiesGrid";
import { getJournalCatalog } from "@/lib/journals";

// 저널 큐레이션 진입 — 임상과 그리드.
// 카탈로그는 GitHub raw + revalidate 3600으로 받아 ISR로 캐싱.
// 사용자가 선택한 "내 임상과"는 client에서 localStorage로 매핑(MySpecialtiesGrid).
export const revalidate = 3600;

export const metadata = {
  title: "임상과 선택 — Paperis",
  description: "임상과별 저널 큐레이션 — 호 탐색·주제 탐색·최근 트렌드",
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

      <MySpecialtiesGrid catalog={catalog} />
    </main>
  );
}
