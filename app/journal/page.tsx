import MySpecialtiesGrid from "@/components/MySpecialtiesGrid";
import { getMessages, getServerLocale } from "@/lib/i18n";
import { getJournalCatalog } from "@/lib/journals";

// 저널 큐레이션 진입 — 임상과 그리드.
// 카탈로그는 GitHub raw + revalidate 3600으로 받아 ISR로 캐싱.
// 사용자가 선택한 "내 임상과"는 client에서 localStorage로 매핑(MySpecialtiesGrid).
//
// metadata는 SSG/ISR과 충돌 회피 위해 static 한국어 유지 — SEO는 /[locale]/*
// 랜딩이 담당하고 이 페이지는 deep link 대상이 아님. 본문만 cookie 기반 i18n.
export const revalidate = 3600;

export const metadata = {
  title: "임상과 선택 — Paperis",
  description: "임상과별 저널 큐레이션 — 호 탐색·주제 탐색·최근 트렌드",
};

export default async function JournalLandingPage() {
  const [catalog, locale] = await Promise.all([
    getJournalCatalog(),
    getServerLocale(),
  ]);
  const m = getMessages(locale).app;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 pb-32">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-paperis-text">
          {m.journalIndex.headline}
        </h1>
        <p className="mt-1.5 text-sm text-paperis-text-3">
          {m.journalIndex.subline}
        </p>
      </div>

      <MySpecialtiesGrid catalog={catalog} />
    </main>
  );
}
