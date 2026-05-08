import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import PlayerBar from "@/components/PlayerBar";
import PlayerProvider from "@/components/PlayerProvider";
import ApiKeysProvider from "@/components/ApiKeysProvider";
import AuthSessionProvider from "@/components/AuthSessionProvider";
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

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthSessionProvider>
          <ThemeProvider>
            <ApiKeysProvider>
              <TtsProviderPreferenceProvider>
                <TtsQueueProvider>
                  <PlayerProvider>
                    {children}
                    <PlayerBar />
                    <TtsCompletionToast />
                  </PlayerProvider>
                </TtsQueueProvider>
              </TtsProviderPreferenceProvider>
            </ApiKeysProvider>
          </ThemeProvider>
        </AuthSessionProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
