// PaperCard 상태를 pmid 단위로 세션 메모리에 캐시한다.
// 마스터-디테일 전환 시 상세 패널이 unmount → remount 되어도
// 사용자가 이미 생성한 요약/오디오/연결학습/PDF 상태를 잃지 않도록.
//
// 이 모듈은 React 상태가 아니라 단순 Map이다. 캐시 갱신이 다른
// 컴포넌트 리렌더를 유발할 필요가 없으므로(각 PaperCard는 자기
// 상태만 관리) 이 접근이 충분하다. 페이지 새로고침 시 휘발.

import type { Language, ListenStyle, Paper } from "@/types";

export type SummaryStatus = "idle" | "streaming" | "done" | "error";
export type AudioStatus = "idle" | "generating" | "ready" | "error";
export type RelatedStatus = "idle" | "loading" | "ready" | "error";

export interface AudioState {
  url: string;
  style: ListenStyle;
  language: Language;
  scriptPreview: string;
}

export interface RelatedState {
  query: string;
  note: string;
  papers: Paper[];
}

export interface PdfAttachment {
  text: string;
  filename: string;
  pages: number;
  chars: number;
}

export interface CardState {
  expanded: boolean;
  language: Language;
  summary: string;
  summaryStatus: SummaryStatus;
  summaryError: string;
  audio: AudioState | null;
  audioStatus: AudioStatus;
  audioError: string;
  pendingStyle: ListenStyle | null;
  relatedOpen: boolean;
  relatedHint: string;
  relatedStatus: RelatedStatus;
  related: RelatedState | null;
  relatedError: string;
  pdfAttachment: PdfAttachment | null;
}

export const defaultCardState: CardState = {
  expanded: false,
  language: "ko",
  summary: "",
  summaryStatus: "idle",
  summaryError: "",
  audio: null,
  audioStatus: "idle",
  audioError: "",
  pendingStyle: null,
  relatedOpen: false,
  relatedHint: "",
  relatedStatus: "idle",
  related: null,
  relatedError: "",
  pdfAttachment: null,
};

const cache = new Map<string, CardState>();

export function getCardState(pmid: string): CardState | undefined {
  return cache.get(pmid);
}

export function setCardState(pmid: string, state: CardState): void {
  cache.set(pmid, state);
}
