import { Mp3Encoder } from '@breezystack/lamejs';
import { AudioChapter, AudiobookMetadata } from '../types';
import { injectID3TagsToMP3, stripID3Tags, ID3TagData } from './id3Writer';
import { stitchMasterAudiobookSafe } from './mp3Stitcher';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Format seconds into mm:ss or hh:mm:ss
 */
export function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format seconds into CUE sheet format (mm:ss:ff where ff is frames 00-74, 75 fps)
 */
export function formatCueTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * 75);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

/**
 * Format bytes to readable human string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Extract audio duration and generate waveform peaks from ArrayBuffer
 */
export async function decodeAudioDetails(
  buffer: ArrayBuffer,
  fileName: string
): Promise<{
  duration: number;
  sampleRate: number;
  waveformPeaks: number[];
}> {
  const ctx = getAudioContext();
  try {
    // Clone arrayBuffer because decodeAudioData detaches the buffer in some browsers
    const bufferClone = buffer.slice(0);
    const audioBuffer = await ctx.decodeAudioData(bufferClone);
    const duration = audioBuffer.duration;
    const sampleRate = audioBuffer.sampleRate;

    // Generate ~64 waveform peaks
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.floor(channelData.length / 64);
    const waveformPeaks: number[] = [];

    for (let i = 0; i < 64; i++) {
      let max = 0;
      const start = i * step;
      const end = Math.min(start + step, channelData.length);
      for (let j = start; j < end; j += Math.max(1, Math.floor(step / 20))) {
        const val = Math.abs(channelData[j]);
        if (val > max) max = val;
      }
      waveformPeaks.push(Math.min(1, Math.max(0.1, max)));
    }

    return { duration, sampleRate, waveformPeaks };
  } catch {
    // Fallback if decodeAudioData fails on odd MP3 formats
    // Estimate ~128kbps duration
    const estimatedDuration = Math.max(5, (buffer.byteLength * 8) / (128 * 1000));
    const dummyPeaks = Array.from({ length: 64 }, () => Math.random() * 0.7 + 0.2);
    return {
      duration: estimatedDuration,
      sampleRate: 44100,
      waveformPeaks: dummyPeaks,
    };
  }
}

/**
 * Clean and normalize title from file name
 */
export function cleanChapterTitle(rawName: string): string {
  // Remove extension
  let name = rawName.replace(/\.[^/.]+$/, '');
  // Remove leading numbers, tracks, e.g. "01 - Chapter", "Track 01 - ", "01."
  name = name.replace(/^(\d+[\s\-_.:]+)+/i, '');
  // Replace underscores and dashes with spaces
  name = name.replace(/[_-]+/g, ' ').trim();
  // Capitalize properly if all lowercase or weird casing
  if (name.length > 0) {
    name = name.charAt(0).toUpperCase() + name.slice(1);
  } else {
    name = 'Chapter';
  }
  return name;
}

/**
 * Advanced Natural Chapter Sort comparator
 * Handles:
 * - Disc / Track prefixes (e.g., "1-01 Chapter 1", "Track 02", "CD1_03")
 * - Chapter/Track number patterns (e.g. "Chapter 1", "Ch 2", "Part 3", "04 - Title")
 * - Roman numerals (e.g. "Chapter I", "Chapter IV", "Chapter IX")
 * - Natural alphanumeric sorting (1, 2, ... 9, 10, 11)
 */
export function naturalSortChapters(a: AudioChapter, b: AudioChapter): number {
  return compareChapterFileNames(a.originalFileName || a.title, b.originalFileName || b.title);
}

const ROMAN_MAP: Record<string, number> = {
  i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10,
  xi: 11, xii: 12, xiii: 13, xiv: 14, xv: 15, xvi: 16, xvii: 17, xviii: 18, xix: 19, xx: 20,
  xxi: 21, xxii: 22, xxiii: 23, xxiv: 24, xxv: 25, xxvi: 26, xxvii: 27, xxviii: 28, xxix: 29, xxx: 30,
};

