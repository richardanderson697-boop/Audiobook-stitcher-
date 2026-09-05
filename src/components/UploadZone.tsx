import React, { useRef, useState } from 'react';
import { Upload, FileAudio, FileArchive, Image as ImageIcon, CheckCircle2, AlertCircle, Loader2, FolderUp } from 'lucide-react';
import { UploadProgressItem } from '../types';
import { formatBytes } from '../utils/audioProcessor';
import { extractFilesFromDataTransfer } from '../utils/fileExtractor';

interface UploadZoneProps {
  onFilesSelected: (files: FileList | File[]) => void;
  progressItems: UploadProgressItem[];
  isProcessing: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFilesSelected,
  progressItems,
  isProcessing,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const lastDropTimestampRef = useRef<number>(0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const now = Date.now();
    if (now - lastDropTimestampRef.current < 500) {
      return;
    }
    lastDropTimestampRef.current = now;

    try {
      const dt = e.nativeEvent.dataTransfer || e.dataTransfer;
      const files = await extractFilesFromDataTransfer(dt);
      if (files.length > 0) {
        onFilesSelected(files);
      }
    } catch (err) {
      console.error('Error reading dropped files:', err);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesSelected(Array.from(e.dataTransfer.files));
      }
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileArray = Array.from(e.target.files);
      onFilesSelected(fileArray);
    }
  };

  const openAudioPicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const openZipPicker = () => {
    if (zipInputRef.current) {
      zipInputRef.current.value = '';
      zipInputRef.current.click();
    }
  };

  const openFolderPicker = () => {
    if (folderInputRef.current) {
      folderInputRef.current.value = '';
      folderInputRef.current.click();
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Target Area */}
      <div
        id="drag-drop-upload-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-6 sm:p-8 transition-all text-center ${
          isDragOver
            ? 'border-amber-400 bg-amber-500/10 scale-[1.008] shadow-xl shadow-amber-500/10'
            : 'border-stone-700 hover:border-stone-500 bg-stone-900/60 hover:bg-stone-900/90'
        }`}
      >
        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,.mp3,.wav,.m4a,.m4b,.aac,.ogg,.flac,.wma,.opus,.aiff,.zip,image/jpeg,image/png,image/webp"
          onChange={handleFileInputChange}
          className="hidden"
          id="audio-multi-file-input"
        />
        <input
          ref={folderInputRef}
          type="file"
          {...({ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          id="folder-input"
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileInputChange}
          className="hidden"
          id="zip-file-input"
        />

        <div className="max-w-xl mx-auto flex flex-col items-center">
          {/* Icons row */}
          <div className="flex items-center justify-center gap-3 mb-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <FileAudio className="w-6 h-6" />
            </div>
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <FileArchive className="w-6 h-6" />
            </div>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <ImageIcon className="w-6 h-6" />
            </div>
          </div>

          <h3 className="text-base sm:text-lg font-semibold text-stone-100 mb-1">
            Drag and Drop MP3 Chapters or ZIP Archive Here
          </h3>
          <p className="text-xs sm:text-sm text-stone-400 mb-5 leading-relaxed max-w-md">
            Upload multiple audio files or a compressed <code className="text-amber-400">.zip</code> package. ZIP files are canonically unpacked, cover art is auto-detected, and chapters are sequenced.
          </p>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              id="select-audio-files-btn"
              type="button"
              onClick={openAudioPicker}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-stone-100 bg-stone-800 hover:bg-stone-700 border border-stone-600 rounded-xl transition-all shadow-sm active:scale-95 disabled:opacity-50"
            >
              <Upload className="w-4 h-4 text-amber-400" />
              Select MP3 / Audio Files
            </button>

            <button
              id="select-zip-btn"
              type="button"
              onClick={openZipPicker}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-cyan-200 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/60 rounded-xl transition-all active:scale-95 disabled:opacity-50"
            >
              <FileArchive className="w-4 h-4 text-cyan-400" />
              Upload .ZIP Archive
            </button>

            <button
              id="select-folder-btn"
              type="button"
              onClick={openFolderPicker}
              disabled={isProcessing}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium text-stone-400 hover:text-stone-200 bg-stone-900/80 hover:bg-stone-800 border border-stone-700 rounded-xl transition-all active:scale-95 disabled:opacity-50"
              title="Upload entire audiobook folder"
            >
              <FolderUp className="w-4 h-4 text-stone-400" />
              Upload Folder
            </button>
          </div>

          {/* Supported Format Badges */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-5 text-[11px] text-stone-500 font-mono">
            <span className="px-2 py-0.5 bg-stone-800/80 rounded border border-stone-700">.MP3</span>
            <span className="px-2 py-0.5 bg-stone-800/80 rounded border border-stone-700">.M4B / .M4A</span>
            <span className="px-2 py-0.5 bg-stone-800/80 rounded border border-stone-700">.WAV</span>
            <span className="px-2 py-0.5 bg-stone-800/80 rounded border border-stone-700">.ZIP Archive</span>
            <span className="px-2 py-0.5 bg-stone-800/80 rounded border border-stone-700">JPG / PNG Artwork</span>
          </div>

          {typeof window !== 'undefined' && window.self !== window.top && (
            <p className="mt-3 text-[11px] text-stone-400">
              💡 Tip: Click <strong className="text-amber-300">Select MP3 / Audio Files</strong> or <strong className="text-cyan-300">Upload .ZIP Archive</strong> for instant file dialog, or use <strong className="text-amber-300">Open in New Tab</strong> above for native full-window drag & drop.
            </p>
          )}
        </div>
      </div>

      {/* Progress Bars for Multi-File & ZIP uploads */}
      {progressItems.length > 0 && (
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 space-y-3 shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 className={`w-4 h-4 text-amber-400 ${isProcessing ? 'animate-spin' : ''}`} />
              <h4 className="text-xs font-semibold text-stone-200 uppercase tracking-wider">
                Upload & Extraction Progress ({progressItems.filter(p => p.status === 'done').length}/{progressItems.length})
              </h4>
            </div>
            {isProcessing && (
              <span className="text-[11px] text-amber-400 font-medium animate-pulse">
                Processing audio stream...
              </span>
            )}
          </div>

          <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
            {progressItems.map((item) => (
              <div
                key={item.id}
                className="bg-stone-950/70 border border-stone-800 rounded-xl p-3 text-xs space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {item.fileType === 'zip' ? (
                      <FileArchive className="w-4 h-4 text-cyan-400 shrink-0" />
                    ) : item.fileType === 'image' ? (
                      <ImageIcon className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <FileAudio className="w-4 h-4 text-amber-400 shrink-0" />
                    )}
                    <span className="font-medium text-stone-200 truncate">{item.fileName}</span>
                    {item.fileSize > 0 && (
                      <span className="text-stone-500 font-mono text-[10px] shrink-0">
                        ({formatBytes(item.fileSize)})
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.status === 'done' ? (
                      <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                      </span>
                    ) : item.status === 'error' ? (
                      <span className="flex items-center gap-1 text-red-400 text-[11px] font-medium">
                        <AlertCircle className="w-3.5 h-3.5" /> Failed
                      </span>
                    ) : (
                      <span className="text-amber-400 font-mono text-[11px] font-semibold">
                        {Math.round(item.progress)}%
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress bar line */}
                <div className="w-full h-1.5 bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      item.status === 'done'
                        ? 'bg-emerald-500'
                        : item.status === 'error'
                        ? 'bg-red-500'
                        : 'bg-gradient-to-r from-amber-500 to-amber-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, item.progress))}%` }}
                  />
                </div>

                {/* Stage description */}
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <span className="truncate">{item.stage}</span>
                  {item.errorMessage && (
                    <span className="text-red-400 truncate max-w-xs">{item.errorMessage}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
