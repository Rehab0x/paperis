"use client";

interface Props {
  src: string;
  label: string;
  onEnded?: () => void;
}

export default function AudioPlayer({ src, label, onEnded }: Props) {
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950/60">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <audio
        src={src}
        controls
        preload="auto"
        onEnded={onEnded}
        className="w-full"
      />
    </div>
  );
}
