"use client";

import { useRef, useState } from "react";

interface Props {
  onExtracted: (text: string) => void;
}

interface UploadResponse {
  text?: string;
  charCount?: number;
  pages?: number | null;
  error?: string;
}

export default function PdfUpload({ onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/pdf", { method: "POST", body: form });
      const json = (await res.json()) as UploadResponse;
      if (!res.ok || !json.text) {
        setError(json.error ?? `업로드 실패 (${res.status})`);
        return;
      }
      onExtracted(json.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p className="text-zinc-600 dark:text-zinc-300">
        풀텍스트를 자동 확보하지 못했습니다. 보유한 PDF가 있다면 업로드해
        주세요.
      </p>
      <p className="mt-1 text-[11px] text-zinc-400">
        업로드된 PDF는 서버에 저장되지 않습니다 (텍스트만 추출).
      </p>
      <div className="mt-2 flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
          className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-zinc-700 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-300"
        />
      </div>
      {uploading ? (
        <p className="mt-2 text-xs text-zinc-500">PDF에서 텍스트 추출 중…</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
