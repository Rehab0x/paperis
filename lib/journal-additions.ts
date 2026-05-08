// 사용자가 임상과에 직접 추가한 저널 — 카탈로그 시드/자동 추천 외에 본인이
// 신뢰하는 저널을 즉석에서 추가. localStorage 기반 (M4에서 user_journal_additions
// 테이블로 마이그레이션 예정).
//
// 저장 단위는 JournalSummary 그대로 — OpenAlex 다시 호출하지 않도록 메타까지 함께
// 저장(이름·publisher·issnL·counts 등). OpenAlex source ID로 dedupe.

import type { JournalSummary } from "@/lib/openalex";

const STORAGE_KEY = "paperis.journal_additions";
const EVENT_NAME = "paperis:journal-additions-changed";

/** specialtyId → 추가된 저널 목록 (사용자가 추가한 순서 유지) */
type Additions = Record<string, JournalSummary[]>;

function isJournalSummary(v: unknown): v is JournalSummary {
  if (typeof v !== "object" || v === null) return false;
  const j = v as Record<string, unknown>;
  return typeof j.openAlexId === "string" && typeof j.name === "string";
}

function readStored(): Additions {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return {};
    const out: Additions = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) {
        const journals = v.filter(isJournalSummary);
        if (journals.length > 0) out[k] = journals;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function persist(next: Additions): void {
  try {
    const clean: Additions = {};
    for (const [k, v] of Object.entries(next)) {
      if (Array.isArray(v) && v.length > 0) clean[k] = v;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // private mode 등
  }
}

function notify(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // ignore
  }
}

export function getAddedJournals(specialtyId: string): JournalSummary[] {
  return readStored()[specialtyId] ?? [];
}

export function getAllAddedJournals(): Additions {
  return readStored();
}

export function addJournal(
  specialtyId: string,
  journal: JournalSummary
): void {
  if (!specialtyId || !journal.openAlexId) return;
  const all = readStored();
  const list = all[specialtyId] ?? [];
  if (list.some((j) => j.openAlexId === journal.openAlexId)) return;
  all[specialtyId] = [...list, journal];
  persist(all);
  notify();
}

export function removeAddedJournal(
  specialtyId: string,
  openAlexId: string
): void {
  if (!specialtyId || !openAlexId) return;
  const all = readStored();
  const list = all[specialtyId];
  if (!list) return;
  const next = list.filter((j) => j.openAlexId !== openAlexId);
  if (next.length === list.length) return;
  if (next.length === 0) {
    delete all[specialtyId];
  } else {
    all[specialtyId] = next;
  }
  persist(all);
  notify();
}

export function subscribeJournalAdditions(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
