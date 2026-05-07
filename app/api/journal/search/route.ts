// /api/journal/search — OpenAlex Sources 자동완성.
// 사용자가 "Archives of PM&R" 같이 부분 문자열을 입력하면 매칭되는 저널 목록 반환.
// 마일스톤 4의 온보딩 / 설정 패널 "저널 추가" 자동완성 드롭다운에서 사용.

import { searchJournalsByName } from "@/lib/openalex";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const perPageRaw = Number(searchParams.get("perPage") ?? "10");
  const perPage = Number.isFinite(perPageRaw)
    ? Math.min(Math.max(Math.floor(perPageRaw), 1), 25)
    : 10;

  if (!q) {
    return Response.json({ journals: [] });
  }

  const journals = await searchJournalsByName(q, { perPage });
  return Response.json({ journals });
}
