// 온보딩 — 휴대폰 + 약관 + 임상과 선택 (선택사항).
//
// server component: lib/journals 카탈로그를 서버에서 fetch해 클라이언트 form에 넘김.
// 폼·session/router 사용은 OnboardingForm(client)이 처리.

import { getJournalCatalog } from "@/lib/journals";
import OnboardingForm, {
  type SpecialtyOption,
} from "@/components/OnboardingForm";

export const dynamic = "force-dynamic"; // session 의존이므로 SSG 안 함

export default async function OnboardingPage() {
  const catalog = await getJournalCatalog();
  const specialties: SpecialtyOption[] = catalog.specialties.map((s) => ({
    id: s.id,
    name: s.name,
    nameEn: s.nameEn,
  }));
  return <OnboardingForm specialties={specialties} />;
}
