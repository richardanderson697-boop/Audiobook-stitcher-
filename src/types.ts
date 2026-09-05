export interface AudioChapter {
  id: string;
  title: string;
  originalFileName: string;
  file?: File;
  arrayBuffer?: ArrayBuffer;
  blob?: Blob;
  duration: number; // in seconds
  formattedDuration: string;
  size: number; // in bytes
  trackNumber: number;
  startOffset: number; // in seconds from start of stitched book
  endOffset: number; // in seconds
  sampleRate?: number;
  bitrate?: number;
  waveformPeaks?: number[];
  customCoverUrl?: string;
  narrator?: string;
  status: 'ready' | 'decoding' | 'error';
  errorMessage?: string;
}

export interface AudiobookMetadata {
  title: string;
  subtitle: string;
  author: string;
  narrator: string;
  series: string;
  volumeNumber: string;
  year: string;
  genre: string;
  description: string;
  publisher: string;
  copyright: string;
  folderName: string;
}

export interface ArtworkSettings {
  imageUrl: string | null;
  imageBlob: Blob | null;
  aspectRatio: '1:1' | '3:2' | '4:3' | '16:9';
  titleOverlay: boolean;
  authorOverlay: boolean;
  badgeText: string;
  showBadge: boolean;
  themeColor: string;
  gradientOverlay: boolean;
  fontFamily: 'serif' | 'sans' | 'display' | 'mono';
  brightness: number;
  contrast: number;
  blur: number;
}

export interface UploadProgressItem {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: 'mp3' | 'zip' | 'image' | 'other';
  progress: number; // 0 to 100
  stage: string;
  status: 'uploading' | 'unzipping' | 'processing' | 'done' | 'error';
  errorMessage?: string;
}

export interface StitchExportOptions {
  format: 'stitched_mp3' | 'tagged_zip' | 'both';
  embedArtwork: boolean;
  embedCueSheet: boolean;
  embedM3u: boolean;
  embedJsonMetadata: boolean;
  gapSilenceSeconds: number;
  autoNormalizeNumbers: boolean;
  fileNameTemplate: string;
}
