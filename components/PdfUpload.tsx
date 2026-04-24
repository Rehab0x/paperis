"use client";

import { useRef, useState } from "react";

interface Props {
  onExtracted: (payload: {
    text: string;
    filename: string;
    pages: number;
    chars: number;
  }) => void;
}

type Status = "idle" | "uploading" | "error";

export default function PdfUpload({ onExtracted }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);

  async function uploadFile(file: File) {
    setStatus("uploading");
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/pdf", { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          (data && typeof data === "object" && "error" in data
            ? String((data as { error: string }).error)
            : "") || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      if (!data || typeof data.text !== "string") {
        throw new Error("서버 응답에 텍스트가 없습니다.");
      }
      onExtracted({
        text: data.text,
        filename: typeof data.filename === "string" ? data.filename : file.name,
        pages: typeof data.pages === "number" ? data.pages : 0,
        chars: typeof data.chars === "number" ? data.chars : data.text.length,
      });
      setStatus("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
      setStatus("error");
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      setStatus("error");
      setError("PDF 파일만 업로드할 수 있습니다.");
      return;
    }
    void uploadFile(file);
  }

  const isUploading = status === "uploading";

  return (
    <div className="flex flex-col gap-2">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!isUploading) handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !isUploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isUploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed px-4 py-5 text-center text-xs transition " +
          (dragOver
            ? "border-zinc-500 bg-zinc-50 dark:border-zinc-400 dark:bg-zinc-900"
            : "border-zinc-300 bg-zinc-50/60 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-950/40 dark:hover:border-zinc-500") +
          (isUploading ? " pointer-events-none opacity-60" : "")
        }
      >
        <span className="font-medium text-zinc-700 dark:text-zinc-200">
          {isUploading ? "PDF 분석 중…" : "PDF 업로드로 Full Text 요약"}
        </span>
        <span className="text-zinc-500 dark:text-zinc-400">
          드래그&드롭하거나 클릭해 파일 선택 · 최대 15MB
        </span>
        <span className="text-[10px] text-zinc-400">
          서버에 저장되지 않으며, 합법적으로 보유한 PDF만 사용하세요.
        </span>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : null}
    </div>
  );
}
