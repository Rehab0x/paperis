// /api/translate-titles — 영어 논문 제목 → 한국어 batch 번역.
//
// 클라가 "한국어 제목 표시" 토글 ON일 때만 호출. 페이지당 한 번 batch.
// 캐싱:
//   1. 클라 localStorage(pmid → ko) — useKoreanTitles 훅이 cache hit 시 호출 자체 생략
//   2. 서버 Redis `title-ko:{pmid}` — 영구(논문 제목은 불변, LRU eviction에 맡김)
// Redis 부재 시 silent fallback — AI 호출만으로 동작.

import { NextResponse } from "next/server";
import { getEffectiveAiProvider } from "@/lib/ai/registry";
import { friendlyErrorMessage } from "@/lib/gemini";
import { getCached, setCached } from "@/lib/journal-cache";
import { generateBatchTitleTranslations } from "@/lib/title-translate";
import { applyUserKeysToEnv } from "@/lib/user-keys";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BATCH = 50;

interface InputItem {
  pmid: string;
  title: string;
}

function isInputItem(v: unknown): v is InputItem {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.pmid === "string" && typeof o.title === "string";
}

function cacheKey(pmid: string): string {
  return `title-ko:${pmid}`;
}

export async function POST(req: Request) {
  await applyUserKeysToEnv(req);
  let body: { papers?: unknown };
  try {
    body = (await req.json()) as { papers?: unknown };
  } catch {
    return NextResponse.json(
      { error: "요청 본문이 올바른 JSON이 아닙니다." },
      { status: 400 }
    );
  }

  const incoming = Array.isArray(body.papers) ? body.papers : [];
  const papers = incoming.filter(isInputItem).slice(0, MAX_BATCH);
  if (papers.length === 0) {
    return NextResponse.json({ translations: [] });
  }

  // 1. Redis 캐시 먼저 — pmid 단위. 모든 papers 병렬 조회.
  const cached = new Map<string, string>();
  const missing: InputItem[] = [];
  await Promise.all(
    papers.map(async (p) => {
      const hit = await getCached<string>(cacheKey(p.pmid));
      if (hit && typeof hit === "string") cached.set(p.pmid, hit);
      else missing.push(p);
    })
  );

  if (missing.length === 0) {
    return NextResponse.json({
      translations: Array.from(cached, ([pmid, titleKo]) => ({ pmid, titleKo })),
    });
  }

  // 2. 캐시 miss만 AI batch
  try {
    const provider = await getEffectiveAiProvider(req);
    const fresh = await generateBatchTitleTranslations(missing, provider);

    // 3. fresh를 Redis에 영구 저장 (TTL 없음 — 제목은 불변)
    await Promise.all(
      Array.from(fresh, async ([pmid, titleKo]) => {
        await setCached(cacheKey(pmid), titleKo);
      })
    );

    // 4. 응답 = 캐시 + fresh 합집합
    const translations: { pmid: string; titleKo: string }[] = [];
    for (const [pmid, titleKo] of cached) translations.push({ pmid, titleKo });
    for (const [pmid, titleKo] of fresh) translations.push({ pmid, titleKo });
    return NextResponse.json({ translations });
  } catch (err) {
    return NextResponse.json(
      { error: friendlyErrorMessage(err, "ko") },
      { status: 502 }
    );
  }
}
