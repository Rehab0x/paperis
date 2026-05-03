// Paperis v2 공통 타입

export type Language = "ko" | "en";
export type SortMode = "recency" | "citations" | "relevance";
export type AccessLevel = "open" | "closed";
export type PaperType = "research" | "review";
export type FullTextSource = "unpaywall" | "europepmc" | "pmc" | "pdf";

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
  // OpenAlex enrichment (없으면 undefined). 클라 정렬·표시에 사용.
  citedByCount?: number;
  journalCitedness?: number | null;
}

export interface EnrichmentData {
  pmid: string;
  citedByCount: number;
  publicationYear: number | null;
  journalName: string | null;
  journalCitedness: number | null;
}

export interface ApiError {
  error: string;
}

// /api/search
export interface SearchRequest {
  q: string;
  sort: SortMode;
  retmax?: number;
  retstart?: number;
}

export interface SearchResponse {
  query: string;     // Gemini가 만든 PubMed 검색식
  note: string;      // 검색 각도 한 줄 설명
  papers: Paper[];
  total: number;
  sort: SortMode;
  cached: boolean;   // 검색식 캐시 hit 여부
}

// /api/summarize
export interface MiniSummary {
  pmid: string;
  paperType: PaperType;
  bullets: string[];
}

export interface SummarizeMiniRequest {
  papers: Paper[];
  language?: Language;
}

export interface SummarizeMiniResponse {
  summaries: MiniSummary[];
}

export interface SummarizeReadRequest {
  paper: Paper;
  language?: Language;
  sourceLabel?: string;
}

// /api/fulltext
export interface FullTextRequest {
  pmid: string;
  doi?: string | null;
  pmcId?: string | null;
}

export interface FullTextSuccess {
  ok: true;
  text: string;
  source: FullTextSource;
  sourceUrl?: string;
  charCount: number;
}

export interface FullTextAttempt {
  source: FullTextSource;
  /** 시도 자체를 못 한 경우의 사유 (예: DOI 없음, 환경변수 미설정) */
  skipReason?: string;
  /** 시도했으나 결과가 없거나 실패한 사유 */
  failReason?: string;
}

export interface FullTextFailure {
  ok: false;
  attempted: FullTextAttempt[];
}

export type FullTextResponse = FullTextSuccess | FullTextFailure;

// /api/tts
export interface TtsRequestBody {
  paper: Paper;
  language: Language;
  providerName?: string;
  voice?: string;
  sourceLabel?: string;   // 풀텍스트 첨부 시 narration 생성에 반영
}

// Audio library (IndexedDB 저장 레코드).
// position: 라이브러리 표시 순서. 사용자가 위/아래로 이동시키면 swap된다.
//   DB version 2에서 도입. 새로 append되는 트랙은 max(position) + 1로 자동 부여.
//   기존 트랙은 v1→v2 마이그레이션 시 createdAt asc 기준으로 0부터 채워진다.
export interface AudioTrack {
  id: string;
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  language: Language;
  voice: string;
  providerName: string;
  audioBlob: Blob;
  durationMs: number;
  createdAt: number;
  position: number;
  paperSnapshot: Paper;
  /**
   * TTS 합성에 들어간 narration 원문 텍스트.
   * v2.0.2부터 새로 변환되는 트랙에 채워짐. 이전 트랙은 undefined.
   * 재생 중 "스크립트 보기" UI에서 표시.
   */
  narrationText?: string;
}

// 라이브러리 목록 조회용 — audioBlob을 의도적으로 제외해 메모리 폭주를 막는다.
// 트랙 5–10편의 큰 WAV blob을 한꺼번에 로드하면 Chrome 렌더 프로세스가
// STATUS_ACCESS_VIOLATION으로 크래시되는 사례가 있어 v2.0.2부터 분리.
// audioBlob은 재생 직전에 getTrackAudio(id)로 따로 로드한다.
export interface AudioTrackMeta {
  id: string;
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: string;
  language: Language;
  voice: string;
  providerName: string;
  durationMs: number;
  createdAt: number;
  position: number;
  paperSnapshot: Paper;
  narrationText?: string;
  audioByteSize: number;
}
