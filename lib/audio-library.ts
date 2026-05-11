// IndexedDB 기반 오디오 라이브러리.
// idb 라이브러리로 IDBRequest 콜백 지옥을 회피.
// TTS 변환 결과(WAV Blob)를 트랙 단위로 저장. 라이브러리 페이지에서 position asc로 표시.
//
// DB version 2 (v2.0.1):
//   - tracks 스토어에 by-position 인덱스 추가
//   - 기존 트랙들은 createdAt asc 기준으로 position 0,1,2,... 자동 부여
//   - 사용자가 트랙 순서를 위/아래로 변경 가능 (moveUp/moveDown)

"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { AudioTrack, AudioTrackMeta, Language, Paper } from "@/types";

const DB_NAME = "paperis-audio";
const DB_VERSION = 2;
const STORE = "tracks";
const CHANNEL_NAME = "paperis-audio-library";

export const AUDIO_LIBRARY_EVENT = "paperis:audio-library-changed";

interface PaperisAudioSchema {
  [STORE]: {
    key: string;
    value: AudioTrack;
    indexes: {
      "by-pmid": string;
      "by-createdAt": number;
      "by-position": number;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PaperisAudioSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<PaperisAudioSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<PaperisAudioSchema>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by-pmid", "pmid");
          store.createIndex("by-createdAt", "createdAt");
          store.createIndex("by-position", "position");
        }
        if (oldVersion < 2) {
          // 기존 트랙에 position 필드를 채우고 by-position 인덱스 추가.
          const store = tx.objectStore(STORE);
          if (!store.indexNames.contains("by-position")) {
            store.createIndex("by-position", "position");
          }
          const all = await store.getAll();
          all.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
          let idx = 0;
          for (const t of all) {
            if (typeof (t as AudioTrack).position !== "number") {
              (t as AudioTrack).position = idx;
              await store.put(t);
            }
            idx += 1;
          }
        }
      },
    });
  }
  return dbPromise;
}

let bc: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined") return null;
  if (typeof BroadcastChannel === "undefined") return null;
  if (!bc) bc = new BroadcastChannel(CHANNEL_NAME);
  return bc;
}

function notifyChange(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(AUDIO_LIBRARY_EVENT));
  } catch {
    // CustomEvent 미지원 환경 무시
  }
  const ch = getChannel();
  ch?.postMessage({ type: "changed", at: Date.now() });
}

