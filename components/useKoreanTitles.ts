"use client";

import { useEffect, useState } from "react";
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
 * fetchKey가 바뀔 때마다 재평가 — 검색식 변경/페이지 이동 시 새 batch.
 */
export function useKoreanTitles(
  papers: InputPaper[],
  fetchKey: string
): Map<string, string> {
  const enabled = useShowKoreanTitles();
  const locale = useLocale();
  const fetchWithKeys = useFetchWithKeys();
  const [titles, setTitles] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    // 비활성/EN 모드면 빈 맵
    if (!enabled || locale !== "ko" || papers.length === 0) {
      setTitles(new Map());
      return;
    }

    const pmids = papers.map((p) => p.pmid).filter(Boolean);
    if (pmids.length === 0) {
      setTitles(new Map());
      return;
    }

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
    // fetchKey가 바뀌면 새 batch. papers는 fetchKey 기반으로 부모가 안정 보장.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, enabled, locale]);

  return titles;
}
