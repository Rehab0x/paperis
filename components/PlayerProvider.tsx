"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { getTrackAudio } from "@/lib/audio-library";
import type { AudioTrackMeta } from "@/types";

interface PlayerState {
  queue: AudioTrackMeta[];
  currentIndex: number; // -1 if no track loaded
  isPlaying: boolean;
  currentTimeMs: number;
  durationMs: number;
}

interface PlayerControls {
  playFromIndex: (queue: AudioTrackMeta[], index: number) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seekBy: (deltaMs: number) => void;
  seekTo: (ms: number) => void;
  stop: () => void;
}

type PlayerContextValue = PlayerState & PlayerControls;

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) {
    throw new Error("usePlayer는 PlayerProvider 안에서만 호출되어야 합니다.");
  }
  return ctx;
}

export default function PlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const queueRef = useRef<AudioTrackMeta[]>([]);
  const indexRef = useRef(-1);

  const [queue, setQueue] = useState<AudioTrackMeta[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);

  // refs 동기화
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

  // 오디오 엘리먼트 생성 + 이벤트 리스너 등록
  useEffect(() => {
    if (typeof window === "undefined") return;
    const a = new Audio();
    a.preload = "auto";
    audioRef.current = a;

    const onTimeUpdate = () => setCurrentTimeMs(a.currentTime * 1000);
    const onLoaded = () => setDurationMs(a.duration * 1000);
    const onEnded = () => {
      const q = queueRef.current;
      const i = indexRef.current;
      if (i < 0 || i + 1 >= q.length) {
        setIsPlaying(false);
        return;
      }
      void loadAndPlay(i + 1);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnded);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);

    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadAndPlay = useCallback(async (newIndex: number) => {
    const q = queueRef.current;
    const meta = q[newIndex];
    const a = audioRef.current;
    if (!meta || !a) return;

    // 메타에는 audioBlob이 없으므로 재생 직전에 IndexedDB에서 따로 로드.
    // 이 시점에만 Blob이 메모리에 올라옴 → 라이브러리 목록은 가벼움.
    let blob: Blob | null = null;
    try {
      blob = await getTrackAudio(meta.id);
    } catch (err) {
      console.warn("[player] 트랙 audio 로드 실패", err);
    }
    if (!blob) return;

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;

    setCurrentIndex(newIndex);
    setCurrentTimeMs(0);
    setDurationMs(meta.durationMs || 0);
    a.src = url;
    void a.play().catch((err) => {
      console.warn("[player] play 실패", err);
    });
  }, []);

  const playFromIndex = useCallback(
    (newQueue: AudioTrackMeta[], index: number) => {
      if (newQueue.length === 0 || index < 0 || index >= newQueue.length) return;
      setQueue(newQueue);
      queueRef.current = newQueue;
      void loadAndPlay(index);
    },
    [loadAndPlay]
  );

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => {});
    } else {
      a.pause();
    }
  }, []);

  const next = useCallback(() => {
    const i = indexRef.current;
    const q = queueRef.current;
    if (i < 0 || i + 1 >= q.length) return;
    void loadAndPlay(i + 1);
  }, [loadAndPlay]);

  const prev = useCallback(() => {
    const i = indexRef.current;
    const a = audioRef.current;
    // 트랙 시작 후 3초 이상이면 처음으로 되감기, 그 전이면 진짜 이전 트랙
    if (i >= 0 && a && a.currentTime > 3) {
      a.currentTime = 0;
      return;
    }
    if (i <= 0) return;
    void loadAndPlay(i - 1);
  }, [loadAndPlay]);

  const seekBy = useCallback((deltaMs: number) => {
    const a = audioRef.current;
    if (!a) return;
    const target = Math.max(0, Math.min(a.duration, a.currentTime + deltaMs / 1000));
    a.currentTime = target;
  }, []);

  const seekTo = useCallback((ms: number) => {
    const a = audioRef.current;
    if (!a) return;
    const target = Math.max(0, Math.min(a.duration || ms / 1000, ms / 1000));
    a.currentTime = target;
  }, []);

  const stop = useCallback(() => {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setQueue([]);
    queueRef.current = [];
    setCurrentIndex(-1);
    indexRef.current = -1;
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setDurationMs(0);
  }, []);

  // 글로벌 키보드 단축키 — 입력 필드에 포커스가 있으면 무시
  useEffect(() => {
    if (typeof window === "undefined") return;
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (indexRef.current < 0) return;
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (e.shiftKey) prev();
        else seekBy(-10000);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (e.shiftKey) next();
        else seekBy(10000);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [togglePlay, prev, next, seekBy]);

  const value: PlayerContextValue = {
    queue,
    currentIndex,
    isPlaying,
    currentTimeMs,
    durationMs,
    playFromIndex,
    togglePlay,
    next,
    prev,
    seekBy,
    seekTo,
    stop,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}
