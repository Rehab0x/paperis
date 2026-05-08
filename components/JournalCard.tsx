import Link from "next/link";
import type { JournalSummary } from "@/lib/openalex";

/**
 * 저널 한 건을 표시하는 카드. server-friendly이지만 `onBlock`/`onRemoveByUser`
 * prop이 주어지면 클라 인터랙션 버튼이 추가된다.
 *
 * onBlock과 onRemoveByUser는 서로 배타 — 카드 1개당 하나만 노출.
 *   - onBlock: 자동 추천/시드 카드. "이 임상과에서 숨기기"
 *   - onRemoveByUser: 사용자가 직접 추가한 저널 카드. "추가 목록에서 제거"
 *
 * `href`가 주어지면 카드 전체가 클릭 영역. 부모가 href를 비워 두면 plain 카드.
 */
export default function JournalCard({
  journal,
  href,
  onBlock,
  onRemoveByUser,
  badge,
}: {
  journal: JournalSummary;
  href?: string;
  /** 우상단 ✕ "이 임상과에서 숨기기". 자동 추천/시드 카드용 */
  onBlock?: () => void;
  /** 우상단 ✕ "추가 목록에서 제거". 사용자가 추가한 저널 카드용 */
  onRemoveByUser?: () => void;
  /** 좌상단에 작은 라벨 — "내가 추가" 같은 출처 표시 */
  badge?: string;
}) {
  const inner = (
    <div
      className={[
        "h-full rounded-2xl border border-zinc-200 bg-white p-4 transition dark:border-zinc-800 dark:bg-zinc-950",
        href
          ? "hover:border-zinc-400 hover:shadow-sm dark:hover:border-zinc-600"
          : "",
      ].join(" ")}
    >
      <h3 className="pr-7 pt-3 text-sm font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
        {journal.name}
      </h3>
      {journal.publisher ? (
        <p className="mt-0.5 text-xs text-zinc-500">{journal.publisher}</p>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        {journal.issnL ? (
          <>
            <dt className="text-zinc-400">ISSN-L</dt>
            <dd className="font-mono text-zinc-700 dark:text-zinc-300">
              {journal.issnL}
            </dd>
          </>
        ) : null}
        {typeof journal.twoYearMeanCitedness === "number" ? (
          <>
            <dt className="text-zinc-400">2yr 인용도</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {journal.twoYearMeanCitedness.toFixed(2)}
            </dd>
          </>
        ) : null}
        {journal.worksCount > 0 ? (
          <>
            <dt className="text-zinc-400">논문 수</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {journal.worksCount.toLocaleString()}
            </dd>
          </>
        ) : null}
        {journal.citedByCount > 0 ? (
          <>
            <dt className="text-zinc-400">총 인용</dt>
            <dd className="text-zinc-700 dark:text-zinc-300">
              {journal.citedByCount.toLocaleString()}
            </dd>
          </>
        ) : null}
      </dl>
    </div>
  );

  // ✕ 버튼은 카드 전체 클릭 영역(Link) 안에 absolute로 놓고 e.preventDefault()로
  // navigation 차단. onBlock/onRemoveByUser 미지정 시엔 그려지지 않으므로 server-only
  // 사용처에는 영향 없음.
  const onActionLabel = onRemoveByUser
    ? "추가 목록에서 제거"
    : onBlock
      ? "이 임상과에서 숨기기"
      : null;
  const onAction = onRemoveByUser ?? onBlock ?? null;
  const actionButton = onAction ? (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAction();
      }}
      aria-label={onActionLabel ?? "삭제"}
      title={onActionLabel ?? "삭제"}
      className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-xs text-zinc-300 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      ✕
    </button>
  ) : null;

  const badgeNode = badge ? (
    <span className="absolute left-2 top-2 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
      {badge}
    </span>
  ) : null;

  if (!href) {
    return (
      <div className="relative h-full">
        {inner}
        {badgeNode}
        {actionButton}
      </div>
    );
  }
  return (
    <Link href={href} className="relative block h-full">
      {inner}
      {badgeNode}
      {actionButton}
    </Link>
  );
}
