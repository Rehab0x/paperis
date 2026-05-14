"use client";

// PaperDetailPanel state(=풀텍스트/긴 요약/입력 source 토글)를 pmid 키로 세션
// 동안 in-memory 캐시. PaperDetailPanel은 부모(JournalPaperList / app/page.tsx)가
// key={pmid}로 remount해 컴포넌트 로컬 state가 매번 초기화되는데, 이때 사용자가
// 수동으로 업로드한 PDF나 30초+ 걸려 만든 긴 요약이 함께 사라지는 문제가 있음.
// 이 캐시는 그 user-investment를 탭이 열려 있는 동안 보존한다.
//
// 보존 범위: in-memory만(useRef). 새로고침·탭 닫기 시 사라짐 — 첨부 PDF는
// 사용자가 자기 디스크에 합법적으로 보유한 파일이라 IndexedDB까지 영속화하지
// 않음("내 첨부 PDF 라이브러리" 같은 explicit 메뉴는 추후 별도 작업).
//
// 캐시 대상 (transient는 제외):
//   - ft: FullTextState — 풀텍스트 자동 fetch 결과 또는 업로드 PDF 추출 결과
//   - summary: string — 긴 요약 완성본 (스트리밍 끝난 결과)
//   - summarySource: "fulltext" | "abstract" — 입력 소스 토글 위치
// 제외:
//   - summarizing / summaryError — 스트리밍·에러 상태 (재진입 시 깨끗하게)
//
// 메모리 압박 — papers 수십~수백 개 보더라도 ft.text가 가장 큼(평균 30-100KB).
// 출퇴근 1 세션에서 본 30개 ≈ 3MB. 적절한 상한선만 두고 FIFO 정리.

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import type { FullTextAttempt, FullTextSource } from "@/types";

export interface FullTextState {
  status: "idle" | "loading" | "ready" | "missing";
  text: string;
  source: FullTextSource | null;
  sourceUrl?: string | null;
  charCount: number;
  attempted: FullTextAttempt[];
}

export interface CachedPanel {
  ft: FullTextState;
  summary: string;
  summarySource: "fulltext" | "abstract";
}

interface ContextValue {
  get: (pmid: string) => CachedPanel | undefined;
  patch: (pmid: string, partial: Partial<CachedPanel>) => void;
  clear: (pmid: string) => void;
}

const Ctx = createContext<ContextValue | null>(null);

// hook이 Provider 밖에서 호출돼도 no-op 동작 보장 — 페이지 단위 SSR fallback 등에
// 대비. 이 경우 캐시 없이 PaperDetailPanel은 원래 동작(매번 fresh fetch) 그대로.
const NOOP: ContextValue = {
  get: () => undefined,
  patch: () => undefined,
  clear: () => undefined,
};

export function usePaperPanelCache(): ContextValue {
  return useContext(Ctx) ?? NOOP;
}

const MAX_ENTRIES = 100; // 출퇴근 1세션 충분히 커버. ft.text 평균 50KB × 100 = ~5MB

export default function PaperPanelCacheProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Map을 useRef로 — render 사이 동일 인스턴스 유지. useState로 하면 setMap이
  // 리렌더 폭주(자식 모든 카드/패널 리렌더). 캐시 hit/miss는 비동기 fetch
  // 흐름에서만 평가되므로 React state 동기화 필요 X.
  const mapRef = useRef<Map<string, CachedPanel>>(new Map());

  const get = useCallback((pmid: string) => mapRef.current.get(pmid), []);

  const patch = useCallback(
    (pmid: string, partial: Partial<CachedPanel>) => {
      const prev = mapRef.current.get(pmid);
      const next: CachedPanel = {
        ft:
          partial.ft ??
          prev?.ft ?? {
            status: "idle",
            text: "",
            source: null,
            charCount: 0,
            attempted: [],
          },
        summary: partial.summary ?? prev?.summary ?? "",
        summarySource:
          partial.summarySource ?? prev?.summarySource ?? "fulltext",
      };
      // FIFO 정리 — 새 키 들어올 때만 평가
      if (!prev && mapRef.current.size >= MAX_ENTRIES) {
        const firstKey = mapRef.current.keys().next().value;
        if (firstKey) mapRef.current.delete(firstKey);
      }
      // 기존 키면 같은 위치, 새 키면 끝에 추가
      mapRef.current.set(pmid, next);
    },
    []
  );

  const clear = useCallback((pmid: string) => {
    mapRef.current.delete(pmid);
  }, []);

  // get/patch/clear는 useCallback으로 안정. value 객체 자체도 한 번만 생성해
  // 부모 리렌더(예: ApiKeysProvider state change)가 자식 패널 effect dep 변경을
  // 일으키지 않게.
  const value = useMemo(() => ({ get, patch, clear }), [get, patch, clear]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
