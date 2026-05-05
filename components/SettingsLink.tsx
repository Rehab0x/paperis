"use client";

import { useState } from "react";
import SettingsDrawer from "@/components/SettingsDrawer";

export default function SettingsLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="앱 설정 열기"
        title="앱 설정"
        className={
          className ??
          "inline-flex items-center justify-center rounded-md p-1.5 text-lg text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
        }
      >
        ⚙
      </button>
      <SettingsDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
