import type { Metadata, Viewport } from "next";
import { Fraunces, Geist_Mono } from "next/font/google";
import "./globals.css";
import PlayerBar from "@/components/PlayerBar";
import PlayerProvider from "@/components/PlayerProvider";
import AccountSyncProvider from "@/components/AccountSyncProvider";
import ApiKeysProvider from "@/components/ApiKeysProvider";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import Footer from "@/components/Footer";
import RegisterSW from "@/components/RegisterSW";
import ThemeProvider from "@/components/ThemeProvider";
import TtsCompletionToast from "@/components/TtsCompletionToast";
import TtsProviderPreferenceProvider from "@/components/TtsProviderPreferenceProvider";
import TtsQueueProvider from "@/components/TtsQueueProvider";

// React hydration 전에 실행되어 dark/light 클래스를 미리 적용 → 첫 페인트 깜박임(FOUC) 방지.
const themeBootScript = `
try {
  var s = localStorage.getItem('paperis.theme');
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = s === 'dark' || (s !== 'light' && prefersDark);
  if (dark) document.documentElement.classList.add('dark');
} catch (e) {}
`;

// Fraunces: 에디토리얼 의학 저널 톤 — 저널명·헤드라인 전용 (font-serif)
// 본문은 Pretendard (한글 가독성). globals.css에서 CDN으로 로드.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paperis — From papers to practice",
  description: "바쁜 의료인을 위한 PubMed 최신 연구 큐레이션",
  applicationName: "Paperis",
  appleWebApp: {
    capable: true,
    title: "Paperis",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${fraunces.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/* Pretendard — 한글 가독성 우선 본문 폰트 (CDN). next/font에 등록 X. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>
          <AccountSyncProvider>
            <ThemeProvider>
              <ApiKeysProvider>
                <TtsProviderPreferenceProvider>
                  <TtsQueueProvider>
                    <PlayerProvider>
                      {children}
                      <Footer />
                      <PlayerBar />
                      <TtsCompletionToast />
                    </PlayerProvider>
                  </TtsQueueProvider>
                </TtsProviderPreferenceProvider>
              </ApiKeysProvider>
            </ThemeProvider>
          </AccountSyncProvider>
        </AuthSessionProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
