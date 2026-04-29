// IndexedDB 기반 오디오 라이브러리.
// idb 라이브러리로 IDBRequest 콜백 지옥을 회피.
// TTS 변환 결과(WAV Blob)를 트랙 단위로 저장. 라이브러리 페이지에서 createdAt desc로 표시.

"use client";

import { openDB, type IDBPDatabase } from "idb";
import type { AudioTrack, Language, Paper } from "@/types";

const DB_NAME = "paperis-audio";
const DB_VERSION = 1;
const STORE = "tracks";
const CHANNEL_NAME = "paperis-audio-library";

export const AUDIO_LIBRARY_EVENT = "paperis:audio-library-changed";

interface PaperisAudioSchema {
  [STORE]: {
    key: string;
    value: AudioTrack;
    indexes: { "by-pmid": string; "by-createdAt": number };
  };
}

let dbPromise: Promise<IDBPDatabase<PaperisAudioSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<PaperisAudioSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<PaperisAudioSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by-pmid", "pmid");
          store.createIndex("by-createdAt", "createdAt");
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

export async function appendTrack(input: AppendTrackInput): Promise<AudioTrack> {
  const db = await getDb();
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
    paperSnapshot: input.paper,
  };
  await db.add(STORE, track);
  notifyChange();
  return track;
}

export async function listTracks(): Promise<AudioTrack[]> {
  const db = await getDb();
  // by-createdAt index로 ascending → 뒤집어서 desc 반환
  const all = await db.getAllFromIndex(STORE, "by-createdAt");
  return all.reverse();
}

export async function getTrack(id: string): Promise<AudioTrack | undefined> {
  const db = await getDb();
  return db.get(STORE, id);
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
