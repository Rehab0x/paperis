"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // dev 환경에서도 등록은 무해 (Next dev에서 /sw.js 404 날 수 있으니 production만)
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => {
        console.warn("[paperis] service worker registration failed:", err);
      });
  }, []);
  return null;
}
