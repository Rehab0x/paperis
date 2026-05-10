// 저널별 마지막 방문 시각 (localStorage). 홈의 "내 저널" 카드에서 ● 표시
// (새 호 가능성)를 결정하는 데 쓴다.
//
// 정확한 "새 호 발행" 감지는 PubMed/OpenAlex의 issue feed를 fetch해 비교해야
// 하나, 그건 N개 저널 × API 호출이라 비용이 크다. 대신 휴리스틱으로:
//   - 한 번도 방문 안 함 → ● 표시
//   - 14일 이상 안 봤음 → ● 표시 ("그동안 새 호가 나왔을 가능성")
// 정확도는 떨어지지만 사용자에게 "오래 안 본 저널 다시 살펴보라"는 자연스러운
// 넛지가 된다. 향후 필요해지면 latest-issue 라이트 fetch로 정확도 강화 가능.

const STORAGE_KEY = "paperis.journal_visits";
const STALE_MS = 14 * 24 * 60 * 60 * 1000; // 14일

type Visits = Record<string, number>;

function readStored(): Visits {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Visits = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persist(next: Visits): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode 등
  }
}

export function getAllJournalVisits(): Visits {
  return readStored();
}

export function getJournalVisit(openAlexId: string): number | null {
  const all = readStored();
  const v = all[openAlexId];
  return typeof v === "number" ? v : null;
}

/** 저널 페이지 진입 시 호출. lastVisitedAt = now. */
export function markJournalVisited(openAlexId: string): void {
  if (!openAlexId) return;
  const all = readStored();
  all[openAlexId] = Date.now();
  persist(all);
}

/**
 * 표시용 — true면 "새 호 가능성" 인디케이터(●) 노출.
 * - 한 번도 방문 안 했거나 (lastVisitedAt 없음)
 * - 14일 이상 안 봤음
 */
export function shouldShowNewIndicator(openAlexId: string): boolean {
  const last = getJournalVisit(openAlexId);
  if (last == null) return true;
  return Date.now() - last > STALE_MS;
}
