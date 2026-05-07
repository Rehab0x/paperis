// 임상과 카탈로그 fetch 레이어.
// 카탈로그 자체는 GitHub raw로 받는다 (재배포 없이 GitHub 웹에서 data/journals.json 편집 가능).
// 빌드된 번들에도 동일 파일이 import fallback으로 들어 있어 네트워크 실패 / 오프라인에서도 동작.
//
// 저널 자체는 카탈로그에 저장하지 않는다 — 임상과별 OpenAlex field ID만 보관하고
// 저널 추천은 OpenAlex Sources API가 런타임에 주는 결과를 그대로 쓴다.

import localCatalog from "@/data/journals.json";

export interface Specialty {
  /** 영구 식별자 — URL slug, DB FK 등에 사용 */
  id: string;
  /** UI에 표시되는 한국어 이름 */
  name: string;
  /** OpenAlex / 영문 표기 */
  nameEn: string;
  /**
   * OpenAlex subfield URN (예: "subfields/2728"). Works API의
   * `primary_topic.subfield.id` 필터에 그대로 들어간다.
   * fields(26개)는 너무 broad해서 임상과 단위 큐레이션에 안 맞고,
   * subfields(약 250개)가 임상과와 잘 매칭된다.
   */
  openAlexSubfieldId: string;
  /** 주제 탐색 화면의 추천 태그. 자유 입력도 허용 */
  suggestedTopics: string[];
}

export interface JournalCatalog {
  version: number;
  updatedAt: string;
  specialties: Specialty[];
}

const CATALOG_URL =
  "https://raw.githubusercontent.com/Rehab0x/paperis/master/data/journals.json";

const REVALIDATE_SECONDS = 3600;

/**
 * GitHub raw에서 카탈로그를 fetch. 실패 시 빌드 번들에 포함된 로컬 카탈로그로 fallback.
 *
 * Why: 카탈로그를 코드 배포에 묶으면 임상과 추가 한 줄 바꾸려고 vercel deploy를 다시 해야 한다.
 *      GitHub 웹 편집 → 1시간 내 prod 반영 흐름이 운영 부담을 크게 낮춤.
 */
export async function getJournalCatalog(): Promise<JournalCatalog> {
  try {
    const res = await fetch(CATALOG_URL, {
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!res.ok) {
      throw new Error(`catalog fetch ${res.status}`);
    }
    const json = (await res.json()) as JournalCatalog;
    if (!isValidCatalog(json)) {
      throw new Error("catalog payload shape invalid");
    }
    return json;
  } catch (err) {
    console.warn("[journals] remote catalog unavailable, using bundled fallback", err);
    return localCatalog as JournalCatalog;
  }
}

/** 단일 임상과 조회 (id 기준). 없으면 null. */
export async function getSpecialty(id: string): Promise<Specialty | null> {
  const catalog = await getJournalCatalog();
  return catalog.specialties.find((s) => s.id === id) ?? null;
}

function isValidCatalog(value: unknown): value is JournalCatalog {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.version !== "number") return false;
  if (!Array.isArray(v.specialties)) return false;
  for (const s of v.specialties) {
    if (typeof s !== "object" || s === null) return false;
    const sp = s as Record<string, unknown>;
    if (
      typeof sp.id !== "string" ||
      typeof sp.name !== "string" ||
      typeof sp.nameEn !== "string" ||
      typeof sp.openAlexSubfieldId !== "string"
    ) {
      return false;
    }
  }
  return true;
}
