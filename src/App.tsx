import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { UploadZone } from './components/UploadZone';
import { ArtworkDesigner } from './components/ArtworkDesigner';
import { ChapterSequencer } from './components/ChapterSequencer';
import { MetadataEditor } from './components/MetadataEditor';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { StitchExportModal } from './components/StitchExportModal';
import { CueInspectorModal } from './components/CueInspectorModal';
import { AudioChapter, AudiobookMetadata, ArtworkSettings, UploadProgressItem } from './types';
import {
  decodeAudioDetails,
  cleanChapterTitle,
  naturalSortChapters,
  compareChapterFileNames,
  createDemoChapterAudio,
  formatTime,
} from './utils/audioProcessor';
import { canonicallyUnzipAudiobook } from './utils/zipHandler';
import {
  FileAudio,
  FileArchive,
  Layers,
  Sparkles,
  ArrowRight,
  Disc3,
  HelpCircle,
  CheckCircle,
} from 'lucide-react';

const INITIAL_METADATA: AudiobookMetadata = {
  title: 'The Starlight Navigator',
  subtitle: 'A Stellar Voyage',
  author: 'Eleanor Vance',
  narrator: 'James Sterling',
  series: 'The Horizon Chronicles, Vol. 1',
  volumeNumber: '1',
  year: '2026',
  genre: 'Audiobook / Sci-Fi Adventure',
  description: 'An unabridged full-cast audio journey across forgotten constellations.',
  publisher: 'Aether Audio Editions',
  copyright: '© 2026 Starlight Media',
  folderName: 'The_Starlight_Navigator',
};

const INITIAL_ARTWORK: ArtworkSettings = {
  imageUrl: null,
  imageBlob: null,
  aspectRatio: '1:1',
  titleOverlay: true,
  authorOverlay: true,
  badgeText: 'UNABRIDGED AUDIOBOOK',
  showBadge: true,
  themeColor: '#f59e0b',
  gradientOverlay: true,
  fontFamily: 'serif',
  brightness: 100,
  contrast: 100,
  blur: 0,
};

