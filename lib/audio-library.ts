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
import type { AudioTrack, Language, Paper } from "@/types";

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
  };
  await db.add(STORE, track);
  notifyChange();
  return track;
}

export async function listTracks(): Promise<AudioTrack[]> {
  const db = await getDb();
  // by-position asc → 사용자가 보고 싶어 하는 순서
  return db.getAllFromIndex(STORE, "by-position");
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
