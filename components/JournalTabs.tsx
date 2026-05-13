"use client";

import Link from "next/link";
import { useAppMessages } from "@/components/useAppMessages";

export type JournalTab = "issue" | "topic" | "trend";

interface Props {
  /** 현재 활성 탭 — server component가 searchParams.tab으로 전달 */
  current: JournalTab;
  /** URL 베이스 — 예: `/journal/0028-3878` */
  baseHref: string;
  /** referrer 임상과 — 탭 이동 시에도 유지해 주제 탭의 추천 태그가 보존되도록 */
  fromSpecialtyId?: string;
}

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
  const m = useAppMessages();
  const TABS: { id: JournalTab; label: string }[] = [
    { id: "issue", label: m.journal.tabs.issue },
    { id: "topic", label: m.journal.tabs.topic },
    { id: "trend", label: m.journal.tabs.trend },
  ];
  return (
    <nav
      aria-label={m.journal.tabs.aria}
      className="mb-5 flex gap-1 border-b border-paperis-border"
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
                ? "border-b-2 border-paperis-accent font-medium text-paperis-text"
                : "text-paperis-text-3 hover:text-paperis-text",
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
