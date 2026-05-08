// Auth.js v5 catch-all route — handlers 객체의 GET/POST를 그대로 위임.
// /api/auth/signin, /api/auth/callback/google, /api/auth/session 등 모두 처리.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;

// Auth.js 내부 동작은 dynamic — Next.js의 정적 prerender 대상이 아니다.
export const dynamic = "force-dynamic";
