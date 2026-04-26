import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// drizzle-kit CLI에서 .env.local을 명시적으로 로드 (Next.js와 동일한 우선순위)
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set — check .env.local");
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
} satisfies Config;