export interface AppendTrackInput {
  paper: Paper;
  language: Language;
  voice: string;
  providerName: string;
  audioBlob: Blob;
  durationMs: number;
  narrationText?: string;
  /** 영어 제목의 한국어 번역 (한국어 TTS만, 서버가 동봉) */
  titleKo?: string;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `track-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function nextPosition(
  db: IDBPDatabase<PaperisAudioSchema>
): Promise<number> {
  // by-position 인덱스의 마지막 값 +1
  const cursor = await db
    .transaction(STORE)
    .store.index("by-position")
    .openCursor(null, "prev");
  if (!cursor) return 0;
  return (cursor.value.position ?? -1) + 1;
}

export async function appendTrack(input: AppendTrackInput): Promise<AudioTrack> {
  const db = await getDb();
  const position = await nextPosition(db);
  const track: AudioTrack = {
    id: newId(),
    pmid: input.paper.pmid,
    title: input.paper.title,
    authors: input.paper.authors.slice(0, 3),
    journal: input.paper.journal,
    year: input.paper.year,
    language: input.language,
    voice: input.voice,
    providerName: input.providerName,
    audioBlob: input.audioBlob,
    durationMs: input.durationMs,
    createdAt: Date.now(),
    position,
    paperSnapshot: input.paper,
    narrationText: input.narrationText,
    titleKo: input.titleKo,
  };
  await db.add(STORE, track);
  notifyChange();
  return track;
}

/**
 * 라이브러리 목록 조회 — audioBlob을 제외한 메타만 반환.
 * cursor로 record를 순회하면서 메타 객체를 새로 만들어 audioBlob 참조를 끊는다.
 * 모든 트랙의 큰 Blob을 동시에 메모리에 들고 있지 않아 STATUS_ACCESS_VIOLATION 회피.
 */
export async function listTrackMetas(): Promise<AudioTrackMeta[]> {
  const db = await getDb();
  const out: AudioTrackMeta[] = [];
  const tx = db.transaction(STORE, "readonly");
  const index = tx.store.index("by-position");
  let cursor = await index.openCursor();
  while (cursor) {
    const v = cursor.value as AudioTrack;
    out.push({
      id: v.id,
      pmid: v.pmid,
      title: v.title,
      authors: v.authors,
      journal: v.journal,
      year: v.year,
      language: v.language,
      voice: v.voice,
      providerName: v.providerName,
      durationMs: v.durationMs,
      createdAt: v.createdAt,
      position: v.position,
      paperSnapshot: v.paperSnapshot,
      narrationText: v.narrationText,
      titleKo: v.titleKo,
      audioByteSize: v.audioBlob?.size ?? 0,
    });
    cursor = await cursor.continue();
  }
  await tx.done;
  return out;
}

/** 재생 직전 호출 — 해당 트랙의 audioBlob만 가져온다. */
export async function getTrackAudio(id: string): Promise<Blob | null> {
  const db = await getDb();
  const t = await db.get(STORE, id);
  return t?.audioBlob ?? null;
}

export async function getTrack(id: string): Promise<AudioTrack | undefined> {
  const db = await getDb();
  return db.get(STORE, id);
}

export async function getTrackByPmid(
  pmid: string
): Promise<AudioTrack | undefined> {
  const db = await getDb();
  return db.getFromIndex(STORE, "by-pmid", pmid);
}

export async function removeTrack(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE, id);
  notifyChange();
}

export async function clearTracks(): Promise<void> {
  const db = await getDb();
  await db.clear(STORE);
  notifyChange();
}

export async function countTracks(): Promise<number> {
  const db = await getDb();
  return db.count(STORE);
}

// 인접 트랙과 position swap. 라이브러리 표시 순서를 사용자가 직접 조정.
async function swapPositionWithNeighbor(
  id: string,
  direction: "up" | "down"
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const all = await store.index("by-position").getAll();
  const idx = all.findIndex((t) => t.id === id);
  if (idx < 0) {
    await tx.done;
    return;
  }
  const neighborIdx = direction === "up" ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= all.length) {
    await tx.done;
    return;
  }
  const a = all[idx];
  const b = all[neighborIdx];
  const tmp = a.position;
  a.position = b.position;
  b.position = tmp;
  await store.put(a);
  await store.put(b);
  await tx.done;
  notifyChange();
}

export async function moveTrackUp(id: string): Promise<void> {
  return swapPositionWithNeighbor(id, "up");
}
export async function moveTrackDown(id: string): Promise<void> {
  return swapPositionWithNeighbor(id, "down");
}

// ─────────────────────────────────────────────
// 백업 / 복원 (export JSON + import)
// ─────────────────────────────────────────────

interface ExportedTrack extends Omit<AudioTrack, "audioBlob"> {
  /** WAV/MP3 바이너리를 base64로 직렬화 */
  audioBase64: string;
  audioMime: string;
}

export interface LibraryExport {
  version: 1;
  exportedAt: number;
  tracks: ExportedTrack[];
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const result = fr.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader 결과가 문자열이 아닙니다."));
        return;
      }
      // result는 "data:<mime>;base64,<payload>" 형식 → payload만 추출
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    fr.onerror = () => reject(fr.error ?? new Error("FileReader 오류"));
    fr.readAsDataURL(blob);
  });
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * 라이브러리 전체를 JSON으로 export. audioBlob은 base64 인코딩되어 한 파일에 묶임.
 * 트랙 50편이면 50–200MB가 될 수 있으므로 큰 메모리 작업이라 사용 시 사용자 안내 필수.
 */
export async function exportLibrary(): Promise<LibraryExport> {
  const db = await getDb();
  const all = await db.getAllFromIndex(STORE, "by-position");
  const tracks: ExportedTrack[] = [];
  for (const t of all) {
    const audioBase64 = await blobToBase64(t.audioBlob);
    tracks.push({
      id: t.id,
      pmid: t.pmid,
      title: t.title,
      authors: t.authors,
      journal: t.journal,
      year: t.year,
      language: t.language,
      voice: t.voice,
      providerName: t.providerName,
      durationMs: t.durationMs,
      createdAt: t.createdAt,
      position: t.position,
      paperSnapshot: t.paperSnapshot,
      narrationText: t.narrationText,
      audioBase64,
      audioMime: t.audioBlob.type || "audio/wav",
    });
  }
  return { version: 1, exportedAt: Date.now(), tracks };
}

/**
 * import한 트랙을 라이브러리에 추가. 기존 트랙은 그대로, 같은 id면 새 id로 발급.
 * position은 현재 라이브러리 끝에 이어 붙임.
 */
export async function importLibrary(
  data: LibraryExport
): Promise<{ added: number; skipped: number }> {
  if (!data || data.version !== 1 || !Array.isArray(data.tracks)) {
    throw new Error("잘못된 백업 파일 형식입니다.");
  }
  const db = await getDb();
  let added = 0;
  let skipped = 0;
  let position = await nextPosition(db);
  for (const t of data.tracks) {
    if (typeof t.audioBase64 !== "string" || !t.audioBase64) {
      skipped += 1;
      continue;
    }
    try {
      const blob = base64ToBlob(t.audioBase64, t.audioMime || "audio/wav");
      const restored: AudioTrack = {
        id: newId(),
        pmid: t.pmid,
        title: t.title,
        authors: t.authors ?? [],
        journal: t.journal ?? "",
        year: t.year ?? "",
        language: t.language,
        voice: t.voice ?? "",
        providerName: t.providerName ?? "",
        audioBlob: blob,
        durationMs: t.durationMs ?? 0,
        createdAt: t.createdAt ?? Date.now(),
        position,
        paperSnapshot: t.paperSnapshot,
        narrationText: t.narrationText,
      };
      await db.add(STORE, restored);
      added += 1;
      position += 1;
    } catch (err) {
      console.warn("[audio-library] import 트랙 실패", err);
      skipped += 1;
    }
  }
  if (added > 0) notifyChange();
  return { added, skipped };
}

// 라이브러리 변경 이벤트 구독 — 같은 탭의 CustomEvent + 다른 탭의 BroadcastChannel 모두.
export function subscribeAudioLibrary(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener(AUDIO_LIBRARY_EVENT, handler);
  const ch = getChannel();
  const onMsg = () => callback();
  ch?.addEventListener("message", onMsg);
  return () => {
    window.removeEventListener(AUDIO_LIBRARY_EVENT, handler);
    ch?.removeEventListener("message", onMsg);
  };
}
