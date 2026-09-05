import React from 'react';
import { BookOpen, Sparkles, Trash2, Download, Disc3, Clock, Layers, FileArchive } from 'lucide-react';
import { AudioChapter, AudiobookMetadata } from '../types';
import { formatTime, formatBytes } from '../utils/audioProcessor';

interface HeaderProps {
  metadata: AudiobookMetadata;
  chapters: AudioChapter[];
  onLoadSample: () => void;
  onClear: () => void;
  onOpenExport: () => void;
  onOpenCue: () => void;
  isLoadingSample: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  metadata,
  chapters,
  onLoadSample,
  onClear,
  onOpenExport,
  onOpenCue,
  isLoadingSample,
}) => {
  const totalDuration = chapters.reduce((sum, ch) => sum + (ch.duration || 0), 0);
  const totalSize = chapters.reduce((sum, ch) => sum + (ch.size || 0), 0);

  return (
    <header className="bg-stone-900 border-b border-stone-800 sticky top-0 z-30 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-md shadow-amber-900/30 text-stone-950 font-bold">
            <Disc3 className="w-6 h-6 animate-spin-slow text-stone-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-stone-100 flex items-center gap-2">
                Audiobook Stitcher & Chapter Studio
              </h1>
              <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full">
                ID3v2 & ZIP Engine
              </span>
            </div>
            <p className="text-xs text-stone-400">
              Drag-and-drop MP3s & ZIPs • Custom Artwork • Sequencing • Seamless Audio Stitching
            </p>
          </div>
        </div>

        {/* Quick Stats & Action Buttons */}
        <div className="flex items-center flex-wrap gap-2.5">
          {chapters.length > 0 && (
            <div className="hidden md:flex items-center gap-3 bg-stone-950/60 border border-stone-800 rounded-lg px-3 py-1.5 text-xs text-stone-300">
              <span className="flex items-center gap-1 text-amber-400 font-medium">
                <Layers className="w-3.5 h-3.5" />
                {chapters.length} {chapters.length === 1 ? 'Chapter' : 'Chapters'}
              </span>
              <span className="text-stone-600">•</span>
              <span className="flex items-center gap-1 text-stone-300">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                {formatTime(totalDuration)}
              </span>
              <span className="text-stone-600">•</span>
              <span className="text-stone-400 font-mono text-[11px]">
                {formatBytes(totalSize)}
              </span>
            </div>
          )}

          {/* Sample Demo Button */}
          <button
            id="load-sample-btn"
            type="button"
            onClick={onLoadSample}
            disabled={isLoadingSample}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-700/40 rounded-lg transition-colors disabled:opacity-50"
            title="Load sample chapters & artwork for quick testing"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isLoadingSample ? 'animate-spin' : ''}`} />
            {isLoadingSample ? 'Loading Demo...' : 'Load Sample Audiobook'}
          </button>

          {chapters.length > 0 && (
            <>
              {/* CUE Inspector */}
              <button
                id="view-cue-btn"
                type="button"
                onClick={onOpenCue}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors"
                title="View CUE Sheet & Chapter Timestamps"
              >
                <FileArchive className="w-3.5 h-3.5 text-stone-400" />
                CUE Sheet
              </button>

              {/* Clear Project */}
              <button
                id="clear-project-btn"
                type="button"
                onClick={onClear}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-400 hover:text-red-400 bg-stone-800/60 hover:bg-red-950/30 border border-stone-700/60 rounded-lg transition-colors"
                title="Clear current chapters and start fresh"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>

              {/* Stitch & Export Button */}
              <button
                id="header-export-btn"
                type="button"
                onClick={onOpenExport}
                className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold text-stone-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-lg shadow-md shadow-amber-950/40 transition-all transform active:scale-95"
              >
                <Download className="w-4 h-4" />
                Stitch & Export
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
