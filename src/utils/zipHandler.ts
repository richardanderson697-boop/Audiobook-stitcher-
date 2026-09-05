import JSZip from 'jszip';
import { AudioChapter, AudiobookMetadata } from '../types';
import { decodeAudioDetails, cleanChapterTitle, naturalSortChapters, generateCueSheet, generateM3u8Playlist, compareChapterFileNames } from './audioProcessor';
import { injectID3TagsToMP3, ID3TagData } from './id3Writer';

export interface UnzipResult {
  chapters: AudioChapter[];
  coverImageBlob?: Blob;
  coverImageUrl?: string;
  detectedTitle?: string;
  detectedAuthor?: string;
  totalFiles: number;
}

/**
 * Canonically unpacks a ZIP archive containing audiobook chapters and artwork
 */
export async function canonicallyUnzipAudiobook(
  zipFile: File | Blob,
  onProgress?: (percent: number, stage: string) => void,
  onChapterExtracted?: (chapter: AudioChapter) => void
): Promise<UnzipResult> {
  onProgress?.(10, 'Reading archive directory structure...');
  const zip = new JSZip();
  const loadedZip = await zip.loadAsync(zipFile);

  const fileEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  loadedZip.forEach((relativePath, entry) => {
    // Ignore macOS __MACOSX meta files and system hidden files
    if (!entry.dir && !relativePath.startsWith('__MACOSX') && !relativePath.includes('/.')) {
      fileEntries.push({ name: relativePath, entry });
    }
  });

  if (fileEntries.length === 0) {
    throw new Error('The ZIP archive appears to be empty or contains only folders.');
  }

  // Detect potential book title from root folder name or zip file name
  let detectedTitle: string | undefined;
  if ('name' in zipFile && typeof zipFile.name === 'string') {
    detectedTitle = zipFile.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
  }

  const audioExtensions = ['.mp3', '.wav', '.m4a', '.m4b', '.aac', '.ogg', '.flac', '.wma', '.mp4', '.aiff', '.aif', '.opus'];
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

  const audioEntries: { name: string; entry: JSZip.JSZipObject }[] = [];
  let coverEntry: JSZip.JSZipObject | null = null;

  for (const item of fileEntries) {
    const lower = item.name.toLowerCase();
    if (audioExtensions.some(ext => lower.endsWith(ext))) {
      audioEntries.push(item);
    } else if (imageExtensions.some(ext => lower.endsWith(ext))) {
      if (
        !coverEntry ||
        lower.includes('cover') ||
        lower.includes('folder') ||
        lower.includes('front') ||
        lower.includes('artwork')
      ) {
        coverEntry = item.entry;
      }
    }
  }

  if (audioEntries.length === 0) {
    throw new Error('No audio files (.mp3, .wav, .m4a, etc.) found in the ZIP archive.');
  }

  onProgress?.(30, `Found ${audioEntries.length} audio chapter files. Extracting & parsing...`);

  // Extract cover image if present
  let coverImageBlob: Blob | undefined;
  let coverImageUrl: string | undefined;

  if (coverEntry) {
    onProgress?.(35, 'Extracting artwork design...');
    const imgData = await coverEntry.async('blob');
    coverImageBlob = imgData;
    coverImageUrl = URL.createObjectURL(imgData);
  }

  // Sort audio entries canonically by filename before unpacking
  audioEntries.sort((a, b) => {
    const nameA = a.name.split('/').pop() || a.name;
    const nameB = b.name.split('/').pop() || b.name;
    return compareChapterFileNames(nameA, nameB);
  });

  // Extract and process audio files sequentially using lightweight Blobs
  const chapters: AudioChapter[] = [];
  let currentStartOffset = 0;

  for (let i = 0; i < audioEntries.length; i++) {
    const item = audioEntries[i];
    const baseName = item.name.split('/').pop() || item.name;
    const progress = 35 + Math.round(((i + 1) / audioEntries.length) * 60);
    onProgress?.(progress, `Unpacking & inspecting track ${i + 1}/${audioEntries.length}: ${baseName}...`);

    const blob = await item.entry.async('blob');
    let duration = 0;
    let sampleRate = 44100;
    let waveformPeaks: number[] = [];

    try {
      const decoded = await decodeAudioDetails(blob, baseName);
      duration = decoded.duration;
      sampleRate = decoded.sampleRate;
      waveformPeaks = decoded.waveformPeaks;
    } catch {
      duration = Math.max(5, (blob.size * 8) / (128 * 1000));
      waveformPeaks = Array.from({ length: 64 }, () => Math.random() * 0.6 + 0.2);
    }

    const endOffset = currentStartOffset + duration;
    const mins = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60);
    const formattedDuration = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const title = cleanChapterTitle(baseName);

    const chapterObj: AudioChapter = {
      id: `ch_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 7)}`,
      title: title || `Chapter ${i + 1}`,
      originalFileName: baseName,
      blob,
      duration,
      formattedDuration,
      size: blob.size,
      trackNumber: i + 1,
      startOffset: currentStartOffset,
      endOffset,
      sampleRate,
      waveformPeaks,
      status: 'ready',
    };

    chapters.push(chapterObj);
    onChapterExtracted?.(chapterObj);

    // Free JSZip internal decompressor buffer and entry reference to prevent OOM
    try {
      loadedZip.remove(item.name);
      if ((item.entry as any)._data) {
        (item.entry as any)._data = null;
      }
    } catch {
      // ignore
    }

    currentStartOffset = endOffset;
    // Micro-yield to allow browser rendering and garbage collection
    await new Promise((r) => setTimeout(r, 16));
  }

  onProgress?.(100, 'Unpack and canonical sequence complete!');

  return {
    chapters,
    coverImageBlob,
    coverImageUrl,
    detectedTitle,
    totalFiles: audioEntries.length,
  };
}

