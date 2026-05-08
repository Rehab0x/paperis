// /api/account/prefs — 사용자의 임상과·저널 prefs (4종) 통합 GET/PUT.
//
// GET: { specialties, blocks, additions, favorites }
// PUT: 같은 형식 → DB를 그대로 reset (멱등). 클라가 변경 시 debounced로 전체 상태 PUT.

import { auth } from "@/auth";
import { hasDb } from "@/lib/db";
import {
  emptyPrefs,
  loadAccountPrefs,
  saveAccountPrefs,
  type AccountPrefs,
} from "@/lib/account-prefs";
import type { ApiError } from "@/types";

export const runtime = "nodejs";

function jsonError(error: string, status = 400) {
  const body: ApiError = { error };
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isValidPrefs(v: unknown): v is AccountPrefs {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  if (!Array.isArray(p.specialties)) return false;
  for (const s of p.specialties) if (typeof s !== "string") return false;
  if (typeof p.blocks !== "object" || !p.blocks) return false;
  if (typeof p.additions !== "object" || !p.additions) return false;
  if (typeof p.favorites !== "object" || !p.favorites) return false;
  return true;
}

export async function GET() {
  if (!hasDb()) return jsonError("DB가 설정되지 않았습니다.", 503);
  const session = await auth();
  if (!session?.user?.id) return jsonError("로그인이 필요합니다.", 401);

  try {
    const prefs = await loadAccountPrefs(session.user.id);
    return new Response(JSON.stringify(prefs), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    console.error("[account/prefs GET] failed", err);
    return jsonError("prefs 로드 실패", 500);
  }
}

export async function PUT(req: Request) {
  if (!hasDb()) return jsonError("DB가 설정되지 않았습니다.", 503);
  const session = await auth();
  if (!session?.user?.id) return jsonError("로그인이 필요합니다.", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("요청 본문이 올바른 JSON이 아닙니다.");
  }
  if (!isValidPrefs(body)) {
    return jsonError("prefs 형식이 올바르지 않습니다.");
  }

  try {
    await saveAccountPrefs(session.user.id, body);
  } catch (err) {
    console.error("[account/prefs PUT] failed", err);
    return jsonError("prefs 저장 실패", 500);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// 빌드 시 변수 사용 — emptyPrefs는 future use이지만 import 유지
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _emptyPrefs = emptyPrefs;