export function extractChapterSortKey(name: string): {
  prefixRank: number;
  discNum: number;
  chapterNum: number | null;
  normalized: string;
} {
  const clean = name.trim().toLowerCase();
  
  // Check special audiobook bookends
  let prefixRank = 50; // default middle
  if (/^(00|0)?\s*(intro|introduction|prologue|foreword|preface|opening)/i.test(clean)) {
    prefixRank = 10;
  } else if (/^(epilogue|afterword|outro|conclusion|credits|closing)/i.test(clean)) {
    prefixRank = 90;
  }

  // Check disc / CD prefix (e.g. "CD1_01", "1-02", "Disc 2 Track 3")
  let discNum = 1;
  const discMatch = clean.match(/(?:disc|cd|disk)\s*([0-9]+)/i) || clean.match(/^([0-9]+)\s*[-_]\s*([0-9]+)/);
  if (discMatch) {
    discNum = parseInt(discMatch[1], 10) || 1;
  }

  // Check numeric chapter / track number
  let chapterNum: number | null = null;

  // Pattern 1: Leading numbers "01 - Chapter", "1_Chapter", "01.mp3"
  const leadingNumMatch = clean.match(/^([0-9]+)/);
  if (leadingNumMatch) {
    chapterNum = parseInt(leadingNumMatch[1], 10);
  }

  // Pattern 2: "Chapter 1", "Ch. 02", "Track 3", "Part 4", "Section 5"
  if (chapterNum === null) {
    const chapterExplicitMatch = clean.match(/(?:chapter|ch|track|part|section|trk)\s*([0-9]+)/i);
    if (chapterExplicitMatch) {
      chapterNum = parseInt(chapterExplicitMatch[1], 10);
    }
  }

  // Pattern 3: Roman numerals "Chapter IV", "Part IX"
  if (chapterNum === null) {
    const romanMatch = clean.match(/(?:chapter|ch|part|section)\s+([ivxlcdm]+)\b/i);
    if (romanMatch && ROMAN_MAP[romanMatch[1].toLowerCase()]) {
      chapterNum = ROMAN_MAP[romanMatch[1].toLowerCase()];
    }
  }

  // Pattern 4: Any isolated number in filename
  if (chapterNum === null) {
    const anyNumMatch = clean.match(/\b([0-9]+)\b/);
    if (anyNumMatch) {
      chapterNum = parseInt(anyNumMatch[1], 10);
    }
  }

  return {
    prefixRank,
    discNum,
    chapterNum,
    normalized: clean,
  };
}

