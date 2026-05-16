"use client";

// 페이지 진입 시 viewport를 최상단으로 강제. Next.js Link 기본 scroll:true가 동작
// 안 하는 케이스(공유 layout 유지 + 자식 컴포넌트의 scrollIntoView 충돌) 대응용
// defensive 컴포넌트.
//
// 사용: 페이지 root에 <ScrollToTopOnMount /> 한 줄.
//
// requestAnimationFrame으로 layout 안정 후 호출 — 다른 useEffect의 scrollIntoView가
// 먼저 fire되어도 마지막에 0으로 reset.

import { useEffect } from "react";

export default function ScrollToTopOnMount() {
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return null;
}
