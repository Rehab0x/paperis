// Paperis service worker — 최소 패스스루.
// 목적: Chrome의 PWA 설치 가능 판정용 fetch 핸들러 등록 + 새 SW가 있으면 즉시 활성화.
// 스트리밍 요약(/api/summarize)과 오디오(/api/tts) 응답은 개입하면 깨지므로 그대로 통과.

// VERSION 갱신 → 이전 캐시 자동 삭제. 아이콘 디자인 바뀌었을 때 등 강제 갱신용.
const VERSION = "paperis-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 옛 버전 캐시(paperis-v1, paperis-v2 등) 정리 — 사용자가 새 아이콘 즉시 받게
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith("paperis-") && n !== VERSION)
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API 라우트, 오디오 blob, Next 내부 리소스는 건드리지 않음
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_next/") ||
    url.pathname.startsWith("/sw.js")
  ) {
    return;
  }

  // 정적 자산(아이콘, manifest 등)만 가볍게 캐시 우선 처리
  if (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/favicon.ico"
  ) {
    event.respondWith(
      caches.open(VERSION).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh.ok) cache.put(request, fresh.clone());
        return fresh;
      })
    );
    return;
  }

  // 나머지 경로는 기본 네트워크 동작 (respondWith 호출하지 않음)
});
