"use client";

// 헤더 우측의 로그인/계정 메뉴.
// FEATURE_AUTH=1일 때만 노출 (점진 롤아웃). 미로그인은 "로그인" 버튼, 로그인은
// 아바타 드롭다운(이름·이메일·온보딩 안내·로그아웃).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

const FEATURE_AUTH = process.env.NEXT_PUBLIC_FEATURE_AUTH === "1";

export default function AuthMenu() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!FEATURE_AUTH) return null;

  if (status === "loading") {
    return (
      <span
        aria-label="로그인 상태 확인 중"
        className="inline-flex h-8 w-16 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800"
      />
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google")}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
      >
        Google 로그인
      </button>
    );
  }

  const user = session.user;
  const initial = (
    user.name?.trim()?.[0] ||
    user.email?.[0] ||
    "?"
  ).toUpperCase();

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="계정 메뉴"
        aria-expanded={open}
        className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-zinc-100 text-xs font-semibold text-zinc-700 transition hover:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
      >
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={user.name ?? "사용자"}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initial
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 origin-top-right rounded-xl border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="px-2 py-1.5">
            <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {user.name ?? "(이름 없음)"}
            </div>
            <div className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {user.email}
            </div>
          </div>
          <div className="my-1 h-px bg-zinc-100 dark:bg-zinc-800" />
          {!user.onboardingDone ? (
            <Link
              href="/onboarding"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mb-1 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 transition hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900/40"
            >
              <span>📝</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium">프로필 완성하기</span>
                <span className="block text-[10px] opacity-80">
                  결제·구독에 필요해요
                </span>
              </span>
            </Link>
          ) : null}
          <div className="px-2 pb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            내 임상과·저널 설정이 디바이스 간 동기화됩니다 (M4 PR3+).
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="mt-1 inline-flex h-8 w-full items-center justify-start rounded-lg px-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}