export default function App() {
  const [chapters, setChapters] = useState<AudioChapter[]>([]);
  const [metadata, setMetadata] = useState<AudiobookMetadata>(INITIAL_METADATA);
  const [artworkSettings, setArtworkSettings] = useState<ArtworkSettings>(INITIAL_ARTWORK);
  const [renderedCoverBlob, setRenderedCoverBlob] = useState<Blob | null>(null);
  const [renderedCoverUrl, setRenderedCoverUrl] = useState<string | null>(null);

  // Upload progress tracking
  const [progressItems, setProgressItems] = useState<UploadProgressItem[]>([]);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);
  const [isLoadingSample, setIsLoadingSample] = useState(false);

  // Active audio player state
  const [currentPlayingChapter, setCurrentPlayingChapter] = useState<AudioChapter | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Modals
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isCueOpen, setIsCueOpen] = useState(false);
  const [pendingInsertTargetIndex, setPendingInsertTargetIndex] = useState<number | null>(null);

  // Synchronize start & end offsets whenever chapters reorder or mutate
  const updateChapterOffsets = useCallback((chapterList: AudioChapter[]) => {
    let currentOffset = 0;
    return chapterList.map((ch, idx) => {
      const startOffset = currentOffset;
      const endOffset = startOffset + ch.duration;
      const mins = Math.floor(ch.duration / 60);
      const secs = Math.floor(ch.duration % 60);
      const formattedDuration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      currentOffset = endOffset;
      return {
        ...ch,
        trackNumber: idx + 1,
        startOffset,
        endOffset,
        formattedDuration,
      };
    });
  }, []);

  // Handle uploaded files (MP3s, ZIPs, Photos, Folders)
  const handleFilesSelected = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsProcessingUpload(true);

    // Sort new audio files naturally before decoding to preserve user's intended sequence
    files.sort((a, b) => compareChapterFileNames(a.name, b.name));

    const newProgressItems: UploadProgressItem[] = files.map((f) => ({
      id: `prog_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      fileName: f.name,
      fileSize: f.size,
      fileType: f.name.toLowerCase().endsWith('.zip')
        ? 'zip'
        : f.type.startsWith('image/')
        ? 'image'
        : 'mp3',
      progress: 10,
      stage: 'Reading file...',
      status: 'uploading',
    }));

    setProgressItems((prev) => [...prev, ...newProgressItems]);

    const newChaptersToAdd: AudioChapter[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const progItem = newProgressItems[i];

      const updateProg = (status: UploadProgressItem['status'], progress: number, stage: string, error?: string) => {
        setProgressItems((prev) =>
          prev.map((p) =>
            p.id === progItem.id ? { ...p, status, progress, stage, errorMessage: error } : p
          )
        );
      };

      try {
        const lowerName = file.name.toLowerCase();

        // 1. Is it a ZIP Archive?
        if (lowerName.endsWith('.zip')) {
          updateProg('unzipping', 20, 'Canonically unzipping archive...');
          const unzipResult = await canonicallyUnzipAudiobook(file, (pct, stageMsg) => {
            updateProg('unzipping', pct, stageMsg);
          });

          newChaptersToAdd.push(...unzipResult.chapters);

          // If zip contained cover art, apply it!
          if (unzipResult.coverImageBlob && unzipResult.coverImageUrl) {
            setArtworkSettings((prev) => ({
              ...prev,
              imageUrl: unzipResult.coverImageUrl || prev.imageUrl,
              imageBlob: unzipResult.coverImageBlob || prev.imageBlob,
            }));
          }

          // If detected title from zip folder, update metadata
          if (unzipResult.detectedTitle) {
            setMetadata((prev) => ({
              ...prev,
              title: prev.title === INITIAL_METADATA.title ? unzipResult.detectedTitle! : prev.title,
              folderName: unzipResult.detectedTitle!.replace(/[^a-zA-Z0-9_-]/g, '_'),
            }));
          }

          updateProg('done', 100, `Extracted ${unzipResult.chapters.length} chapter tracks.`);
        }
        // 2. Is it an Image / Photo for Artwork?
        else if (file.type.startsWith('image/') || lowerName.endsWith('.jpg') || lowerName.endsWith('.png') || lowerName.endsWith('.webp')) {
          updateProg('processing', 50, 'Setting custom audiobook cover artwork...');
          const url = URL.createObjectURL(file);
          setArtworkSettings((prev) => ({
            ...prev,
            imageUrl: url,
            imageBlob: file,
            titleOverlay: true,
            authorOverlay: true,
          }));
          updateProg('done', 100, 'Cover artwork attached.');
        }
        // 3. Is it an MP3 / Audio file?
        else if (
          file.type.startsWith('audio/') ||
          lowerName.endsWith('.mp3') ||
          lowerName.endsWith('.wav') ||
          lowerName.endsWith('.m4a') ||
          lowerName.endsWith('.aac') ||
          lowerName.endsWith('.ogg') ||
          lowerName.endsWith('.flac')
        ) {
          updateProg('processing', 40, 'Decoding audio metadata & waveform peaks...');
          const arrayBuffer = await file.arrayBuffer();
          const decoded = await decodeAudioDetails(arrayBuffer, file.name);

          const title = cleanChapterTitle(file.name);
          const duration = decoded.duration;
          const mins = Math.floor(duration / 60);
          const secs = Math.floor(duration % 60);
          const formattedDuration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

          newChaptersToAdd.push({
            id: `ch_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
            title,
            originalFileName: file.name,
            file,
            arrayBuffer,
            blob: file,
            duration,
            formattedDuration,
            size: file.size,
            trackNumber: chapters.length + newChaptersToAdd.length + 1,
            startOffset: 0,
            endOffset: duration,
            sampleRate: decoded.sampleRate,
            waveformPeaks: decoded.waveformPeaks,
            status: 'ready',
          });

          updateProg('done', 100, `Ready: ${formattedDuration}`);
        } else {
          updateProg('error', 100, 'Unsupported file format', 'Only MP3/audio, ZIP, and images supported');
        }
      } catch (err) {
        console.error(err);
        updateProg(
          'error',
          100,
          'Failed to process file',
          err instanceof Error ? err.message : 'Unknown error'
        );
      }
    }

    if (newChaptersToAdd.length > 0) {
      setChapters((prev) => {
        let combined: AudioChapter[];
        if (pendingInsertTargetIndex !== null && pendingInsertTargetIndex >= 0) {
          const copy = [...prev];
          const insertIdx = Math.min(copy.length, pendingInsertTargetIndex);
          copy.splice(insertIdx, 0, ...newChaptersToAdd);
          combined = copy;
        } else {
          combined = [...prev, ...newChaptersToAdd];
        }
        return updateChapterOffsets(combined);
      });
      setPendingInsertTargetIndex(null);
    }

    setIsProcessingUpload(false);
  };

  // One-click demo loader for immediate testing
  const handleLoadSample = async () => {
    setIsLoadingSample(true);
    setProgressItems([]);

    const demoChaptersData = [
      { name: '01 - Prologue: Echoes of the Void.mp3', title: 'Prologue: Echoes of the Void', freq: 196, dur: 7 },
      { name: '02 - Chapter 1: The Star Chart.mp3', title: 'Chapter 1: The Star Chart', freq: 220, dur: 10 },
      { name: '03 - Chapter 2: Across the Orion Veil.mp3', title: 'Chapter 2: Across the Orion Veil', freq: 261.63, dur: 12 },
      { name: '04 - Chapter 3: The Sanctuary of Whispers.mp3', title: 'Chapter 3: The Sanctuary of Whispers', freq: 293.66, dur: 9 },
      { name: '05 - Epilogue: Homecoming.mp3', title: 'Epilogue: Homecoming', freq: 329.63, dur: 8 },
    ];

    const generatedChapters: AudioChapter[] = [];
    let currentOffset = 0;

    for (let i = 0; i < demoChaptersData.length; i++) {
      const d = demoChaptersData[i];
      const { buffer, duration } = await createDemoChapterAudio(d.name, d.dur, d.freq);
      const decoded = await decodeAudioDetails(buffer, d.name);

      const mins = Math.floor(duration / 60);
      const secs = Math.floor(duration % 60);
      const formattedDuration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

      generatedChapters.push({
        id: `demo_ch_${i + 1}`,
        title: d.title,
        originalFileName: d.name,
        arrayBuffer: buffer,
        blob: new Blob([buffer], { type: 'audio/mp3' }),
        duration,
        formattedDuration,
        size: buffer.byteLength,
        trackNumber: i + 1,
        startOffset: currentOffset,
        endOffset: currentOffset + duration,
        sampleRate: 44100,
        waveformPeaks: decoded.waveformPeaks,
        status: 'ready',
      });

      currentOffset += duration;
    }

    setChapters(generatedChapters);
    setMetadata({
      title: 'The Starlight Navigator',
      subtitle: 'A Stellar Voyage',
      author: 'Eleanor Vance',
      narrator: 'James Sterling',
      series: 'The Horizon Chronicles, Vol. 1',
      volumeNumber: '1',
      year: '2026',
      genre: 'Audiobook / Sci-Fi Adventure',
      description: 'An unabridged full-cast audio journey across forgotten constellations.',
      publisher: 'Aether Audio Editions',
      copyright: '© 2026 Starlight Media',
      folderName: 'The_Starlight_Navigator',
    });

    setArtworkSettings({
      ...INITIAL_ARTWORK,
      themeColor: '#f59e0b',
      titleOverlay: true,
      authorOverlay: true,
      badgeText: 'UNABRIDGED AUDIOBOOK',
      showBadge: true,
    });

    setIsLoadingSample(false);
  };

  const handleClearProject = () => {
    if (window.confirm('Are you sure you want to clear the current chapters and reset the studio?')) {
      setChapters([]);
      setProgressItems([]);
      setCurrentPlayingChapter(null);
      setIsPlaying(false);
    }
  };

  const handlePreviewChapter = (chapter: AudioChapter) => {
    if (currentPlayingChapter?.id === chapter.id) {
      setIsPlaying(!isPlaying);
    } else {
      setCurrentPlayingChapter(chapter);
      setIsPlaying(true);
    }
  };

  const handleAutoSuggestMetadata = () => {
    if (chapters.length === 0) return;
    // Inspect chapter filenames
    const firstTitle = chapters[0].originalFileName;
    const clean = firstTitle.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
    setMetadata((prev) => ({
      ...prev,
      title: clean || prev.title,
      folderName: (clean || prev.title).replace(/[^a-zA-Z0-9_-]/g, '_'),
    }));
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950 pb-28">
      {/* Header */}
      <Header
        metadata={metadata}
        chapters={chapters}
        onLoadSample={handleLoadSample}
        onClear={handleClearProject}
        onOpenExport={() => setIsExportOpen(true)}
        onOpenCue={() => setIsCueOpen(true)}
        isLoadingSample={isLoadingSample}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Upload Zone Component */}
        <section id="upload-section">
          <UploadZone
            onFilesSelected={handleFilesSelected}
            progressItems={progressItems}
            isProcessing={isProcessingUpload}
          />
        </section>

        {/* Workspace Grid (Artwork Designer + Metadata + Chapter Sequencer) */}
        {chapters.length > 0 ? (
          <div className="space-y-6 animate-fade-in">
            {/* Top Row: Artwork Designer & Metadata Editor */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Artwork Designer */}
              <div className="lg:col-span-6">
                <ArtworkDesigner
                  settings={artworkSettings}
                  onUpdateSettings={(updates) =>
                    setArtworkSettings((prev) => ({ ...prev, ...updates }))
                  }
                  onCoverRendered={(blob, url) => {
                    setRenderedCoverBlob(blob);
                    setRenderedCoverUrl(url);
                  }}
                  metadata={metadata}
                />
              </div>

              {/* ID3 Metadata Editor */}
              <div className="lg:col-span-6">
                <MetadataEditor
                  metadata={metadata}
                  onChange={(updates) => setMetadata((prev) => ({ ...prev, ...updates }))}
                  onAutoSuggest={handleAutoSuggestMetadata}
                />
              </div>
            </div>

            {/* Chapter Sequencer & Stitch Preparation */}
            <section id="sequencer-section">
              <ChapterSequencer
                chapters={chapters}
                onReorder={(newChapters) => setChapters(newChapters)}
                onUpdateChapter={(id, updates) =>
                  setChapters((prev) =>
                    updateChapterOffsets(
                      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
                    )
                  )
                }
                onRemoveChapter={(id) =>
                  setChapters((prev) =>
                    updateChapterOffsets(prev.filter((c) => c.id !== id))
                  )
                }
                onPreviewChapter={handlePreviewChapter}
                activePreviewChapterId={currentPlayingChapter?.id || null}
                isPlaying={isPlaying}
                onOpenAddFiles={() => {
                  setPendingInsertTargetIndex(null);
                  const input = document.getElementById('audio-multi-file-input');
                  input?.click();
                }}
                onInsertChapterAt={(targetIdx) => {
                  setPendingInsertTargetIndex(targetIdx);
                  const input = document.getElementById('audio-multi-file-input');
                  input?.click();
                }}
              />
            </section>

            {/* Floating Action Callout for Stitching */}
            <div className="bg-gradient-to-r from-amber-950/40 via-stone-900 to-amber-950/40 border border-amber-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg shadow-amber-950/20">
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-bold shadow-md shadow-amber-500/30 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-stone-100">
                    Ready to Stitch {chapters.length} Chapters into Complete Audiobook?
                  </h4>
                  <p className="text-xs text-stone-400">
                    Total runtime: <span className="text-amber-400 font-mono font-medium">{formatTime(chapters.reduce((sum, ch) => sum + ch.duration, 0))}</span>. Generates single stitched master MP3 with embedded ID3v2 cover art or a canonical ZIP package.
                  </p>
                </div>
              </div>

              <button
                id="footer-stitch-btn"
                type="button"
                onClick={() => setIsExportOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-semibold text-stone-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl shadow-lg shadow-amber-950/50 transition-all transform active:scale-95 shrink-0"
              >
                <Disc3 className="w-4 h-4 text-stone-950 animate-spin-slow" />
                Stitch & Package Audiobook
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          /* Empty State Guide */
          <div className="bg-stone-900/40 border border-stone-800 rounded-2xl p-8 text-center max-w-2xl mx-auto space-y-4">
            <div className="w-12 h-12 rounded-full bg-stone-800/80 border border-stone-700 flex items-center justify-center mx-auto text-amber-400">
              <FileAudio className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-stone-200">
                No Chapters Uploaded Yet
              </h3>
              <p className="text-xs text-stone-400 max-w-md mx-auto mt-1">
                Drag and drop your audio files or a <code className="text-amber-400">.zip</code> archive above, or click below to load a demonstration sample.
              </p>
            </div>

            <button
              id="empty-load-sample-btn"
              type="button"
              onClick={handleLoadSample}
              disabled={isLoadingSample}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-700/50 rounded-xl transition-all shadow-md active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              {isLoadingSample ? 'Generating Sample Chapters...' : 'Load Sample Audiobook Demo'}
            </button>
          </div>
        )}
      </main>

      {/* Persistent Floating Bottom Audio Player */}
      <AudioPlayerBar
        currentChapter={currentPlayingChapter}
        allChapters={chapters}
        isPlaying={isPlaying}
        onTogglePlay={() => setIsPlaying(!isPlaying)}
        onSelectChapter={(ch) => {
          setCurrentPlayingChapter(ch);
          setIsPlaying(true);
        }}
        metadata={metadata}
        coverUrl={renderedCoverUrl || artworkSettings.imageUrl}
      />

      {/* Stitch & Export Modal */}
      <StitchExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        chapters={chapters}
        metadata={metadata}
        coverImageBlob={renderedCoverBlob}
        onReorder={(newChapters) => setChapters(newChapters)}
      />

      {/* CUE Sheet & Chapter Index Inspector Modal */}
      <CueInspectorModal
        isOpen={isCueOpen}
        onClose={() => setIsCueOpen(false)}
        chapters={chapters}
        metadata={metadata}
      />
    </div>
  );
}
