// 공통 타입 정의

export type NeedFilter = "treatment" | "diagnosis" | "trend" | "balanced";

export type Language = "ko" | "en";

export type ListenStyle = "narration" | "dialogue";

export type AccessLevel = "open" | "closed";

export interface Paper {
  pmid: string;
  title: string;
  abstract: string;
  authors: string[];
  journal: string;
  year: string;
  pubDate: string;
  doi: string | null;
  pmcId: string | null;
  publicationTypes: string[];
  access: AccessLevel;
  url: string;
}

export interface PubmedSearchRequest {
  query: string;
  filter?: NeedFilter;
  retmax?: number;
}

export interface PubmedSearchResponse {
  /** 이번 페이지에 실제로 반환된 논문 수 */
  count: number;
  /** PubMed의 총 검색 결과 수 (페이지네이션 계산용) */
  total: number;
  papers: Paper[];
}

export interface ApiError {
  error: string;
}

export interface RecommendWeights {
  recency: number;
  citations: number;
  journal: number;
  niche: number;
}

export const DEFAULT_RECOMMEND_WEIGHTS: RecommendWeights = {
  recency: 50,
  citations: 50,
  journal: 50,
  niche: 50,
};

export interface ScoreBreakdown {
  total: number;
  recency: number; // 0..1
  citations: number; // 0..1
  journal: number; // 0..1
  niche: number; // 0..1
}

export interface EnrichmentData {
  pmid: string;
  citedByCount: number;
  publicationYear: number | null;
  journalName: string | null;
  /** OpenAlex 2yr_mean_citedness — IF에 가까운 저널 수준 영향력 지표 */
  journalCitedness: number | null;
}

export interface Recommendation {
  pmid: string;
  reason: string;
  /** 결정론적 스코어링 결과. 0..1 정규화된 4축 + 합산 */
  score?: ScoreBreakdown;
  /** 카드에 표시할 가장 강한 한 가지 요인 라벨 */
  topFactor?: "recency" | "citations" | "journal" | "niche";
}

export interface RecommendRequest {
  papers: Paper[];
  filter?: NeedFilter;
  language?: Language;
  weights?: Partial<RecommendWeights>;
}

export interface RecommendResponse {
  recommendations: Recommendation[];
}

export interface RelatedRequest {
  paper: Paper;
  hint?: string;
  excludePmids?: string[];
}

export interface RelatedResponse {
  /** Gemini가 생성한 PubMed 검색식 */
  query: string;
  /** 어떤 각도로 검색했는지 한 줄 설명 */
  note: string;
  papers: Paper[];
}
