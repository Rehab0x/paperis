import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Paperis — From papers to practice",
    short_name: "Paperis",
    description: "바쁜 의료인을 위한 PubMed 최신 연구 큐레이션",
    // 설치 사용자 = 이미 로그인·익숙한 사용자라 랜딩 건너뛰고 앱으로 직행
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Paperis warm editorial 톤 — 라이트 모드 배경 + 액센트 오렌지
    background_color: "#fafaf7",
    theme_color: "#c44b1e",
    lang: "ko",
    categories: ["medical", "education", "productivity"],
    icons: [
      // SVG (vector) — 지원 브라우저는 어떤 사이즈에도 깔끔
      {
        src: "/icons/paperis-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