export function compareChapterFileNames(aName: string, bName: string): number {
  const aKey = extractChapterSortKey(aName);
  const bKey = extractChapterSortKey(bName);

  // 1. Prologue / Epilogue ranking
  if (aKey.prefixRank !== bKey.prefixRank) {
    return aKey.prefixRank - bKey.prefixRank;
  }

  // 2. Disc number
  if (aKey.discNum !== bKey.discNum) {
    return aKey.discNum - bKey.discNum;
  }

  // 3. Chapter / Track number if detected in both
  if (aKey.chapterNum !== null && bKey.chapterNum !== null) {
    if (aKey.chapterNum !== bKey.chapterNum) {
      return aKey.chapterNum - bKey.chapterNum;
    }
  }

  // 4. Standard natural alphanumeric comparison
  return aName.localeCompare(bName, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

/**
 * Generate standard CUE sheet text
 */
export function generateCueSheet(
  bookMetadata: AudiobookMetadata,
  chapters: AudioChapter[],
  stitchedAudioFilename: string = 'audiobook.mp3'
): string {
  const lines: string[] = [];
  lines.push(`REM GENRE "${bookMetadata.genre || 'Audiobook'}"`);
  lines.push(`REM DATE ${bookMetadata.year || new Date().getFullYear()}`);
  lines.push(`PERFORMER "${bookMetadata.author || 'Author'}"`);
  lines.push(`TITLE "${bookMetadata.title || 'Audiobook'}"`);
  lines.push(`FILE "${stitchedAudioFilename}" MP3`);

  chapters.forEach((ch, idx) => {
    const trackNum = (idx + 1).toString().padStart(2, '0');
    lines.push(`  TRACK ${trackNum} AUDIO`);
    lines.push(`    TITLE "${ch.title.replace(/"/g, "'")}"`);
    lines.push(`    PERFORMER "${ch.narrator || bookMetadata.narrator || bookMetadata.author || 'Narrator'}"`);
    lines.push(`    INDEX 01 ${formatCueTimestamp(ch.startOffset)}`);
  });

  return lines.join('\n');
}

/**
 * Generate M3U8 Playlist
 */
export function generateM3u8Playlist(
  bookMetadata: AudiobookMetadata,
  chapters: AudioChapter[]
): string {
  const lines: string[] = [];
  lines.push('#EXTM3U');
  lines.push(`#EXTENC: UTF-8`);
  lines.push(`#PLAYLIST:${bookMetadata.title || 'Audiobook'}`);

  chapters.forEach((ch) => {
    const duration = Math.round(ch.duration);
    const artist = ch.narrator || bookMetadata.author || 'Author';
    lines.push(`#EXTINF:${duration},${artist} - ${ch.title}`);
    lines.push(ch.originalFileName);
  });

  return lines.join('\n');
}

/**
 * Concatenate multiple MP3 buffers into a single stitched master MP3 with full ID3v2 chapter marks & cover artwork
 */
export async function stitchMasterAudiobook(
  chapters: AudioChapter[],
  metadata: AudiobookMetadata,
  artworkData?: { mimeType: string; data: ArrayBuffer | Uint8Array },
  onProgress?: (percent: number, message: string) => void
): Promise<{ blob: Blob; buffer: Uint8Array; totalDuration: number }> {
  return stitchMasterAudiobookSafe(chapters, metadata, artworkData, onProgress);
}

/**
 * Creates sample synthetic chapter audio files for instant one-click testing
 */
export async function createDemoChapterAudio(
  chapterName: string,
  durationSec: number = 8,
  frequency: number = 220
): Promise<{ buffer: ArrayBuffer; duration: number }> {
  const sampleRate = 44100;
  const numSamples = Math.floor(sampleRate * durationSec);
  const left = new Int16Array(numSamples);
  const right = new Int16Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Acoustic chord synth with gentle pulse like a voice/ambient narration intro
    const envelope = Math.sin((Math.PI * i) / numSamples);
    const harmonic1 = Math.sin(2 * Math.PI * frequency * t) * 0.35;
    const harmonic2 = Math.sin(2 * Math.PI * (frequency * 1.5) * t) * 0.2;
    const harmonic3 = Math.sin(2 * Math.PI * (frequency * 2) * t) * 0.1;
    const modulation = Math.sin(2 * Math.PI * 3 * t) * 0.08;

    const sample = (harmonic1 + harmonic2 + harmonic3 + modulation) * envelope * 0.7;
    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    left[i] = intSample;
    right[i] = Math.floor(intSample * 0.95);
  }

  // Encode directly to genuine MP3 frames with LAME encoder
  const encoder = new Mp3Encoder(2, sampleRate, 192);
  const mp3Chunks: Uint8Array[] = [];
  const mp3Buf = encoder.encodeBuffer(left, right);
  if (mp3Buf.length > 0) {
    mp3Chunks.push(new Uint8Array(mp3Buf));
  }
  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    mp3Chunks.push(new Uint8Array(flushBuf));
  }

  const totalLen = mp3Chunks.reduce((s, c) => s + c.length, 0);
  const output = new Uint8Array(totalLen);
  let wp = 0;
  mp3Chunks.forEach((c) => {
    output.set(c, wp);
    wp += c.length;
  });

  return { buffer: output.buffer, duration: durationSec };
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length * blockAlign;
  const headerByteLength = 44;
  const wav = new Uint8Array(headerByteLength + length);
  const view = new DataView(wav.buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + length, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, length, true);

  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, channels[channel][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return wav.buffer;
}

function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
