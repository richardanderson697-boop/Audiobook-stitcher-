import React, { useRef, useEffect, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Disc3,
} from 'lucide-react';
import { AudioChapter, AudiobookMetadata } from '../types';
import { formatTime } from '../utils/audioProcessor';

interface AudioPlayerBarProps {
  currentChapter: AudioChapter | null;
  allChapters: AudioChapter[];
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSelectChapter: (chapter: AudioChapter) => void;
  metadata: AudiobookMetadata;
  coverUrl: string | null;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  currentChapter,
  allChapters,
  isPlaying,
  onTogglePlay,
  onSelectChapter,
  metadata,
  coverUrl,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Update audio source when chapter changes
  useEffect(() => {
    if (!currentChapter) {
      setAudioUrl(null);
      return;
    }

    let url: string | null = null;
    if (currentChapter.blob) {
      url = URL.createObjectURL(currentChapter.blob);
    } else if (currentChapter.file) {
      url = URL.createObjectURL(currentChapter.file);
    } else if (currentChapter.arrayBuffer) {
      const blob = new Blob([currentChapter.arrayBuffer], { type: 'audio/mp3' });
      url = URL.createObjectURL(blob);
    }

    setAudioUrl(url);
    setCurrentTime(0);

    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [currentChapter]);

  // Handle play/pause state synchronization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => {
        // Autoplay may be restricted by browser until user gesture
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, audioUrl]);

  // Handle volume & rate changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
      audioRef.current.playbackRate = playbackRate;
    }
  }, [volume, isMuted, playbackRate]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
      if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
        setDuration(audioRef.current.duration);
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const skipSeconds = (secs: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + secs));
    }
  };

  const handleNextChapter = () => {
    if (!currentChapter) return;
    const currentIndex = allChapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex >= 0 && currentIndex < allChapters.length - 1) {
      onSelectChapter(allChapters[currentIndex + 1]);
    }
  };

  const handlePrevChapter = () => {
    if (!currentChapter) return;
    const currentIndex = allChapters.findIndex((c) => c.id === currentChapter.id);
    if (currentIndex > 0) {
      onSelectChapter(allChapters[currentIndex - 1]);
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    setPlaybackRate(rates[nextIdx]);
  };

  if (!currentChapter) return null;

  const currentIdx = allChapters.findIndex((c) => c.id === currentChapter.id);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-stone-900/95 backdrop-blur-md border-t border-stone-800 shadow-2xl px-4 py-2.5">
      <audio
        ref={audioRef}
        src={audioUrl || undefined}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
        onEnded={handleNextChapter}
      />

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left: Track & Cover info */}
        <div className="flex items-center gap-3 w-full md:w-1/4 min-w-0">
          <div className="w-11 h-11 rounded-lg overflow-hidden bg-stone-950 border border-stone-700 shrink-0 flex items-center justify-center">
            {coverUrl ? (
              <img src={coverUrl} alt="Cover" className="w-full h-full object-cover" />
            ) : (
              <Disc3 className="w-6 h-6 text-amber-500 animate-spin-slow" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded font-mono">
                CH {currentIdx + 1}
              </span>
              <h4 className="text-xs font-semibold text-stone-100 truncate">
                {currentChapter.title}
              </h4>
            </div>
            <p className="text-[11px] text-stone-400 truncate">
              {metadata.title || 'Audiobook'} • {metadata.author || 'Narrator'}
            </p>
          </div>
        </div>

        {/* Center: Controls & Scrubber */}
        <div className="flex flex-col items-center gap-1 w-full md:w-2/4">
          {/* Action buttons */}
          <div className="flex items-center gap-3">
            {/* Prev Chapter */}
            <button
              type="button"
              onClick={handlePrevChapter}
              disabled={currentIdx <= 0}
              className="p-1.5 text-stone-400 hover:text-stone-100 disabled:opacity-30 transition-colors"
              title="Previous Chapter"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            {/* Skip 15s Back */}
            <button
              type="button"
              onClick={() => skipSeconds(-15)}
              className="p-1.5 text-stone-400 hover:text-stone-100 transition-colors relative"
              title="Skip 15s back"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-stone-400">15</span>
            </button>

            {/* Play/Pause */}
            <button
              type="button"
              onClick={onTogglePlay}
              className="w-10 h-10 rounded-full bg-amber-500 hover:bg-amber-400 text-stone-950 flex items-center justify-center shadow-md shadow-amber-500/30 transition-transform active:scale-95"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 ml-0.5 fill-current" />
              )}
            </button>

            {/* Skip 15s Forward */}
            <button
              type="button"
              onClick={() => skipSeconds(15)}
              className="p-1.5 text-stone-400 hover:text-stone-100 transition-colors relative"
              title="Skip 15s forward"
            >
              <RotateCw className="w-4 h-4" />
              <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-stone-400">15</span>
            </button>

            {/* Next Chapter */}
            <button
              type="button"
              onClick={handleNextChapter}
              disabled={currentIdx >= allChapters.length - 1}
              className="p-1.5 text-stone-400 hover:text-stone-100 disabled:opacity-30 transition-colors"
              title="Next Chapter"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>

          {/* Scrubber Bar */}
          <div className="w-full flex items-center gap-2 text-[11px] font-mono text-stone-400">
            <span className="w-10 text-right">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || currentChapter.duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 accent-amber-500 h-1 bg-stone-700 rounded-lg cursor-pointer"
            />
            <span className="w-10 text-left">
              {formatTime(duration || currentChapter.duration)}
            </span>
          </div>
        </div>

        {/* Right: Speed & Volume */}
        <div className="hidden md:flex items-center justify-end gap-3 w-1/4 text-xs">
          {/* Speed Toggle */}
          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-400 font-mono font-bold rounded-lg border border-stone-700 transition-colors"
            title="Cycle playback speed"
          >
            {playbackRate}x
          </button>

          {/* Volume */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsMuted(!isMuted)}
              className="text-stone-400 hover:text-stone-200"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4 text-red-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-stone-300" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                setIsMuted(false);
              }}
              className="w-16 accent-amber-500 h-1 bg-stone-700 rounded cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
