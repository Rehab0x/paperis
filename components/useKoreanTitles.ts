"use client";

import { useEffect, useMemo, useState } from "react";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { useLocale } from "@/components/useLocale";
import { useShowKoreanTitles } from "@/components/useShowKoreanTitles";
import {
  readManyKoreanTitles,
  writeManyKoreanTitles,
} from "@/lib/title-ko-cache";

interface InputPaper {
  pmid: string;
  title: string;
}

interface BatchResponse {
  translations?: { pmid?: unknown; titleKo?: unknown }[];
  error?: string;
}

/**
 * papers 전체에 대한 한국어 제목 맵을 반환. 다음 조건 모두 만족할 때만 fetch:
 *   1. locale === "ko"
 *   2. 설정 "한국어 제목 표시" ON
 *   3. localStorage 캐시에 없는 pmid가 1건 이상
 *
 * 반환되는 Map은 캐시 hit + fresh fetch 합집합. 즉시 사용 가능.
 *
 * 의존성 — fetchKey는 부모 컨텍스트(검색식·호·페이지) 식별용이지만, 실제
 * effect 재실행 트리거는 `pmidKey`(papers의 pmid join). 이유: 부모가 papers를
 * 비동기로 fetch하므로 fetchKey가 먼저 set되고 papers는 나중에 도착. fetchKey만
 * 의존성으로 두면 첫 실행은 빈 papers로 일어나 빈 Map 반환 후 영영 재실행되지
 * 않는 버그 발생.
 */
export function useKoreanTitles(
  papers: InputPaper[],
  fetchKey: string
): Map<string, string> {
  const enabled = useShowKoreanTitles();
  const locale = useLocale();
  const fetchWithKeys = useFetchWithKeys();
  const [titles, setTitles] = useState<Map<string, string>>(new Map());

  // pmids 직렬화 — 같은 페이지 같은 papers면 안정. effect 재실행 트리거.
  const pmidKey = useMemo(
    () => papers.map((p) => p.pmid).filter(Boolean).join(","),
    [papers]
  );

  useEffect(() => {
    // 비활성/EN 모드면 빈 맵
    if (!enabled || locale !== "ko" || !pmidKey) {
      setTitles(new Map());
      return;
    }

    const pmids = pmidKey.split(",");

    // 1) 캐시 우선 — 첫 렌더에서 보유한 만큼 즉시 표시
    const cached = readManyKoreanTitles(pmids);
    setTitles(new Map(cached));

    // 2) 캐시에 없는 pmid만 서버에 batch 번역 요청
    const missing = papers.filter(
      (p) => p.pmid && p.title && !cached.has(p.pmid)
    );
    if (missing.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      try {
        const res = await fetchWithKeys("/api/translate-titles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            papers: missing.map((p) => ({ pmid: p.pmid, title: p.title })),
          }),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const json = (await res.json()) as BatchResponse;
        if (cancelled || !json.translations) return;

        const fresh = new Map<string, string>();
        for (const item of json.translations) {
          const pmid = typeof item.pmid === "string" ? item.pmid : "";
          const ko = typeof item.titleKo === "string" ? item.titleKo : "";
          if (pmid && ko) fresh.set(pmid, ko);
        }
        if (fresh.size === 0) return;

        // 3) 새로 받은 것 캐시에 저장 + 화면 즉시 갱신
        writeManyKoreanTitles(fresh);
        setTitles((prev) => {
          const next = new Map(prev);
          for (const [k, v] of fresh) next.set(k, v);
          return next;
        });
      } catch {
        // 네트워크/AI 에러 시 silent — 영문 제목 그대로 표시
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // papers는 pmidKey로 안정 비교. fetchKey는 부모 컨텍스트 기록용으로만 의존.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pmidKey, enabled, locale, fetchKey]);

  return titles;
}
