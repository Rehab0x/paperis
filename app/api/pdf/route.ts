import type { NextRequest } from "next/server";

// unpdf 내부의 pdfjs-dist가 Promise.try를 사용하는데 Node 22.13 미만엔 없음.
// 서버 부팅 시 한 번만 폴리필.
{
  const P = Promise as unknown as { try?: unknown };
  if (typeof P.try !== "function") {
    P.try = function promiseTry(fn: (...args: unknown[]) => unknown, ...args: unknown[]) {
      return new Promise((resolve, reject) => {
        try {
          Promise.resolve(fn(...args)).then(resolve, reject);
        } catch (err) {
          reject(err);
        }
      });
    };
  }
}

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const MIN_CHARS = 200; // 이보다 적으면 스캔 이미지형 PDF로 간주

export async function POST(request: NextRequest) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "multipart/form-data 요청만 지원합니다." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { error: "file 필드에 PDF 파일이 필요합니다." },
      { status: 400 }
    );
  }
  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return Response.json(
      { error: "PDF 파일만 업로드할 수 있습니다." },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `파일 크기가 ${Math.round(MAX_BYTES / 1024 / 1024)}MB를 초과합니다.` },
      { status: 413 }
    );
  }

  try {
    // unpdf: 서버리스/번들러 친화적인 pdfjs-dist 래퍼. worker 경로 이슈 없음.
    const { extractText } = await import("unpdf");
    const buffer = new Uint8Array(await file.arrayBuffer());
    const { text: pages, totalPages } = await extractText(buffer, {
      mergePages: false,
    });
    const text = (Array.isArray(pages) ? pages.join("\n\n") : String(pages))
      .replace(/\s+\n/g, "\n")
      .trim();
    if (text.length < MIN_CHARS) {
      return Response.json(
        {
          error:
            "PDF에서 추출한 텍스트가 너무 짧습니다. 스캔 이미지형 PDF라면 OCR된 원본이 필요합니다.",
        },
        { status: 422 }
      );
    }
    return Response.json({
      text,
      pages: totalPages,
      chars: text.length,
      filename: file.name,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "알 수 없는 오류";
    console.error("[api/pdf]", err);
    return Response.json(
      { error: `PDF 파싱 중 오류가 발생했습니다: ${message}` },
      { status: 500 }
    );
  }
}
