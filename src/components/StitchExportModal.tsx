import React, { useState } from 'react';
import {
  X,
  Download,
  Disc3,
  FileArchive,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileAudio,
  FileText,
  ListMusic,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Music,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { AudioChapter, AudiobookMetadata, StitchExportOptions } from '../types';
import { stitchMasterAudiobook, formatTime, formatBytes, extractChapterSortKey } from '../utils/audioProcessor';
import { packageSequencedAudiobookZip } from '../utils/zipHandler';

interface StitchExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: AudioChapter[];
  metadata: AudiobookMetadata;
  coverImageBlob: Blob | null;
  onReorder?: (newChapters: AudioChapter[]) => void;
}

export const StitchExportModal: React.FC<StitchExportModalProps> = ({
  isOpen,
  onClose,
  chapters,
  metadata,
  coverImageBlob,
  onReorder,
}) => {
  const [format, setFormat] = useState<'stitched_mp3' | 'tagged_zip' | 'both'>('stitched_mp3');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressStage, setProgressStage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOrderReview, setShowOrderReview] = useState(true);

  if (!isOpen) return null;

  const totalDuration = chapters.reduce((sum, ch) => sum + (ch.duration || 0), 0);

  // Missing chapter 1 check
  const detectMissingChapter1 = () => {
    if (chapters.length === 0) return null;
    let minDetectedNum: number | null = null;
    let hasZeroOrPrologue = false;

    for (const ch of chapters) {
      const key = extractChapterSortKey(ch.originalFileName || ch.title);
      if (key.prefixRank <= 20) {
        hasZeroOrPrologue = true;
      }
      if (key.chapterNum !== null) {
        if (minDetectedNum === null || key.chapterNum < minDetectedNum) {
          minDetectedNum = key.chapterNum;
        }
      }
    }

    if (!hasZeroOrPrologue && minDetectedNum !== null && minDetectedNum > 1) {
      return minDetectedNum;
    }
    return null;
  };

  const missingChapter1Start = detectMissingChapter1();

  const handleMoveChapter = (index: number, direction: 'up' | 'down') => {
    if (!onReorder) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= chapters.length) return;

    const updated = [...chapters];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;

    // Recalculate offsets
    let currentOffset = 0;
    const recomputed = updated.map((ch, idx) => {
      const startOffset = currentOffset;
      const endOffset = startOffset + (ch.duration || 0);
      currentOffset = endOffset;
      return {
        ...ch,
        trackNumber: idx + 1,
        startOffset,
        endOffset,
      };
    });

    onReorder(recomputed);
  };

  const handleSetPosition = (fromIndex: number, targetPos1Indexed: number) => {
    if (!onReorder) return;
    const targetIndex = Math.max(0, Math.min(chapters.length - 1, targetPos1Indexed - 1));
    if (fromIndex === targetIndex) return;

    const updated = [...chapters];
    const [movedItem] = updated.splice(fromIndex, 1);
    updated.splice(targetIndex, 0, movedItem);

    let currentOffset = 0;
    const recomputed = updated.map((ch, idx) => {
      const startOffset = currentOffset;
      const endOffset = startOffset + (ch.duration || 0);
      currentOffset = endOffset;
      return {
        ...ch,
        trackNumber: idx + 1,
        startOffset,
        endOffset,
      };
    });

    onReorder(recomputed);
  };

  const handleStartExport = async () => {
    setIsProcessing(true);
    setProgressPercent(5);
    setProgressStage('Initializing audio stitcher engine...');
    setErrorMessage(null);
    setIsSuccess(false);

    try {
      // Prepare artwork data if present
      let artworkData: { mimeType: string; data: Uint8Array } | undefined;
      if (coverImageBlob) {
        const arrayBuf = await coverImageBlob.arrayBuffer();
        artworkData = {
          mimeType: coverImageBlob.type || 'image/jpeg',
          data: new Uint8Array(arrayBuf),
        };
      }

      const bookTitleSafe = metadata.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'audiobook';

      // 1. If format includes single stitched MP3
      if (format === 'stitched_mp3' || format === 'both') {
        setProgressStage('Stitching audio chapters and synthesizing master stream...');
        const stitchedResult = await stitchMasterAudiobook(
          chapters,
          metadata,
          artworkData,
          (pct, stage) => {
            const scaled = format === 'both' ? Math.round(pct * 0.5) : pct;
            setProgressPercent(scaled);
            setProgressStage(stage);
          }
        );

        // Trigger Master MP3 download
        const url = URL.createObjectURL(stitchedResult.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${bookTitleSafe}_Complete_Audiobook.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      // 2. If format includes tagged ZIP package
      if (format === 'tagged_zip' || format === 'both') {
        setProgressStage('Building canonical ZIP package with tagged tracks and CUE sheet...');
        const zipBlob = await packageSequencedAudiobookZip(
          chapters,
          metadata,
          artworkData,
          (pct, stage) => {
            const scaled = format === 'both' ? 50 + Math.round(pct * 0.5) : pct;
            setProgressPercent(scaled);
            setProgressStage(stage);
          }
        );

        // Trigger ZIP download
        const zipUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        a.href = zipUrl;
        a.download = `${bookTitleSafe}_Audiobook_Package.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(zipUrl);
      }

      setProgressPercent(100);
      setProgressStage('Export complete! Download started.');
      setIsSuccess(true);

      // Trigger celebration confetti
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#d97706', '#10b981', '#38bdf8'],
        });
      } catch {
        // Ignore confetti if blocked
      }
    } catch (err) {
      console.error(err);
      setErrorMessage(err instanceof Error ? err.message : 'Stitching/packaging failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm animate-fade-in">
      <div className="bg-stone-900 border border-stone-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden text-stone-100 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-100">Stitch & Export Audiobook</h3>
              <p className="text-xs text-stone-400">
                {chapters.length} Chapters • Total: <span className="text-amber-400 font-mono">{formatTime(totalDuration)}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 text-stone-400 hover:text-stone-200 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Missing Chapter 1 Notice */}
          {missingChapter1Start && (
            <div className="p-3 bg-amber-950/40 border border-amber-600/50 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong>Notice: Sequence starts with Chapter {missingChapter1Start}.</strong>
                <p className="text-amber-300/80 text-[11px] mt-0.5">
                  If Chapter 1 is missing, you can close this modal and click "Insert Missing Chapter 1" or adjust track orders below.
                </p>
              </div>
            </div>
          )}

          {/* Interactive Chapter Verification & Rearrangement Section */}
          <div className="border border-stone-800 bg-stone-950/60 rounded-xl p-3 space-y-2">
            <button
              type="button"
              onClick={() => setShowOrderReview(!showOrderReview)}
              className="w-full flex items-center justify-between text-xs font-semibold text-stone-300 hover:text-stone-100"
            >
              <span className="flex items-center gap-1.5 text-amber-400">
                <ListMusic className="w-4 h-4" />
                Stitch Sequence Verification ({chapters.length} chapters in order)
              </span>
              <span className="text-stone-500 flex items-center gap-1 text-[11px]">
                {showOrderReview ? 'Collapse' : 'Expand / Reorder'}
                {showOrderReview ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </span>
            </button>

            {showOrderReview && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 pt-1">
                {chapters.map((ch, idx) => (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between gap-2 p-2 bg-stone-900/90 border border-stone-800 rounded-lg text-xs hover:border-stone-700"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Position Select */}
                      <select
                        value={idx + 1}
                        onChange={(e) => handleSetPosition(idx, parseInt(e.target.value, 10))}
                        className="w-8 h-6 bg-stone-800 border border-stone-700 rounded text-center text-amber-400 font-mono font-bold text-[11px]"
                        title="Change chapter position"
                      >
                        {chapters.map((_, p) => (
                          <option key={p} value={p + 1}>
                            {p + 1}
                          </option>
                        ))}
                      </select>

                      <div className="min-w-0">
                        <p className="font-medium text-stone-200 truncate text-[11px]" title={ch.title}>
                          {ch.title}
                        </p>
                        <p className="text-[10px] text-stone-400 font-mono">
                          Starts at {formatTime(ch.startOffset)} • ({ch.formattedDuration})
                        </p>
                      </div>
                    </div>

                    {/* Move Up/Down buttons */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMoveChapter(idx, 'up')}
                        disabled={idx === 0}
                        className="p-1 text-stone-400 hover:text-amber-400 disabled:opacity-20 hover:bg-stone-800 rounded"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleMoveChapter(idx, 'down')}
                        disabled={idx === chapters.length - 1}
                        className="p-1 text-stone-400 hover:text-amber-400 disabled:opacity-20 hover:bg-stone-800 rounded"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Format selection */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-stone-300 uppercase tracking-wider">
              Select Export Output Format
            </label>
            <div className="grid grid-cols-1 gap-2">
              {/* Option 1: Stitched Master MP3 */}
              <div
                onClick={() => !isProcessing && setFormat('stitched_mp3')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  format === 'stitched_mp3'
                    ? 'border-amber-400 bg-amber-950/20 ring-1 ring-amber-400'
                    : 'border-stone-800 bg-stone-950/60 hover:bg-stone-850'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                  <FileAudio className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold text-stone-100">
                      Single Stitched Master MP3 File
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-medium">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Seamless master MP3 with embedded ID3v2 cover artwork, duration metadata, and chapter points.
                  </p>
                </div>
              </div>

              {/* Option 2: Structured ZIP Package */}
              <div
                onClick={() => !isProcessing && setFormat('tagged_zip')}
                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  format === 'tagged_zip'
                    ? 'border-cyan-400 bg-cyan-950/20 ring-1 ring-cyan-400'
                    : 'border-stone-800 bg-stone-950/60 hover:bg-stone-850'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0 mt-0.5">
                  <FileArchive className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-stone-100">
                    Sequenced Audiobook ZIP Package
                  </h4>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Individual ID3-tagged chapter MP3s, <code className="text-cyan-300">cover.jpg</code>, and <code className="text-cyan-300">chapters.cue</code>.
                  </p>
                </div>
              </div>

              {/* Option 3: Both */}
              <div
                onClick={() => !isProcessing && setFormat('both')}
                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                  format === 'both'
                    ? 'border-amber-400 bg-amber-950/20 ring-1 ring-amber-400'
                    : 'border-stone-800 bg-stone-950/60 hover:bg-stone-850'
                }`}
              >
                <Layers className="w-4 h-4 text-stone-400 shrink-0" />
                <div className="flex-1 text-xs">
                  <span className="font-semibold text-stone-200">Both Master MP3 & ZIP Package</span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress or Status */}
          {isProcessing && (
            <div className="p-4 bg-stone-950 rounded-xl border border-amber-500/30 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-amber-400 font-medium flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {progressStage}
                </span>
                <span className="font-mono text-amber-300 font-bold">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 bg-stone-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {isSuccess && (
            <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Audiobook successfully generated and downloaded to your device!
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-800 bg-stone-950/40 flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="px-4 py-2 text-xs font-medium text-stone-400 hover:text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-xl transition-colors disabled:opacity-50"
          >
            Close
          </button>
          <button
            id="start-export-stitch-btn"
            type="button"
            onClick={handleStartExport}
            disabled={isProcessing || chapters.length === 0}
            className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-stone-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl shadow-lg shadow-amber-950/50 transition-all active:scale-95 disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                Stitching Audiobook...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 text-stone-950" />
                Start Stitch & Download
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
