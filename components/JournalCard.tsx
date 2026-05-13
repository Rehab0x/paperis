"use client";

import Link from "next/link";
import { useAppMessages } from "@/components/useAppMessages";
import type { JournalSummary } from "@/lib/openalex";

/**
 * 저널 한 건을 표시하는 카드. server-friendly이지만 `onBlock`/`onRemoveByUser`/
 * `onToggleFavorite` prop이 주어지면 클라 인터랙션 버튼이 추가된다.
 *
 * onBlock과 onRemoveByUser는 서로 배타 — 카드 1개당 하나만 노출:
 *   - onBlock: 자동 추천/시드 카드. "이 임상과에서 숨기기"
 *   - onRemoveByUser: 사용자가 직접 추가한 저널 카드. "추가 목록에서 제거"
 *
 * onToggleFavorite은 위 둘과 독립 — 별 모양 토글이 우상단에 함께 노출된다.
 *
 * `href`가 주어지면 카드 전체가 클릭 영역. 부모가 href를 비워 두면 plain 카드.
 */
export default function JournalCard({
  journal,
  href,
  onBlock,
  onRemoveByUser,
  onToggleFavorite,
  isFavorite,
  badge,
}: {
  journal: JournalSummary;
  href?: string;
  /** 우상단 ✕ "이 임상과에서 숨기기". 자동 추천/시드 카드용 */
  onBlock?: () => void;
  /** 우상단 ✕ "추가 목록에서 제거". 사용자가 추가한 저널 카드용 */
  onRemoveByUser?: () => void;
  /** 우상단 ⭐ 토글 — 즐겨찾기. 별표 자체는 isFavorite으로 채워짐 표시 */
  onToggleFavorite?: () => void;
  isFavorite?: boolean;
  /** 좌상단에 작은 라벨 — "내가 추가" 같은 출처 표시 */
  badge?: string;
}) {
  const m = useAppMessages();
  const inner = (
    <div
      className={[
        "h-full rounded-2xl border border-paperis-border bg-paperis-surface p-4 transition",
        href ? "hover:-translate-y-0.5 hover:border-paperis-text-3" : "",
      ].join(" ")}
    >
      <h3 className="pr-14 pt-3 font-serif text-base font-medium leading-snug tracking-tight text-paperis-text">
        {journal.name}
      </h3>
      {journal.publisher ? (
        <p className="mt-0.5 text-xs text-paperis-text-3">{journal.publisher}</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {journal.issnL ? (
          <>
            <dt className="text-paperis-text-3">ISSN-L</dt>
            <dd className="font-mono tabular-nums text-paperis-text-2">
              {journal.issnL}
            </dd>
          </>
        ) : null}
        {typeof journal.twoYearMeanCitedness === "number" ? (
          <>
            <dt className="text-paperis-text-3">{m.journal.card.twoYrCitations}</dt>
            <dd className="tabular-nums text-paperis-text-2">
              {journal.twoYearMeanCitedness.toFixed(2)}
            </dd>
          </>
        ) : null}
        {journal.worksCount > 0 ? (
          <>
            <dt className="text-paperis-text-3">{m.journal.card.paperCount}</dt>
            <dd className="tabular-nums text-paperis-text-2">
              {journal.worksCount.toLocaleString()}
            </dd>
          </>
        ) : null}
        {journal.citedByCount > 0 ? (
          <>
            <dt className="text-paperis-text-3">{m.journal.card.totalCites}</dt>
            <dd className="tabular-nums text-paperis-text-2">
              {journal.citedByCount.toLocaleString()}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );

  // ✕/⭐ 버튼은 카드 전체 클릭 영역(Link) 안에 absolute로 놓고 e.preventDefault()로
  // navigation 차단. 미지정 시엔 그려지지 않으므로 server-only 사용처는 영향 없음.
  const onActionLabel = onRemoveByUser
    ? m.journal.card.removeAdded
    : onBlock
      ? m.journal.card.hideInSpecialty
      : null;
  const onAction = onRemoveByUser ?? onBlock ?? null;

  const favButton = onToggleFavorite ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleFavorite();
      }}
      aria-label={isFavorite ? m.journal.card.unfavoriteAria : m.journal.card.favoriteAria}
      aria-pressed={isFavorite}
      title={isFavorite ? m.journal.card.unfavoriteAria : m.journal.card.favoriteTitle}
      className={[
        "inline-flex h-6 w-6 items-center justify-center rounded-md text-sm transition",
        isFavorite
          ? "text-paperis-accent hover:bg-paperis-accent-dim/40"
          : "text-paperis-text-3 hover:bg-paperis-surface-2 hover:text-paperis-accent",
      ].join(" ")}
    >
      {isFavorite ? "★" : "☆"}
    </button>
  ) : null;

  const actionBtn = onAction ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction();
      }}
      aria-label={onActionLabel ?? m.journal.card.remove}
      title={onActionLabel ?? m.journal.card.remove}
      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-xs text-paperis-text-3 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
    >
      ✕
    </button>
  ) : null;

  const cornerActions =
    favButton || actionBtn ? (
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5">
        {favButton}
        {actionBtn}
      </div>
    ) : null;

  const badgeNode = badge ? (
    <span className="absolute left-2 top-2 rounded-full border border-paperis-accent/40 bg-paperis-accent-dim/40 px-1.5 py-0.5 text-[9px] font-medium text-paperis-accent">
      {badge}
    </span>
  ) : null;

  if (!href) {
    return (
      <div className="relative h-full">
        {inner}
        {badgeNode}
        {cornerActions}
      </div>
    );
  }
  return (
    <Link href={href} className="relative block h-full">
      {inner}
      {badgeNode}
      {cornerActions}
    </Link>
  );
}
