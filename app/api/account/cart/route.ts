// 로그인 사용자의 카트 영속화.
// GET    → 서버에 저장된 카트 전체
// PUT    → 카트 전체를 클라이언트 상태로 덮어쓰기 (마이그레이션·동기화에 사용)
// POST   → 단일 항목 upsert (담기)
// DELETE → 단일 pmid 제거 또는 ?all=true로 비우기

import type { NextRequest } from "next/server";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { userCart } from "@/lib/db/schema";
import type { Paper } from "@/types";

export const runtime = "nodejs";

interface PutBody {
  items?: { pmid: string; paper: Paper; addedAt?: number }[];
}

interface PostBody {
  pmid?: string;
  paper?: Paper;
}

function isPaper(obj: unknown): obj is Paper {
  if (!obj || typeof obj !== "object") return false;
  const p = obj as Record<string, unknown>;
  return typeof p.pmid === "string" && typeof p.title === "string";
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ items: [] }, { status: 200 });
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(userCart)
    .where(eq(userCart.userId, session.user.id));
  const items = rows.map((r) => ({
    pmid: r.pmid,
    paper: r.paper as Paper,
    addedAt: r.addedAt.getTime(),
  }));
  return Response.json({ items });
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: PutBody;
  try {
    body = (await request.json()) as PutBody;
  } catch {
    return Response.json({ error: "잘못된 본문입니다." }, { status: 400 });
  }
  const userId = session.user.id;
  const items = Array.isArray(body.items) ? body.items : [];
  const valid = items.filter(
    (it) => typeof it.pmid === "string" && isPaper(it.paper)
  );

  // 멱등 동기화 — neon-http는 statement 단위라 진짜 트랜잭션 X.
  // delete + insert 패턴은 동시 PUT 시 unique 충돌 race 발생함. 대신:
  //   1) 새 items를 onConflictDoUpdate로 upsert (없으면 insert, 있으면 갱신)
  //   2) 새 items에 없는 기존 pmid만 delete
  // 이 두 단계는 모두 멱등이라 동시 호출해도 같은 결과로 수렴.

  const db = getDb();
  if (valid.length > 0) {
    await db
      .insert(userCart)
      .values(
        valid.map((it) => ({
          userId,
          pmid: it.pmid,
          paper: it.paper,
          addedAt: it.addedAt ? new Date(it.addedAt) : new Date(),
        }))
      )
      .onConflictDoUpdate({
        target: [userCart.userId, userCart.pmid],
        set: {
          paper: sqlPaperRef(),
          addedAt: sqlAddedAtRef(),
        },
      });
  }

  const keepPmids = valid.map((it) => it.pmid);
  if (keepPmids.length === 0) {
    await db.delete(userCart).where(eq(userCart.userId, userId));
  } else {
    await db
      .delete(userCart)
      .where(
        and(
          eq(userCart.userId, userId),
          notInArray(userCart.pmid, keepPmids)
        )
      );
  }

  return Response.json({ ok: true, count: valid.length });
}

// onConflictDoUpdate에서 EXCLUDED.column을 참조하는 표현
function sqlPaperRef() {
  return sql`excluded.paper`;
}
function sqlAddedAtRef() {
  return sql`excluded.added_at`;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: "잘못된 본문입니다." }, { status: 400 });
  }
  if (!body.pmid || !isPaper(body.paper)) {
    return Response.json(
      { error: "pmid와 paper가 필요합니다." },
      { status: 400 }
    );
  }
  const db = getDb();
  const userId = session.user.id;
  await db
    .insert(userCart)
    .values({ userId, pmid: body.pmid, paper: body.paper })
    .onConflictDoUpdate({
      target: [userCart.userId, userCart.pmid],
      set: { paper: body.paper, addedAt: new Date() },
    });
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const userId = session.user.id;
  const all = request.nextUrl.searchParams.get("all") === "true";
  const pmid = request.nextUrl.searchParams.get("pmid");

  const db = getDb();
  if (all) {
    await db.delete(userCart).where(eq(userCart.userId, userId));
    return Response.json({ ok: true });
  }
  if (!pmid) {
    return Response.json(
      { error: "pmid 또는 ?all=true가 필요합니다." },
      { status: 400 }
    );
  }
  await db
    .delete(userCart)
    .where(and(eq(userCart.userId, userId), eq(userCart.pmid, pmid)));
  return Response.json({ ok: true });
}
