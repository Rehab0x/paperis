// /api/pdf — 사용자가 업로드한 PDF에서 텍스트만 추출 (서버 저장 X).
// 풀텍스트 체인이 모두 실패했을 때의 마지막 폴백 슬롯.

import "@/lib/promise-polyfill";
import { NextResponse } from "next/server";
import { extractText } from "unpdf";
import type { ApiError } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 30 * 1024 * 1024; // 30MB

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json<ApiError>(
      { error: "PDF 폼 데이터를 읽지 못했습니다." },
      { status: 400 }
    );
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json<ApiError>(
      { error: "file 필드가 필요합니다." },
      { status: 400 }
    );
  }
  if (file.size === 0) {
    return NextResponse.json<ApiError>(
      { error: "비어있는 파일입니다." },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json<ApiError>(
      { error: "파일이 너무 큽니다 (최대 30MB)." },
      { status: 413 }
    );
  }

  let buf: Uint8Array;
  try {
    buf = new Uint8Array(await file.arrayBuffer());
  } catch {
    return NextResponse.json<ApiError>(
      { error: "파일 본문을 읽지 못했습니다." },
      { status: 400 }
    );
  }

  try {
    const result = await extractText(buf, { mergePages: true });
    const raw = Array.isArray(result.text)
      ? result.text.join("\n\n")
      : (result.text as string);
    const text = (raw ?? "").trim();
    if (!text) {
      return NextResponse.json<ApiError>(
        { error: "PDF에서 텍스트를 추출하지 못했습니다." },
        { status: 422 }
      );
    }
    return NextResponse.json({
      text,
      charCount: text.length,
      pages: result.totalPages ?? null,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF 파싱 실패";
    return NextResponse.json<ApiError>({ error: msg }, { status: 500 });
  }
}
