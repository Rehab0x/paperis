// 랜딩페이지 전용 layout — root layout 안에 중첩되어 ThemeProvider/Provider stack은
// 그대로 받지만, 여기서 generateStaticParams로 빌드 타임에 ko/en 두 페이지를 정적
// 생성한다. SEO 최적.

import { notFound } from "next/navigation";
import { isLocale, LOCALES } from "@/lib/i18n";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <>{children}</>;
}
