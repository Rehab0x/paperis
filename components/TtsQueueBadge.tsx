"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTtsQueue } from "@/components/TtsQueueProvider";
import type { TtsJob } from "@/components/TtsQueueProvider";

// 헤더 우측에 작게 떠 있는 배지.
// 평소엔 "TTS 변환 중 · N편 대기" 라벨만 보이고, 클릭하면 popover로
// 현재 진행/대기 중인 job 목록 노출. 항목 클릭 → 해당 논문 디테일 패널로 이동.
//
// popover는 fixed 좌표 — 헤더의 backdrop-blur가 만드는 stacking context
// 안에서 absolute로 두면 모바일에서 잘리는 현상이 있다.
export default function TtsQueueBadge() {
  const { jobs } = useTtsQueue();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [pos, setPos] = useState<{
    top: number;
    right?: number;
    left?: number;
  } | null>(null);

  const running = jobs.find((j) => j.status === "running");
  const queued = jobs.filter((j) => j.status === "queued");
  const total = (running ? 1 : 0) + queued.length;

  // 외부 클릭 / ESC로 닫기. popover는 fixed라 popoverRef + buttonRef 양쪽 모두 체크.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // 배지 위치 계산 → popover를 fixed로 배치.
  // 모바일(< 640px)은 좌우 8px 마진으로 가로 가득 채워 잘림 방지,
  // 데스크톱은 배지 바로 아래 우측 정렬로 작게.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    function updatePos() {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const top = rect.bottom + 8;
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        setPos({ top, left: 8, right: 8 });
      } else {
        const right = Math.max(8, window.innerWidth - rect.right);
        setPos({ top, right });
      }
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  // 큐가 비면 popover도 자동 닫음 (보여줄 게 없음)
  useEffect(() => {
    if (total === 0) setOpen(false);
  }, [total]);

  if (total === 0) return null;

  function handleOpenPaper(job: TtsJob) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pmid", job.paper.pmid);
    router.push(`/?${params.toString()}`, { scroll: false });
    setOpen(false);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/30 px-2 text-[11px] font-medium text-paperis-accent transition hover:bg-paperis-accent-dim/50"
        title={
          running
            ? `현재 변환 중: ${running.paper.title}`
            : `${queued.length}편 대기 중`
        }
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-paperis-accent" />
        {running ? "변환 중" : "대기"}
        {queued.length > 0 ? ` · ${queued.length}` : ""}
      </button>

      {open && pos ? (
        <div
          ref={popoverRef}
          style={pos}
          className="fixed z-50 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xl sm:w-80 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            TTS 작업
          </div>
          <ul className="max-h-[60vh] divide-y divide-zinc-100 overflow-auto dark:divide-zinc-900">
            {running ? (
              <JobRow
                job={running}
                badge="변환 중"
                badgeClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                onClick={() => handleOpenPaper(running)}
              />
            ) : null}
            {queued.map((j, i) => (
              <JobRow
                key={j.id}
                job={j}
                badge={`대기 ${i + 1}`}
                badgeClass="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                onClick={() => handleOpenPaper(j)}
              />
            ))}
          </ul>
          <div className="border-t border-zinc-200 px-3 py-2 text-[10px] text-zinc-400 dark:border-zinc-800">
            항목을 클릭하면 해당 논문 디테일 패널이 열립니다. 변환은 그대로
            계속됩니다.
          </div>
        </div>
      ) : null}
    </>
  );
}

function JobRow({
  job,
  badge,
  badgeClass,
  onClick,
}: {
  job: TtsJob;
  badge: string;
  badgeClass: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badgeClass}`}
        >
          {badge}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-zinc-900 dark:text-zinc-100">
            {job.paper.title}
          </span>
          <span className="block truncate text-[11px] text-zinc-500">
            {job.paper.journal} · {job.paper.year}
          </span>
        </span>
      </button>
    </li>
  );
}
