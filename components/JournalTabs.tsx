"use client";

import Link from "next/link";

export type JournalTab = "issue" | "topic" | "trend";

interface Props {
  /** 현재 활성 탭 — server component가 searchParams.tab으로 전달 */
  current: JournalTab;
  /** URL 베이스 — 예: `/journal/0028-3878` */
  baseHref: string;
  /** referrer 임상과 — 탭 이동 시에도 유지해 주제 탭의 추천 태그가 보존되도록 */
  fromSpecialtyId?: string;
}

const TABS: { id: JournalTab; label: string }[] = [
  { id: "issue", label: "📅 호 탐색" },
  { id: "topic", label: "🏷️ 주제 탐색" },
  { id: "trend", label: "📈 최근 트렌드" },
];

function buildHref(
  baseHref: string,
  tab: JournalTab,
  fromSpecialtyId?: string
): string {
  const params = new URLSearchParams();
  if (tab !== "issue") params.set("tab", tab);
  if (fromSpecialtyId) params.set("from", fromSpecialtyId);
  const qs = params.toString();
  return qs ? `${baseHref}?${qs}` : baseHref;
}

export default function JournalTabs({ current, baseHref, fromSpecialtyId }: Props) {
  return (
    <nav
      aria-label="저널 진입 방식"
      className="mb-5 flex gap-1 border-b border-zinc-200 dark:border-zinc-800"
    >
      {TABS.map((t) => {
        const active = current === t.id;
        const href = buildHref(baseHref, t.id, fromSpecialtyId);
        return (
          <Link
            key={t.id}
            href={href}
            scroll={false}
            className={[
              "px-3 py-2 text-sm transition",
              active
                ? "border-b-2 border-zinc-900 font-medium text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300",
            ].join(" ")}
            aria-current={active ? "page" : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