/**
 * Creates a structured ZIP package with individually ID3-tagged chapters,
 * cover.jpg, CUE sheet, M3U8 playlist, and metadata.json
 */
export async function packageSequencedAudiobookZip(
  chapters: AudioChapter[],
  metadata: AudiobookMetadata,
  artworkData?: { mimeType: string; data: ArrayBuffer | Uint8Array },
  onProgress?: (percent: number, stage: string) => void
): Promise<Blob> {
  onProgress?.(10, 'Initializing ZIP package...');
  const zip = new JSZip();
  const folderName = metadata.folderName || metadata.title.replace(/[^a-zA-Z0-9_-]/g, '_') || 'Audiobook';
  const folder = zip.folder(folderName) || zip;

  // Add cover image file
  if (artworkData && artworkData.data) {
    onProgress?.(15, 'Adding high-res artwork to package...');
    const ext = artworkData.mimeType.includes('png') ? 'png' : 'jpg';
    folder.file(`cover.${ext}`, artworkData.data);
  }

  // Add each MP3 with injected ID3 tag
  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const progress = 20 + Math.round(((i + 1) / chapters.length) * 55);
    onProgress?.(progress, `Tagging & packing chapter ${i + 1} of ${chapters.length}: ${ch.title}...`);

    let rawBuffer: ArrayBuffer | null = null;
    if (ch.arrayBuffer) {
      rawBuffer = ch.arrayBuffer;
    } else if (ch.blob) {
      rawBuffer = await ch.blob.arrayBuffer();
    } else if (ch.file) {
      rawBuffer = await ch.file.arrayBuffer();
    }
    if (!rawBuffer) continue;

    const trackNum = `${i + 1}/${chapters.length}`;
    const tagData: ID3TagData = {
      title: ch.title,
      artist: ch.narrator || metadata.author || 'Author',
      album: metadata.title || 'Audiobook',
      track: trackNum,
      year: metadata.year || new Date().getFullYear().toString(),
      genre: metadata.genre || 'Audiobook',
      composer: metadata.narrator || undefined,
      comment: metadata.description || `Audiobook chapter ${i + 1}`,
      image: artworkData,
    };

    const taggedBuffer = injectID3TagsToMP3(rawBuffer, tagData);
    const sanitizedIndex = (i + 1).toString().padStart(2, '0');
    const sanitizedTitle = ch.title.replace(/[/\\?%*:|"<>]/g, '-');
    const fileName = `${sanitizedIndex} - ${sanitizedTitle}.mp3`;

    folder.file(fileName, taggedBuffer);
  }

  // Generate CUE sheet
  onProgress?.(80, 'Generating CUE Sheet & M3U8 Playlist...');
  const cueSheet = generateCueSheet(metadata, chapters, `${metadata.title || 'Audiobook'}.mp3`);
  folder.file('chapters.cue', cueSheet);

  // Generate M3U8 Playlist
  const m3u8 = generateM3u8Playlist(metadata, chapters);
  folder.file('playlist.m3u8', m3u8);

  // Generate JSON Metadata
  const metadataJson = {
    audiobook: {
      title: metadata.title,
      subtitle: metadata.subtitle,
      author: metadata.author,
      narrator: metadata.narrator,
      series: metadata.series,
      volumeNumber: metadata.volumeNumber,
      year: metadata.year,
      genre: metadata.genre,
      description: metadata.description,
      publisher: metadata.publisher,
      totalChapters: chapters.length,
      totalDurationSeconds: chapters.reduce((sum, c) => sum + c.duration, 0),
      chapters: chapters.map((c, idx) => ({
        trackNumber: idx + 1,
        title: c.title,
        narrator: c.narrator || metadata.narrator,
        durationSeconds: c.duration,
        formattedDuration: c.formattedDuration,
        startOffsetSeconds: c.startOffset,
        endOffsetSeconds: c.endOffset,
      })),
    },
    generatedAt: new Date().toISOString(),
    generator: 'Audiobook Chapter & Stitch Studio',
  };
  folder.file('metadata.json', JSON.stringify(metadataJson, null, 2));

  onProgress?.(90, 'Compressing finalized ZIP archive...');
  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    (metadata) => {
      onProgress?.(90 + Math.round(metadata.percent * 0.1), `Compressing: ${Math.round(metadata.percent)}%`);
    }
  );

  onProgress?.(100, 'ZIP Package complete!');
  return zipBlob;
}
