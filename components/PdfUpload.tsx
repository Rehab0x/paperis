"use client";

import { useRef, useState } from "react";
import { useAppMessages } from "@/components/useAppMessages";
import { useFetchWithKeys } from "@/components/useFetchWithKeys";
import { fmt } from "@/lib/i18n";

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
  const m = useAppMessages();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchWithKeys = useFetchWithKeys();

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetchWithKeys("/api/pdf", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as UploadResponse;
      if (!res.ok || !json.text) {
        setError(json.error ?? fmt(m.pdf.uploadFailedStatus, { status: res.status }));
        return;
      }
      onExtracted(json.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : m.pdf.uploadFailed);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-paperis-border bg-paperis-surface-2 p-3 text-sm">
      <p className="text-paperis-text-2">{m.pdf.title}</p>
      <p className="mt-1 text-[11px] text-paperis-text-3">{m.pdf.hint}</p>
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
          className="block w-full text-xs text-paperis-text-2 file:mr-3 file:rounded-lg file:border-0 file:bg-paperis-accent file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-paperis-bg hover:file:opacity-90"
        />
      </div>
      {uploading ? (
        <p className="mt-2 text-xs text-paperis-text-3">{m.pdf.extracting}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-paperis-accent">{error}</p> : null}
    </div>
  );
}
