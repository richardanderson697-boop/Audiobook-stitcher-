import React, { useState, useRef } from 'react';
import {
  GripVertical,
  Play,
  Pause,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  Check,
  Clock,
  Music,
  ArrowUpDown,
  Wand2,
  Plus,
  Volume2,
  LayoutGrid,
  List,
  AlertTriangle,
  Move,
  ChevronDown,
  MousePointerClick,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { AudioChapter } from '../types';
import { formatTime, formatBytes, naturalSortChapters, extractChapterSortKey } from '../utils/audioProcessor';

interface ChapterSequencerProps {
  chapters: AudioChapter[];
  onReorder: (newChapters: AudioChapter[]) => void;
  onUpdateChapter: (id: string, updates: Partial<AudioChapter>) => void;
  onRemoveChapter: (id: string) => void;
  onPreviewChapter: (chapter: AudioChapter) => void;
  activePreviewChapterId: string | null;
  isPlaying: boolean;
  onOpenAddFiles: () => void;
  onInsertChapterAt?: (targetIndex: number) => void;
}

export const ChapterSequencer: React.FC<ChapterSequencerProps> = ({
  chapters,
  onReorder,
  onUpdateChapter,
  onRemoveChapter,
  onPreviewChapter,
  activePreviewChapterId,
  isPlaying,
  onOpenAddFiles,
  onInsertChapterAt,
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  
  // Position Selector Dropdown State
  const [activePositionMenuId, setActivePositionMenuId] = useState<string | null>(null);

  // Sequential Click Assignment Mode (Click tiles in order 1, 2, 3...)
  const [isClickReorderActive, setIsClickReorderActive] = useState(false);
  const [clickReorderList, setClickReorderList] = useState<string[]>([]);

  const totalDuration = chapters.reduce((sum, ch) => sum + (ch.duration || 0), 0);

  // Check if Chapter 1 or Prologue appears to be missing
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

  const recalculateSequence = (list: AudioChapter[]) => {
    let currentOffset = 0;
    const recomputed = list.map((ch, idx) => {
      const startOffset = currentOffset;
      const endOffset = startOffset + (ch.duration || 0);
      const mins = Math.floor((ch.duration || 0) / 60);
      const secs = Math.floor((ch.duration || 0) % 60);
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
    onReorder(recomputed);
  };

  // Drag and drop sorting handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (draggedIndex === null || draggedIndex === index) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const updated = [...chapters];
    const [movedItem] = updated.splice(draggedIndex, 1);
    updated.splice(index, 0, movedItem);

    recalculateSequence(updated);
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  // Move Up
  const moveUp = (index: number) => {
    if (index === 0) return;
    const updated = [...chapters];
    const temp = updated[index];
    updated[index] = updated[index - 1];
    updated[index - 1] = temp;
    recalculateSequence(updated);
  };

  // Move Down
  const moveDown = (index: number) => {
    if (index === chapters.length - 1) return;
    const updated = [...chapters];
    const temp = updated[index];
    updated[index] = updated[index + 1];
    updated[index + 1] = temp;
    recalculateSequence(updated);
  };

  // Move to specific target position (1-indexed)
  const moveToPosition = (currentIndex: number, targetPosition1Indexed: number) => {
    const targetIndex = Math.max(0, Math.min(chapters.length - 1, targetPosition1Indexed - 1));
    if (currentIndex === targetIndex) return;

    const updated = [...chapters];
    const [movedItem] = updated.splice(currentIndex, 1);
    updated.splice(targetIndex, 0, movedItem);
    recalculateSequence(updated);
    setActivePositionMenuId(null);
  };

  // Sort helpers
  const handleSortNatural = () => {
    const sorted = [...chapters].sort((a, b) => naturalSortChapters(a, b));
    recalculateSequence(sorted);
  };

  const handleSortDuration = () => {
    const sorted = [...chapters].sort((a, b) => a.duration - b.duration);
    recalculateSequence(sorted);
  };

  const handleReverse = () => {
    const reversed = [...chapters].reverse();
    recalculateSequence(reversed);
  };

  const handleBatchAutoNumber = () => {
    const updated = chapters.map((ch, idx) => {
      let clean = ch.title.replace(/^Chapter\s*\d+[\s:.-]*/i, '').trim();
      if (!clean) clean = `Part ${idx + 1}`;
      return {
        ...ch,
        title: `Chapter ${idx + 1}: ${clean}`,
      };
    });
    onReorder(updated);
  };

  // Click-to-order mode handler
  const handleTileClickInClickMode = (chapterId: string) => {
    if (!isClickReorderActive) return;

    if (clickReorderList.includes(chapterId)) {
      // Deselect and remove
      setClickReorderList((prev) => prev.filter((id) => id !== chapterId));
      return;
    }

    const nextList = [...clickReorderList, chapterId];
    setClickReorderList(nextList);

    // If all chapters have been selected, apply new order automatically!
    if (nextList.length === chapters.length) {
      const reorderedChapters = nextList
        .map((id) => chapters.find((c) => c.id === id)!)
        .filter(Boolean);
      recalculateSequence(reorderedChapters);
      setIsClickReorderActive(false);
      setClickReorderList([]);
    }
  };

  const cancelClickReorder = () => {
    setIsClickReorderActive(false);
    setClickReorderList([]);
  };

  const startEditing = (ch: AudioChapter) => {
    setEditingId(ch.id);
    setEditTitle(ch.title);
  };

  const saveEditing = (id: string) => {
    if (editTitle.trim()) {
      onUpdateChapter(id, { title: editTitle.trim() });
    }
    setEditingId(null);
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 space-y-4 shadow-md">
      {/* Header & Tools */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-stone-200">
              Audiobook Chapter Sequence ({chapters.length})
            </h3>
            <span className="text-[11px] text-stone-400 font-mono">
              Total: {formatTime(totalDuration)}
            </span>
          </div>
          <p className="text-xs text-stone-400">
            Click position numbers, use ▲/▼ arrows, drag cards, or click tiles to arrange chapter stitching order.
          </p>
        </div>

        {/* Quick Sorting Toolbar */}
        <div className="flex items-center flex-wrap gap-1.5 text-xs">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-stone-950 p-0.5 rounded-lg border border-stone-800 mr-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-2 py-1 rounded flex items-center gap-1 text-xs transition-colors ${
                viewMode === 'list' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Detailed List View"
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1 rounded flex items-center gap-1 text-xs transition-colors ${
                viewMode === 'grid' ? 'bg-amber-500 text-stone-950 font-semibold' : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Quick Visual Grid Sorter"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Grid Sorter
            </button>
          </div>

          <button
            id="sort-natural-btn"
            type="button"
            onClick={handleSortNatural}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-stone-300 hover:text-stone-100 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors"
            title="Sort chapters canonically by natural file numbers (1, 2, 10...)"
          >
            <ArrowUpDown className="w-3 h-3 text-amber-400" />
            Natural Sort
          </button>

          <button
            id="click-order-mode-btn"
            type="button"
            onClick={() => {
              if (isClickReorderActive) {
                cancelClickReorder();
              } else {
                setIsClickReorderActive(true);
                setClickReorderList([]);
                setViewMode('grid');
              }
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border transition-colors ${
              isClickReorderActive
                ? 'bg-amber-500 text-stone-950 border-amber-400 font-semibold shadow-md animate-pulse'
                : 'text-stone-300 hover:text-stone-100 bg-stone-800 hover:bg-stone-700 border-stone-700'
            }`}
            title="Click each chapter in your desired playback sequence (1, 2, 3...)"
          >
            <MousePointerClick className="w-3 h-3" />
            {isClickReorderActive ? 'Clicking Order...' : 'Click to Sequence'}
          </button>

          <button
            id="auto-number-btn"
            type="button"
            onClick={handleBatchAutoNumber}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-stone-300 hover:text-stone-100 bg-stone-800 hover:bg-stone-700 border border-stone-700 rounded-lg transition-colors"
            title="Auto-prefix chapter titles with 'Chapter {n}:'"
          >
            <Wand2 className="w-3 h-3 text-amber-400" />
            Auto-Number
          </button>

          <button
            id="reverse-order-btn"
            type="button"
            onClick={handleReverse}
            className="inline-flex items-center gap-1 px-2 py-1 text-stone-400 hover:text-stone-200 bg-stone-950 border border-stone-800 rounded-lg transition-colors"
            title="Reverse chapter sequence"
          >
            Reverse
          </button>

          <button
            id="add-more-chapters-btn"
            type="button"
            onClick={onOpenAddFiles}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-amber-300 bg-amber-950/40 hover:bg-amber-900/50 border border-amber-800/40 rounded-lg transition-colors font-medium ml-1"
          >
            <Plus className="w-3 h-3" />
            Add MP3s
          </button>
        </div>
      </div>

      {/* Missing Chapter 1 Warning Alert Banner */}
      {missingChapter1Start && (
        <div className="bg-amber-950/40 border border-amber-600/50 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-200 animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Chapter 1 appears to be missing:</strong> Current sequence begins with Chapter {missingChapter1Start}.
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              if (onInsertChapterAt) {
                onInsertChapterAt(0);
              } else {
                onOpenAddFiles();
              }
            }}
            className="inline-flex items-center gap-1 px-3 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 font-semibold rounded-lg shrink-0 shadow-sm transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Insert Missing Chapter 1 at Beginning
          </button>
        </div>
      )}

      {/* Click-to-Sequence Active Helper Banner */}
      {isClickReorderActive && (
        <div className="bg-gradient-to-r from-amber-900/50 to-stone-900 border border-amber-500 rounded-xl p-3.5 flex items-center justify-between gap-3 text-xs text-amber-100 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-400 text-stone-950 font-bold flex items-center justify-center text-xs shrink-0">
              {clickReorderList.length + 1}
            </div>
            <div>
              <p className="font-semibold text-amber-300">
                Click-to-Sequence Mode Active ({clickReorderList.length} of {chapters.length} chosen)
              </p>
              <p className="text-stone-300 text-[11px]">
                Click each chapter card in the exact order you want it to appear (1st click = Track 1, 2nd = Track 2...).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelClickReorder}
              className="px-2.5 py-1 text-stone-400 hover:text-stone-200 bg-stone-800 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Cumulative Timeline Visualizer */}
      {chapters.length > 0 && totalDuration > 0 && (
        <div className="space-y-1.5 bg-stone-950/80 p-3 rounded-xl border border-stone-800">
          <div className="flex justify-between items-center text-[11px] text-stone-400">
            <span className="font-medium text-stone-300 flex items-center gap-1">
              <Clock className="w-3 h-3 text-amber-400" /> Audiobook Timeline Distribution
            </span>
            <span className="font-mono text-[10px]">{formatTime(totalDuration)}</span>
          </div>

          <div className="w-full h-3 bg-stone-900 rounded-lg overflow-hidden flex gap-[2px]">
            {chapters.map((ch, idx) => {
              const widthPct = Math.max(1, (ch.duration / totalDuration) * 100);
              const isCurrent = activePreviewChapterId === ch.id;
              const hue = (idx * 37) % 360;
              return (
                <div
                  key={ch.id}
                  onClick={() => onPreviewChapter(ch)}
                  title={`${idx + 1}. ${ch.title} (${ch.formattedDuration}) - Starts at ${formatTime(ch.startOffset)}`}
                  className={`h-full cursor-pointer transition-all hover:brightness-125 ${
                    isCurrent ? 'ring-2 ring-amber-400 z-10 brightness-150' : 'opacity-85'
                  }`}
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: `hsl(${hue}, 65%, 45%)`,
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* ===================== VIEW MODE: LIST VIEW ===================== */}
      {viewMode === 'list' && (
        <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
          {chapters.map((chapter, index) => {
            const isCurrent = activePreviewChapterId === chapter.id;
            const isDragging = draggedIndex === index;
            const isDragOver = dragOverIndex === index;
            const isMenuOpen = activePositionMenuId === chapter.id;

            return (
              <div
                key={chapter.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                className={`group relative flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border transition-all ${
                  isDragging
                    ? 'opacity-40 border-amber-500/50 bg-stone-950'
                    : isDragOver
                    ? 'border-amber-400 bg-amber-500/10'
                    : isCurrent
                    ? 'border-amber-500/60 bg-amber-950/20 shadow-md shadow-amber-950/30'
                    : 'border-stone-800 bg-stone-950/60 hover:bg-stone-850 hover:border-stone-700'
                }`}
              >
                {/* Drag Handle */}
                <div
                  className="cursor-grab active:cursor-grabbing text-stone-600 group-hover:text-stone-400 px-0.5 py-1"
                  title="Drag to reorder chapter"
                >
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* Clickable Track Number Badge / Position Dropdown Trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setActivePositionMenuId(isMenuOpen ? null : chapter.id)}
                    className="w-8 h-8 rounded-lg bg-stone-800 hover:bg-amber-500 hover:text-stone-950 border border-stone-700 flex items-center justify-center text-xs font-mono font-bold text-stone-300 transition-colors shadow-sm"
                    title="Click to quickly jump this chapter to any track position"
                  >
                    {(index + 1).toString().padStart(2, '0')}
                  </button>

                  {/* Position Picker Popover */}
                  {isMenuOpen && (
                    <div className="absolute top-10 left-0 z-40 bg-stone-900 border border-amber-500/80 rounded-xl p-3 shadow-2xl w-56 text-stone-100 animate-fade-in">
                      <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-stone-800">
                        <span className="text-[11px] font-semibold text-amber-400">
                          Move to Position:
                        </span>
                        <button
                          type="button"
                          onClick={() => setActivePositionMenuId(null)}
                          className="text-stone-400 hover:text-stone-200 text-xs"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="grid grid-cols-5 gap-1 max-h-36 overflow-y-auto mb-2 pr-1">
                        {chapters.map((_, pIdx) => (
                          <button
                            key={pIdx}
                            type="button"
                            onClick={() => moveToPosition(index, pIdx + 1)}
                            className={`h-7 rounded text-xs font-mono font-semibold transition-colors ${
                              pIdx === index
                                ? 'bg-amber-500 text-stone-950'
                                : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                            }`}
                          >
                            {pIdx + 1}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 pt-1 border-t border-stone-800 text-[11px]">
                        <button
                          type="button"
                          onClick={() => moveToPosition(index, 1)}
                          disabled={index === 0}
                          className="flex-1 py-1 px-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-30 rounded text-center text-stone-300"
                        >
                          Top (Pos 1)
                        </button>
                        <button
                          type="button"
                          onClick={() => moveToPosition(index, chapters.length)}
                          disabled={index === chapters.length - 1}
                          className="flex-1 py-1 px-1.5 bg-stone-800 hover:bg-stone-700 disabled:opacity-30 rounded text-center text-stone-300"
                        >
                          End (Pos {chapters.length})
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview Audio Play/Pause Button */}
                <button
                  type="button"
                  onClick={() => onPreviewChapter(chapter)}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isCurrent && isPlaying
                      ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/30'
                      : 'bg-stone-800 hover:bg-stone-700 text-stone-300'
                  }`}
                  title={isCurrent && isPlaying ? 'Pause preview' : 'Play chapter preview'}
                >
                  {isCurrent && isPlaying ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 ml-0.5 fill-current" />
                  )}
                </button>

                {/* Title & Info */}
                <div className="flex-1 min-w-0">
                  {editingId === chapter.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveEditing(chapter.id)}
                        autoFocus
                        className="w-full bg-stone-900 border border-amber-500 rounded px-2 py-0.5 text-xs text-stone-100 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => saveEditing(chapter.id)}
                        className="p-1 text-emerald-400 hover:bg-emerald-950/40 rounded"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <h4
                        onClick={() => startEditing(chapter)}
                        className="text-xs sm:text-sm font-medium text-stone-200 truncate cursor-pointer hover:text-amber-300"
                        title="Click to rename chapter"
                      >
                        {chapter.title}
                      </h4>
                      <span className="text-[11px] text-stone-400 font-mono hidden sm:inline">
                        {chapter.originalFileName}
                      </span>
                    </div>
                  )}

                  {/* Sub-info: Offset, Duration, Size */}
                  <div className="flex items-center gap-3 text-[11px] text-stone-400 mt-0.5 font-mono">
                    <span className="text-amber-400/90 font-medium">
                      Start: {formatTime(chapter.startOffset)}
                    </span>
                    <span>•</span>
                    <span>Duration: {chapter.formattedDuration}</span>
                    <span>•</span>
                    <span>{formatBytes(chapter.size)}</span>
                  </div>
                </div>

                {/* Mini Waveform Visualization */}
                {chapter.waveformPeaks && chapter.waveformPeaks.length > 0 && (
                  <div className="hidden md:flex items-center gap-[2px] h-6 w-24 shrink-0 px-1 opacity-70 group-hover:opacity-100">
                    {chapter.waveformPeaks.slice(0, 24).map((peak, pIdx) => (
                      <div
                        key={pIdx}
                        className={`w-1 rounded-full transition-all ${
                          isCurrent ? 'bg-amber-400' : 'bg-stone-600'
                        }`}
                        style={{ height: `${Math.max(15, peak * 100)}%` }}
                      />
                    ))}
                  </div>
                )}

                {/* Move Up & Move Down Prominent Buttons */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-1.5 text-stone-400 hover:text-amber-400 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-20 border border-stone-800/80"
                    title="Move chapter UP 1 position"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => moveDown(index)}
                    disabled={index === chapters.length - 1}
                    className="p-1.5 text-stone-400 hover:text-amber-400 hover:bg-stone-800 rounded-lg transition-colors disabled:opacity-20 border border-stone-800/80"
                    title="Move chapter DOWN 1 position"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => startEditing(chapter)}
                    className="p-1.5 text-stone-400 hover:text-stone-200 hover:bg-stone-800 rounded-lg transition-colors hidden sm:inline-block"
                    title="Rename chapter"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onRemoveChapter(chapter.id)}
                    className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-red-950/30 rounded-lg transition-colors"
                    title="Remove chapter"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ===================== VIEW MODE: GRID SORTER ===================== */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[500px] overflow-y-auto pr-1">
          {chapters.map((chapter, index) => {
            const isCurrent = activePreviewChapterId === chapter.id;
            const clickOrderPos = clickReorderList.indexOf(chapter.id);
            const isSelectedInClickMode = clickOrderPos !== -1;

            return (
              <div
                key={chapter.id}
                draggable={!isClickReorderActive}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={() => handleDrop(index)}
                onClick={() => isClickReorderActive && handleTileClickInClickMode(chapter.id)}
                className={`relative p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
                  isClickReorderActive
                    ? isSelectedInClickMode
                      ? 'border-amber-400 bg-amber-950/40 ring-2 ring-amber-400 scale-[1.02]'
                      : 'border-stone-700 bg-stone-950 hover:border-amber-500/70 hover:bg-stone-900 cursor-pointer'
                    : isCurrent
                    ? 'border-amber-500 bg-amber-950/20'
                    : 'border-stone-800 bg-stone-950 hover:border-stone-700'
                }`}
              >
                {/* Header: Track Number / Click Order Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {isClickReorderActive ? (
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold font-mono transition-colors ${
                          isSelectedInClickMode
                            ? 'bg-amber-400 text-stone-950 shadow-md'
                            : 'bg-stone-800 text-stone-400 border border-stone-700'
                        }`}
                      >
                        {isSelectedInClickMode ? clickOrderPos + 1 : '—'}
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-lg bg-stone-800 border border-stone-700 flex items-center justify-center text-xs font-mono font-bold text-amber-400">
                        {(index + 1).toString().padStart(2, '0')}
                      </div>
                    )}

                    <div className="text-[11px] font-mono text-stone-400">
                      {chapter.formattedDuration}
                    </div>
                  </div>

                  {/* Play & Arrow Controls in Tile */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPreviewChapter(chapter);
                      }}
                      className="p-1 text-stone-400 hover:text-stone-100 hover:bg-stone-800 rounded"
                    >
                      {isCurrent && isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    {!isClickReorderActive && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveUp(index);
                          }}
                          disabled={index === 0}
                          className="p-1 text-stone-400 hover:text-amber-400 disabled:opacity-20 hover:bg-stone-800 rounded"
                          title="Move Left/Up"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            moveDown(index);
                          }}
                          disabled={index === chapters.length - 1}
                          className="p-1 text-stone-400 hover:text-amber-400 disabled:opacity-20 hover:bg-stone-800 rounded"
                          title="Move Right/Down"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Chapter Title */}
                <div>
                  <h4 className="text-xs font-medium text-stone-200 line-clamp-2" title={chapter.title}>
                    {chapter.title}
                  </h4>
                  <p className="text-[10px] text-stone-400 font-mono truncate mt-0.5">
                    {chapter.originalFileName}
                  </p>
                </div>

                {/* Footer with Quick Jump Position Selector */}
                {!isClickReorderActive && (
                  <div className="pt-2 border-t border-stone-800/80 flex items-center justify-between text-[11px]">
                    <span className="text-stone-400 font-mono text-[10px]">
                      At: {formatTime(chapter.startOffset)}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-stone-400">Pos:</span>
                      <select
                        value={index + 1}
                        onChange={(e) => moveToPosition(index, parseInt(e.target.value, 10))}
                        className="bg-stone-800 border border-stone-700 text-stone-200 rounded px-1 py-0.5 text-[11px] font-mono focus:outline-none focus:border-amber-500"
                      >
                        {chapters.map((_, p) => (
                          <option key={p} value={p + 1}>
                            #{p + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
