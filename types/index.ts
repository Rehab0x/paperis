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
  count: number;
  papers: Paper[];
}

export interface ApiError {
  error: string;
}

export interface Recommendation {
  pmid: string;
  reason: string;
}

export interface RecommendRequest {
  papers: Paper[];
  filter?: NeedFilter;
  language?: Language;
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
