// Drizzle + Neon serverless 클라이언트.
// Vercel/Edge·Node 양쪽에서 동작하도록 HTTP 드라이버 사용.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL이 설정되지 않았습니다. Vercel Storage(Neon) 통합 또는 .env.local 확인"
    );
  }
  return url;
}

// 모듈 캐시 — 콜드 스타트 후 같은 인스턴스 재사용
let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const sql = neon(getDatabaseUrl());
  _db = drizzle(sql, { schema });
  return _db;
}

export { schema };
