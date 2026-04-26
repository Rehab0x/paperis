// 로그인 사용자의 추천 가중치 영속화.
// GET → 저장된 가중치 (없으면 기본값)
// PUT → 가중치 upsert

import type { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { userWeights } from "@/lib/db/schema";
import {
  DEFAULT_RECOMMEND_WEIGHTS,
  type RecommendWeights,
} from "@/types";

export const runtime = "nodejs";

function clampWeight(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ weights: DEFAULT_RECOMMEND_WEIGHTS });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(userWeights)
    .where(eq(userWeights.userId, session.user.id))
    .limit(1);
  if (rows.length === 0) {
    return Response.json({ weights: DEFAULT_RECOMMEND_WEIGHTS });
  }
  const r = rows[0];
  const weights: RecommendWeights = {
    recency: r.recency,
    citations: r.citations,
    journal: r.journal,
    niche: r.niche,
  };
  return Response.json({ weights });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: { weights?: Partial<RecommendWeights> };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "잘못된 본문입니다." }, { status: 400 });
  }
  const w = body.weights ?? {};
  const next: RecommendWeights = {
    recency: clampWeight(w.recency, DEFAULT_RECOMMEND_WEIGHTS.recency),
    citations: clampWeight(w.citations, DEFAULT_RECOMMEND_WEIGHTS.citations),
    journal: clampWeight(w.journal, DEFAULT_RECOMMEND_WEIGHTS.journal),
    niche: clampWeight(w.niche, DEFAULT_RECOMMEND_WEIGHTS.niche),
  };
  const db = getDb();
  await db
    .insert(userWeights)
    .values({ userId: session.user.id, ...next })
    .onConflictDoUpdate({
      target: userWeights.userId,
      set: { ...next, updatedAt: new Date() },
    });
  return Response.json({ ok: true, weights: next });
}
