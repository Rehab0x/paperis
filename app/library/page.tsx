import Link from "next/link";
import AudioLibrary from "@/components/AudioLibrary";
import TtsQueueBadge from "@/components/TtsQueueBadge";

export default function LibraryPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/85 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            Paperis
            <span className="ml-1.5 align-text-top text-[10px] font-mono text-zinc-400">
              v2
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <TtsQueueBadge />
            <Link
              href="/"
              className="rounded-md px-2.5 py-1 text-sm text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              ← 검색으로
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-32">
        <h1 className="mb-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          오디오 라이브러리
        </h1>
        <p className="mb-5 text-sm text-zinc-500">
          TTS 변환된 트랙이 추가된 순서대로 쌓입니다. 트랙을 누르면 그 시점부터
          CD처럼 자동 재생됩니다 (트랙 끝나면 다음 자동).
        </p>
        <AudioLibrary />
      </main>
    </div>
  );
}
