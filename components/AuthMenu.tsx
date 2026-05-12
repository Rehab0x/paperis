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
        className="inline-flex h-8 w-8 animate-pulse rounded-full bg-paperis-surface-2"
      />
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return (
      <button
        type="button"
        onClick={() => signIn("google", { callbackUrl: "/app" })}
        className="inline-flex h-8 items-center rounded-lg border border-paperis-border bg-paperis-surface px-3 text-xs font-medium text-paperis-text-2 transition hover:border-paperis-text-3 hover:text-paperis-text"
      >
        로그인
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
        className="inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border border-paperis-border bg-paperis-surface-2 text-xs font-semibold text-paperis-text transition hover:border-paperis-text-3"
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
          className="absolute right-0 z-30 mt-2 w-56 origin-top-right rounded-xl border border-paperis-border bg-paperis-surface p-2 shadow-lg"
        >
          <div className="px-2 py-1.5">
            <div className="truncate text-sm font-medium text-paperis-text">
              {user.name ?? "(이름 없음)"}
            </div>
            <div className="truncate text-[11px] text-paperis-text-3">
              {user.email}
            </div>
          </div>
          <div className="my-1 h-px bg-paperis-border" />
          {!user.onboardingDone ? (
            <Link
              href="/onboarding"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mb-1 flex items-start gap-2 rounded-lg border border-paperis-accent/40 bg-paperis-accent-dim/40 px-2 py-1.5 text-xs text-paperis-accent transition hover:bg-paperis-accent-dim/60"
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
          {user.onboardingDone ? (
            <>
              <Link
                href="/account"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
              >
                <span>👤</span>
                <span>계정 · 구독</span>
              </Link>
              <Link
                href="/billing"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
              >
                <span>💎</span>
                <span>업그레이드</span>
              </Link>
            </>
          ) : null}
          <div className="px-2 pb-1 text-[11px] text-paperis-text-3">
            내 임상과·저널 설정이 디바이스 간 동기화됩니다.
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
            className="mt-1 inline-flex h-8 w-full items-center justify-start rounded-lg px-2 text-xs font-medium text-paperis-text-2 transition hover:bg-paperis-surface-2 hover:text-paperis-text"
          >
            로그아웃
          </button>
        </div>
      ) : null}
    </div>
  );
}
