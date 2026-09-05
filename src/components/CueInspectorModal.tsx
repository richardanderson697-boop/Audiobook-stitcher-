import React, { useState } from 'react';
import { X, Copy, Download, Check, FileArchive, Clock } from 'lucide-react';
import { AudioChapter, AudiobookMetadata } from '../types';
import { generateCueSheet, generateM3u8Playlist, formatTime } from '../utils/audioProcessor';

interface CueInspectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: AudioChapter[];
  metadata: AudiobookMetadata;
}

export const CueInspectorModal: React.FC<CueInspectorModalProps> = ({
  isOpen,
  onClose,
  chapters,
  metadata,
}) => {
  const [activeTab, setActiveTab] = useState<'cue' | 'm3u8' | 'table'>('cue');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const cueSheet = generateCueSheet(metadata, chapters, `${metadata.title || 'Audiobook'}.mp3`);
  const m3u8 = generateM3u8Playlist(metadata, chapters);

  const handleCopy = () => {
    const textToCopy = activeTab === 'cue' ? cueSheet : m3u8;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const content = activeTab === 'cue' ? cueSheet : m3u8;
    const ext = activeTab === 'cue' ? 'cue' : 'm3u8';
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chapters.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden text-stone-100 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
              <FileArchive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-100">
                CUE Sheet & Chapter Index Inspector
              </h3>
              <p className="text-xs text-stone-400">
                Precise timestamp index for CD burning, media players, and DAWs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-stone-400 hover:text-stone-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs & Actions */}
        <div className="px-6 py-2.5 bg-stone-950/60 border-b border-stone-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('cue')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'cue'
                  ? 'bg-stone-800 text-amber-400 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              CUE Sheet (.cue)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('m3u8')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'm3u8'
                  ? 'bg-stone-800 text-amber-400 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              M3U8 Playlist (.m3u8)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeTab === 'table'
                  ? 'bg-stone-800 text-amber-400 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Chapter Index Table
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs">
            {activeTab !== 'table' && (
              <>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" /> Copy
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download File
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 flex-1 overflow-y-auto font-mono text-xs text-stone-300">
          {activeTab === 'cue' && (
            <pre className="p-4 bg-stone-950 rounded-xl border border-stone-800 overflow-x-auto whitespace-pre leading-relaxed text-amber-200/90 selection:bg-amber-500 selection:text-stone-950">
              {cueSheet}
            </pre>
          )}

          {activeTab === 'm3u8' && (
            <pre className="p-4 bg-stone-950 rounded-xl border border-stone-800 overflow-x-auto whitespace-pre leading-relaxed text-cyan-200/90 selection:bg-cyan-500 selection:text-stone-950">
              {m3u8}
            </pre>
          )}

          {activeTab === 'table' && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-stone-800 text-[11px] text-stone-400 uppercase tracking-wider font-sans">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Chapter Title</th>
                    <th className="py-2 px-3">Start Time</th>
                    <th className="py-2 px-3">Duration</th>
                    <th className="py-2 px-3">File Name</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/60 font-sans text-xs">
                  {chapters.map((ch, idx) => (
                    <tr key={ch.id} className="hover:bg-stone-800/30">
                      <td className="py-2.5 px-3 font-mono text-amber-400 font-bold">
                        {(idx + 1).toString().padStart(2, '0')}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-stone-200">{ch.title}</td>
                      <td className="py-2.5 px-3 font-mono text-stone-300">
                        {formatTime(ch.startOffset)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-stone-400">
                        {ch.formattedDuration}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-stone-500 truncate max-w-xs">
                        {ch.originalFileName}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-stone-800 bg-stone-950/40 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium text-stone-300 bg-stone-800 hover:bg-stone-700 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
