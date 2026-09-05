import React from 'react';
import { Book, User, Mic, Calendar, Bookmark, Folder, FileText, Sparkles } from 'lucide-react';
import { AudiobookMetadata } from '../types';

interface MetadataEditorProps {
  metadata: AudiobookMetadata;
  onChange: (updates: Partial<AudiobookMetadata>) => void;
  onAutoSuggest: () => void;
}

export const MetadataEditor: React.FC<MetadataEditorProps> = ({
  metadata,
  onChange,
  onAutoSuggest,
}) => {
  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4 shadow-md">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Book className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-stone-200">Audiobook & ID3 Tag Metadata</h3>
            <p className="text-xs text-stone-400">Embedded into MP3 frames and CUE sheets</p>
          </div>
        </div>

        <button
          id="auto-suggest-metadata-btn"
          type="button"
          onClick={onAutoSuggest}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 rounded-lg transition-colors"
          title="Auto-detect metadata from chapter filenames"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Auto-Detect
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
        {/* Book Title */}
        <div className="space-y-1">
          <label className="text-stone-300 font-medium flex items-center gap-1.5">
            <Book className="w-3.5 h-3.5 text-amber-400" />
            Audiobook Title
          </label>
          <input
            id="input-book-title"
            type="text"
            value={metadata.title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="e.g. The Chronicles of Eldoria"
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Author */}
        <div className="space-y-1">
          <label className="text-stone-300 font-medium flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-amber-400" />
            Author / Creator
          </label>
          <input
            id="input-book-author"
            type="text"
            value={metadata.author}
            onChange={(e) => onChange({ author: e.target.value })}
            placeholder="e.g. Arthur Conan Doyle"
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Narrator */}
        <div className="space-y-1">
          <label className="text-stone-300 font-medium flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-amber-400" />
            Narrator / Voice Artist
          </label>
          <input
            id="input-book-narrator"
            type="text"
            value={metadata.narrator}
            onChange={(e) => onChange({ narrator: e.target.value })}
            placeholder="e.g. Stephen Fry"
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Series & Volume */}
        <div className="space-y-1">
          <label className="text-stone-300 font-medium flex items-center gap-1.5">
            <Bookmark className="w-3.5 h-3.5 text-amber-400" />
            Series & Volume
          </label>
          <input
            id="input-book-series"
            type="text"
            value={metadata.series}
            onChange={(e) => onChange({ series: e.target.value })}
            placeholder="e.g. Book 1 of 3"
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
          />
        </div>

        {/* Year & Genre */}
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-stone-300 font-medium flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              Year
            </label>
            <input
              id="input-book-year"
              type="text"
              value={metadata.year}
              onChange={(e) => onChange({ year: e.target.value })}
              placeholder="2026"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
          <div className="space-y-1">
            <label className="text-stone-300 font-medium">Genre</label>
            <input
              id="input-book-genre"
              type="text"
              value={metadata.genre}
              onChange={(e) => onChange({ genre: e.target.value })}
              placeholder="Audiobook / Sci-Fi"
              className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>
        </div>

        {/* Output Folder Name */}
        <div className="space-y-1">
          <label className="text-stone-300 font-medium flex items-center gap-1.5">
            <Folder className="w-3.5 h-3.5 text-amber-400" />
            Audiobook Folder Name
          </label>
          <input
            id="input-book-folder"
            type="text"
            value={metadata.folderName}
            onChange={(e) => onChange({ folderName: e.target.value })}
            placeholder="e.g. My_Audiobook_2026"
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors font-mono"
          />
        </div>

        {/* Description / Summary */}
        <div className="md:col-span-2 space-y-1">
          <label className="text-stone-300 font-medium flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            Synopsis / Book Description
          </label>
          <textarea
            id="input-book-description"
            rows={2}
            value={metadata.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="Enter a brief synopsis to embed into the ID3 comment tags and metadata.json..."
            className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-500 transition-colors resize-none"
          />
        </div>
      </div>
    </div>
  );
};
