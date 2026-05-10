// 홈 첫 화면 — 빠른 진입 3등분 그리드. 모든 카드는 /journal(임상과 선택)로.
// 임상과 선택 후 저널 → ?tab=... 로 분기되므로, 이 그리드는 "어떤 모드로 들어갈
// 의도인지" 사용자에게 미리 노출하는 역할만 한다 (랜딩에 명시 라우트 X).

import Link from "next/link";

interface Card {
  emoji: string;
  label: string;
  hint: string;
  href: string;
}

const CARDS: Card[] = [
  {
    emoji: "📅",
    label: "호 탐색",
    hint: "특정 월호의 경향 + 논문",
    href: "/journal",
  },
  {
    emoji: "🏷️",
    label: "주제 탐색",
    hint: "저널 안에서 키워드 모아보기",
    href: "/journal",
  },
  {
    emoji: "📈",
    label: "트렌드",
    hint: "연도·분기 단위 심층 분석",
    href: "/journal",
  },
];

export default function QuickAccessGrid() {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-medium tracking-wide text-zinc-700 dark:text-zinc-300">
        🧭 빠른 진입
      </h2>
      <div className="grid grid-cols-3 gap-3">
        {CARDS.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex flex-col items-center gap-1 rounded-2xl border border-zinc-200 bg-white px-2 py-5 text-center transition hover:-translate-y-0.5 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
          >
            <span aria-hidden className="text-2xl">
              {c.emoji}
            </span>
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              {c.label}
            </span>
            <span className="hidden text-[10px] leading-tight text-zinc-500 sm:block">
              {c.hint}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
