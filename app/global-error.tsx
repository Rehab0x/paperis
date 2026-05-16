"use client";

// 루트 layout.tsx 자체가 깨졌을 때만 mount되는 마지막 폴백. 자체적으로 <html>·<body>
// 렌더해야 함 (layout이 못 그려졌으니).
//
// 일반 페이지 에러는 app/error.tsx가 잡고, 여기는 폰트·테마·provider 초기화 단계
// 실패 같은 극단 케이스용.

import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          padding: "64px 24px",
          background: "#fafaf7",
          color: "#1a1a1a",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Pretendard Variable', Pretendard, sans-serif",
          minHeight: "100vh",
        }}
      >
        <main
          style={{
            maxWidth: "560px",
            margin: "0 auto",
          }}
        >
          <div style={{ fontSize: "32px" }} aria-hidden>
            ⚠️
          </div>
          <h1
            style={{
              margin: "16px 0 8px",
              fontSize: "24px",
              fontWeight: 500,
              letterSpacing: "-0.01em",
            }}
          >
            앱을 불러올 수 없습니다
          </h1>
          <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#5a564e", lineHeight: 1.6 }}>
            페이지 로딩 중 심각한 오류가 발생했습니다. 새로고침해 보시고, 문제가 계속되면
            잠시 후 다시 들러주세요.
          </p>
          {error.digest ? (
            <p
              style={{
                margin: "0 0 24px",
                fontFamily: "ui-monospace, monospace",
                fontSize: "11px",
                color: "#8a857b",
              }}
            >
              오류 ID: {error.digest}
            </p>
          ) : null}
          <a
            href="/"
            style={{
              display: "inline-block",
              padding: "10px 20px",
              background: "#c44b1e",
              color: "#ffffff",
              textDecoration: "none",
              borderRadius: "8px",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            새로고침
          </a>
        </main>
      </body>
    </html>
  );
}
