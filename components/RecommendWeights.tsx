"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import {
  DEFAULT_RECOMMEND_WEIGHTS,
  type RecommendWeights,
} from "@/types";

const STORAGE_KEY = "paperis.recommend.weights.v1";

const AXES: {
  key: keyof RecommendWeights;
  label: string;
  hint: string;
}[] = [
  { key: "recency", label: "최신성", hint: "최근에 출판된 논문 우선" },
  { key: "citations", label: "인용수", hint: "다른 연구에서 많이 인용" },
  { key: "journal", label: "저널 영향력", hint: "권위 있는 저널 우선" },
  { key: "niche", label: "니즈 적합도", hint: "선택한 필터(치료/진단 등)에 부합" },
];

interface Props {
  value: RecommendWeights;
  onChange: (next: RecommendWeights) => void;
}

export function loadStoredWeights(): RecommendWeights {
  if (typeof window === "undefined") return DEFAULT_RECOMMEND_WEIGHTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_RECOMMEND_WEIGHTS;
    const parsed = JSON.parse(raw) as Partial<RecommendWeights>;
    return {
      recency: clamp(parsed.recency ?? DEFAULT_RECOMMEND_WEIGHTS.recency),
      citations: clamp(parsed.citations ?? DEFAULT_RECOMMEND_WEIGHTS.citations),
      journal: clamp(parsed.journal ?? DEFAULT_RECOMMEND_WEIGHTS.journal),
      niche: clamp(parsed.niche ?? DEFAULT_RECOMMEND_WEIGHTS.niche),
    };
  } catch {
    return DEFAULT_RECOMMEND_WEIGHTS;
  }
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 50;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

export default function RecommendWeights({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  // value 변경 시 localStorage에 저장 (부모가 호출자)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // ignore quota/private mode
    }
  }, [value]);

  function update(key: keyof RecommendWeights, e: ChangeEvent<HTMLInputElement>) {
    const next = { ...value, [key]: clamp(Number(e.target.value)) };
    onChange(next);
  }

  function reset() {
    onChange(DEFAULT_RECOMMEND_WEIGHTS);
  }

  const isDefault =
    value.recency === DEFAULT_RECOMMEND_WEIGHTS.recency &&
    value.citations === DEFAULT_RECOMMEND_WEIGHTS.citations &&
    value.journal === DEFAULT_RECOMMEND_WEIGHTS.journal &&
    value.niche === DEFAULT_RECOMMEND_WEIGHTS.niche;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-amber-800 dark:text-amber-300"
      >
        <span className="flex items-center gap-2">
          추천 가중치
          {!isDefault ? (
            <span className="rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-800/60 dark:text-amber-100">
              조정됨
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2 text-[10px] text-amber-700 dark:text-amber-400">
          {AXES.map((a) => (
            <span key={a.key} className="hidden sm:inline">
              {a.label.charAt(0)}:{value[a.key]}
            </span>
          ))}
          <span>{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open ? (
        <div className="grid grid-cols-1 gap-3 border-t border-amber-200/60 px-3 py-3 sm:grid-cols-2 dark:border-amber-900/40">
          {AXES.map((a) => (
            <label key={a.key} className="flex flex-col gap-1">
              <span className="flex items-baseline justify-between text-[11px] text-amber-900 dark:text-amber-200">
                <span className="font-medium">{a.label}</span>
                <span className="font-mono text-amber-700 dark:text-amber-400">
                  {value[a.key]}
                </span>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={value[a.key]}
                onChange={(e) => update(a.key, e)}
                className="h-2 w-full cursor-pointer accent-amber-700 dark:accent-amber-400"
                aria-label={a.hint}
              />
              <span className="text-[10px] text-amber-700/80 dark:text-amber-400/70">
                {a.hint}
              </span>
            </label>
          ))}
          <div className="col-span-full flex items-center justify-between text-[11px]">
            <span className="text-amber-800/80 dark:text-amber-300/70">
              가중치를 바꾸면 추천 3편이 다시 계산됩니다.
            </span>
            <button
              type="button"
              onClick={reset}
              disabled={isDefault}
              className="rounded-full border border-amber-300 px-3 py-1 font-medium text-amber-800 transition hover:border-amber-500 disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-800 dark:text-amber-200"
            >
              기본값으로
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
