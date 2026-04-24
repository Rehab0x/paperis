import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // unpdf는 내부적으로 pdfjs-dist의 서버리스 빌드를 쓴다. 서버 번들에서 제외.
  serverExternalPackages: ["unpdf", "pdfjs-dist"],
};

export default nextConfig;
