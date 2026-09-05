import { Mp3Encoder } from '@breezystack/lamejs';
import { AudioChapter, AudiobookMetadata } from '../types';
import { buildID3TagBuffer, ID3TagData, stripID3Tags } from './id3Writer';

// MPEG Bitrate tables (in kbps)
const MPEG1_BITRATES = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG2_BITRATES = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

// MPEG Sample Rate tables (in Hz)
const SAMPLERATES_MPEG1 = [44100, 48000, 32000, 0];
const SAMPLERATES_MPEG2 = [22050, 24000, 16000, 0];
const SAMPLERATES_MPEG25 = [11025, 12000, 8000, 0];

export interface MPEGFrameHeader {
  version: number; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  layer: number; // 1 = Layer III (MP3), 2 = Layer II, 3 = Layer I
  hasCRC: boolean;
  bitrate: number; // in kbps
  sampleRate: number; // in Hz
  padding: number;
  channelMode: number; // 0=Stereo, 1=Joint, 2=Dual, 3=Mono
  frameLength: number; // in bytes
  samplesPerFrame: number;
  isXingHeader: boolean;
  xingOffset?: number;
  xingType?: 'Xing' | 'Info' | 'VBRI';
}

/**
 * Parses an MPEG frame header at the given offset
 */
export function parseMpegFrameHeader(bytes: Uint8Array, offset: number): MPEGFrameHeader | null {
  if (offset + 4 > bytes.length) return null;

  const b0 = bytes[offset];
  const b1 = bytes[offset + 1];
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];

  // Sync check (11 bits = 0xFFE0 mask)
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) {
    return null;
  }

  const versionBits = (b1 >> 3) & 0x03; // 00=2.5, 01=reserved, 10=2, 11=1
  if (versionBits === 1) return null; // reserved

  const layerBits = (b1 >> 1) & 0x03; // 00=reserved, 01=III, 10=II, 11=I
  if (layerBits === 0) return null; // reserved

  const hasCRC = (b1 & 0x01) === 0; // 0 = CRC protected (16 bits follow)

  const bitrateIndex = (b2 >> 4) & 0x0f;
  if (bitrateIndex === 0 || bitrateIndex === 0x0f) return null; // free or bad

  const sampleRateIndex = (b2 >> 2) & 0x03;
  if (sampleRateIndex === 3) return null; // reserved

  const padding = (b2 >> 1) & 0x01;
  const channelMode = (b3 >> 6) & 0x03; // 3 = Mono

  let version = 3;
  let sampleRates = SAMPLERATES_MPEG1;
  let bitrates = MPEG1_BITRATES;
  let samplesPerFrame = 1152;

  if (versionBits === 3) {
    version = 3; // MPEG 1
    sampleRates = SAMPLERATES_MPEG1;
    bitrates = MPEG1_BITRATES;
    samplesPerFrame = layerBits === 3 ? 384 : 1152;
  } else if (versionBits === 2) {
    version = 2; // MPEG 2
    sampleRates = SAMPLERATES_MPEG2;
    bitrates = MPEG2_BITRATES;
    samplesPerFrame = layerBits === 3 ? 384 : layerBits === 1 ? 576 : 1152;
  } else if (versionBits === 0) {
    version = 0; // MPEG 2.5
    sampleRates = SAMPLERATES_MPEG25;
    bitrates = MPEG2_BITRATES;
    samplesPerFrame = layerBits === 3 ? 384 : layerBits === 1 ? 576 : 1152;
  }

  const sampleRate = sampleRates[sampleRateIndex];
  const bitrate = bitrates[bitrateIndex];

  if (!sampleRate || !bitrate) return null;

  let frameLength = 0;
  if (layerBits === 1) {
    // Layer III
    if (version === 3) {
      frameLength = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
    } else {
      frameLength = Math.floor((72 * bitrate * 1000) / sampleRate) + padding;
    }
  } else if (layerBits === 2) {
    // Layer II
    frameLength = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
  } else if (layerBits === 3) {
    // Layer I
    frameLength = Math.floor((12 * bitrate * 1000) / sampleRate + padding) * 4;
  }

  if (frameLength <= 4 || offset + frameLength > bytes.length) {
    return null;
  }

  // Check for Xing / Info / VBRI header
  let isXingHeader = false;
  let xingOffset: number | undefined;
  let xingType: 'Xing' | 'Info' | 'VBRI' | undefined;

  // Calculate standard offset for Xing tag
  const crcLen = hasCRC ? 2 : 0;
  let tagOffset = 4 + crcLen;
  if (version === 3) {
    tagOffset += channelMode === 3 ? 17 : 32;
  } else {
    tagOffset += channelMode === 3 ? 9 : 17;
  }

  const absTagOffset = offset + tagOffset;
  if (absTagOffset + 4 <= offset + frameLength) {
    const s0 = bytes[absTagOffset];
    const s1 = bytes[absTagOffset + 1];
    const s2 = bytes[absTagOffset + 2];
    const s3 = bytes[absTagOffset + 3];

    // 'Xing' (0x58, 0x69, 0x6E, 0x67)
    if (s0 === 0x58 && s1 === 0x69 && s2 === 0x6e && s3 === 0x67) {
      isXingHeader = true;
      xingOffset = tagOffset;
      xingType = 'Xing';
    }
    // 'Info' (0x49, 0x6E, 0x66, 0x6F)
    else if (s0 === 0x49 && s1 === 0x6e && s2 === 0x66 && s3 === 0x6f) {
      isXingHeader = true;
      xingOffset = tagOffset;
      xingType = 'Info';
    }
  }

  // Also check VBRI at offset 32 (or 36 with header)
  const absVbriOffset = offset + 4 + crcLen + 32;
  if (!isXingHeader && absVbriOffset + 4 <= offset + frameLength) {
    if (
      bytes[absVbriOffset] === 0x56 &&
      bytes[absVbriOffset + 1] === 0x42 &&
      bytes[absVbriOffset + 2] === 0x52 &&
      bytes[absVbriOffset + 3] === 0x49
    ) {
      isXingHeader = true;
      xingOffset = 4 + crcLen + 32;
      xingType = 'VBRI';
    }
  }

  return {
    version,
    layer: layerBits,
    hasCRC,
    bitrate,
    sampleRate,
    padding,
    channelMode,
    frameLength,
    samplesPerFrame,
    isXingHeader,
    xingOffset,
    xingType,
  };
}

/**
 * Scans an MP3 byte stream, strips any ID3 tags, and extracts clean MPEG audio frames
 */
export function extractMp3AudioFrames(rawBuffer: ArrayBuffer): {
  audioBytes: Uint8Array;
  frameCount: number;
  durationSec: number;
  sampleRate: number;
  bitrate: number;
  firstFrameHeader: MPEGFrameHeader | null;
  hasXingHeader: boolean;
  firstFrameBytes: Uint8Array | null;
} {
  const bytes = stripID3Tags(rawBuffer);
  let offset = 0;
  let frameCount = 0;
  let totalSamples = 0;
  let sampleRate = 44100;
  let bitrate = 128;
  let firstFrameHeader: MPEGFrameHeader | null = null;
  let firstFrameBytes: Uint8Array | null = null;
  let hasXingHeader = false;

  const validFrameChunks: Uint8Array[] = [];

  while (offset < bytes.length - 4) {
    // Find next sync word
    if (bytes[offset] === 0xff && (bytes[offset + 1] & 0xe0) === 0xe0) {
      const header = parseMpegFrameHeader(bytes, offset);
      if (header) {
        const frameData = bytes.subarray(offset, offset + header.frameLength);

        if (!firstFrameHeader) {
          firstFrameHeader = header;
          sampleRate = header.sampleRate;
          bitrate = header.bitrate;
          firstFrameBytes = new Uint8Array(frameData);
          if (header.isXingHeader) {
            hasXingHeader = true;
          }
        }

        // If this is a subsequent frame and it's a dummy Xing/Info header, skip it!
        if (frameCount > 0 && header.isXingHeader) {
          offset += header.frameLength;
          continue;
        }

        validFrameChunks.push(frameData);
        frameCount++;
        totalSamples += header.samplesPerFrame;
        offset += header.frameLength;
        continue;
      }
    }
    offset++;
  }

  // Combine valid frames
  let totalAudioLen = 0;
  validFrameChunks.forEach((c) => (totalAudioLen += c.length));
  const audioBytes = new Uint8Array(totalAudioLen);
  let writePos = 0;
  validFrameChunks.forEach((c) => {
    audioBytes.set(c, writePos);
    writePos += c.length;
  });

  const durationSec = totalSamples > 0 && sampleRate > 0 ? totalSamples / sampleRate : (audioBytes.length * 8) / (bitrate * 1000);

  return {
    audioBytes,
    frameCount,
    durationSec,
    sampleRate,
    bitrate,
    firstFrameHeader,
    hasXingHeader,
    firstFrameBytes,
  };
}

/**
 * Checks if a buffer is a WAV/RIFF file and converts it to MP3 using lamejs
 */
export function convertWavToMp3IfNecessary(buffer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(buffer);
  // Check "RIFF" and "WAVE"
  if (
    bytes.length > 44 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    try {
      const view = new DataView(buffer);
      const channels = view.getUint16(22, true);
      const sampleRate = view.getUint32(24, true);
      const bitDepth = view.getUint16(34, true);

      // Find data chunk
      let dataOffset = 12;
      let dataSize = 0;
      while (dataOffset < bytes.length - 8) {
        const chunkId = String.fromCharCode(
          bytes[dataOffset],
          bytes[dataOffset + 1],
          bytes[dataOffset + 2],
          bytes[dataOffset + 3]
        );
        const chunkSize = view.getUint32(dataOffset + 4, true);
        if (chunkId === 'data') {
          dataOffset += 8;
          dataSize = chunkSize;
          break;
        }
        dataOffset += 8 + chunkSize;
      }

      if (dataSize > 0 && bitDepth === 16) {
        const encoder = new Mp3Encoder(channels, sampleRate, 192);
        const sampleCount = Math.floor(dataSize / (2 * channels));
        const left = new Int16Array(sampleCount);
        const right = channels > 1 ? new Int16Array(sampleCount) : left;

        let srcPos = dataOffset;
        for (let i = 0; i < sampleCount; i++) {
          left[i] = view.getInt16(srcPos, true);
          srcPos += 2;
          if (channels > 1) {
            right[i] = view.getInt16(srcPos, true);
            srcPos += 2;
          }
        }

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
        const out = new Uint8Array(totalLen);
        let wp = 0;
        mp3Chunks.forEach((c) => {
          out.set(c, wp);
          wp += c.length;
        });
        return out;
      }
    } catch (err) {
      console.warn('WAV to MP3 transcoding fallback:', err);
    }
  }

  return bytes;
}

/**
 * Creates an accurate, universal Master Xing/Info header frame
 * with full frame count, total byte count, and proportional seek TOC table.
 */
export function createMasterXingFrame(
  totalFrames: number,
  totalAudioBytes: number,
  sampleRate: number = 44100,
  bitrate: number = 192,
  channels: number = 2
): Uint8Array {
  // We create a standard MPEG-1 Layer 3 silent frame at standard bitrate (e.g. 192kbps or 128kbps)
  // MPEG-1 Layer 3, 192 kbps, 44100 Hz, Joint Stereo, no padding
  const padding = 0;
  const frameLength = Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
  const frame = new Uint8Array(frameLength);

  // Header: 0xFF, 0xFB (MPEG 1 Layer 3, no CRC)
  frame[0] = 0xff;
  frame[1] = 0xfb;

  // Bitrate index for 192kbps = 0x0B (11), Sample rate index 44100 = 0x00
  let bitrateIdx = 9; // default 128k
  if (bitrate >= 192) bitrateIdx = 11;
  else if (bitrate >= 160) bitrateIdx = 10;
  else if (bitrate >= 128) bitrateIdx = 9;
  else if (bitrate >= 96) bitrateIdx = 7;
  else if (bitrate >= 64) bitrateIdx = 5;

  let srIdx = 0;
  if (sampleRate === 48000) srIdx = 1;
  else if (sampleRate === 32000) srIdx = 2;

  frame[2] = (bitrateIdx << 4) | (srIdx << 2) | (padding << 1);
  // Channel mode: 0x40 (Joint Stereo) or 0xC0 (Mono)
  frame[3] = channels === 1 ? 0xc0 : 0x40;

  // Xing offset for MPEG-1 Stereo is 4 + 32 = 36
  const xingOffset = channels === 1 ? 21 : 36;

  // Write "Info" (for CBR/stitched stream)
  frame[xingOffset] = 0x49; // 'I'
  frame[xingOffset + 1] = 0x6e; // 'n'
  frame[xingOffset + 2] = 0x66; // 'f'
  frame[xingOffset + 3] = 0x6f; // 'o'

  // Flags: Frames (0x01) | Bytes (0x02) | TOC (0x04) | Quality (0x08) = 0x0F
  frame[xingOffset + 4] = 0x00;
  frame[xingOffset + 5] = 0x00;
  frame[xingOffset + 6] = 0x00;
  frame[xingOffset + 7] = 0x0f;

  // Total Frames (uint32 BE)
  const totalFramesWithHeader = totalFrames + 1;
  frame[xingOffset + 8] = (totalFramesWithHeader >> 24) & 0xff;
  frame[xingOffset + 9] = (totalFramesWithHeader >> 16) & 0xff;
  frame[xingOffset + 10] = (totalFramesWithHeader >> 8) & 0xff;
  frame[xingOffset + 11] = totalFramesWithHeader & 0xff;

  // Total Bytes including this frame (uint32 BE)
  const totalBytesWithHeader = totalAudioBytes + frameLength;
  frame[xingOffset + 12] = (totalBytesWithHeader >> 24) & 0xff;
  frame[xingOffset + 13] = (totalBytesWithHeader >> 16) & 0xff;
  frame[xingOffset + 14] = (totalBytesWithHeader >> 8) & 0xff;
  frame[xingOffset + 15] = totalBytesWithHeader & 0xff;

  // TOC table: 100 points, linearly interpolated across the whole file
  for (let i = 0; i < 100; i++) {
    const tocValue = Math.min(255, Math.floor((i / 100) * 256));
    frame[xingOffset + 16 + i] = tocValue;
  }

  // Quality rating (100 = high quality)
  frame[xingOffset + 116] = 0x00;
  frame[xingOffset + 117] = 0x00;
  frame[xingOffset + 118] = 0x00;
  frame[xingOffset + 119] = 0x64;

  return frame;
}

/**
 * Stitches multiple audio chapters into a single master MP3 with:
 * - Robust MPEG frame parsing & concatenation
 * - Elimination of mid-stream Xing/Info dummy frames that prematurely stop playback
 * - Master Xing/Info header with total stitched frame count and byte length
 * - Comprehensive ID3v2.3 tags with TLEN, CHAP chapter markers, CTOC table of contents, and cover art
 */
export async function stitchMasterAudiobookSafe(
  chapters: AudioChapter[],
  metadata: AudiobookMetadata,
  artworkData?: { mimeType: string; data: ArrayBuffer | Uint8Array },
  onProgress?: (percent: number, message: string) => void
): Promise<{ blob: Blob; totalDuration: number }> {
  if (!chapters || chapters.length === 0) {
    throw new Error('No chapters available to stitch.');
  }

  onProgress?.(5, 'Extracting audio frames from chapter tracks...');

  interface ChapterStream {
    chapter: AudioChapter;
    audioBytes: Uint8Array;
    frameCount: number;
    durationSec: number;
    sampleRate: number;
    bitrate: number;
  }

  const processedStreams: ChapterStream[] = [];
  let grandTotalFrames = 0;
  let grandTotalAudioBytes = 0;
  let masterSampleRate = 44100;
  let masterBitrate = 128;

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    let rawBuffer: ArrayBuffer | null = null;

    if (ch.arrayBuffer) {
      rawBuffer = ch.arrayBuffer;
    } else if (ch.blob) {
      rawBuffer = await ch.blob.arrayBuffer();
    } else if (ch.file) {
      rawBuffer = await ch.file.arrayBuffer();
    }

    if (!rawBuffer) {
      throw new Error(`Missing audio data for chapter ${i + 1}: "${ch.title}"`);
    }

    // Transcode if WAV
    const convertedBytes = convertWavToMp3IfNecessary(rawBuffer);

    // Extract genuine audio frames
    const extracted = extractMp3AudioFrames(convertedBytes.buffer);

    let streamAudio = extracted.audioBytes;

    // For chapters 2..N: If the first frame is a Xing/Info dummy header, discard it
    if (i > 0 && extracted.hasXingHeader && extracted.firstFrameBytes) {
      // The first frame was a dummy Xing frame; strip it so it doesn't interrupt mid-stream
      streamAudio = streamAudio.subarray(extracted.firstFrameBytes.length);
    }

    // For chapter 1: if it has a Xing frame, also strip it so we replace with unified master Xing frame
    if (i === 0 && extracted.hasXingHeader && extracted.firstFrameBytes) {
      streamAudio = streamAudio.subarray(extracted.firstFrameBytes.length);
    }

    if (i === 0) {
      masterSampleRate = extracted.sampleRate || 44100;
      masterBitrate = extracted.bitrate || 128;
    }

    processedStreams.push({
      chapter: ch,
      audioBytes: streamAudio,
      frameCount: extracted.frameCount,
      durationSec: ch.duration > 0 ? ch.duration : extracted.durationSec,
      sampleRate: extracted.sampleRate,
      bitrate: extracted.bitrate,
    });

    grandTotalFrames += extracted.frameCount;
    grandTotalAudioBytes += streamAudio.length;

    const progress = 5 + Math.round(((i + 1) / chapters.length) * 55);
    onProgress?.(progress, `Processed chapter ${i + 1} of ${chapters.length}: "${ch.title}"`);
  }

  onProgress?.(65, 'Building unified master Xing stream header...');

  // Create unified Master Xing header
  const masterXingFrame = createMasterXingFrame(
    grandTotalFrames,
    grandTotalAudioBytes,
    masterSampleRate,
    masterBitrate,
    2
  );

  onProgress?.(75, 'Synthesizing synchronized chapter markers and ID3v2 TOC tags...');

  // Calculate cumulative offsets
  let runningOffset = 0;
  const id3Chapters = chapters.map((ch, idx) => {
    const stream = processedStreams[idx];
    const duration = ch.duration || stream.durationSec;
    const startMs = Math.round(runningOffset * 1000);
    runningOffset += duration;
    const endMs = Math.round(runningOffset * 1000);

    return {
      id: `ch_${idx + 1}`,
      startTimeMs: startMs,
      endTimeMs: endMs,
      title: ch.title,
    };
  });

  const totalDuration = runningOffset;
  const totalDurationMs = Math.round(totalDuration * 1000);

  const tagData: ID3TagData = {
    title: metadata.title || 'Audiobook',
    artist: metadata.author || 'Unknown Author',
    album: metadata.title || 'Audiobook',
    year: metadata.year || new Date().getFullYear().toString(),
    genre: metadata.genre || 'Audiobook',
    composer: metadata.narrator || undefined,
    durationMs: totalDurationMs,
    comment: `${metadata.description || ''}\nChapters: ${chapters.length} | Stitched with Audiobook Chapter Studio`,
    image: artworkData,
    chapters: id3Chapters,
  };

  const id3TagBuffer = buildID3TagBuffer(tagData);

  onProgress?.(85, 'Assembling complete seamless master audiobook package...');

  // Combine: [ID3v2 Tag Header] + [Master Xing Frame] + [Chapter 1 Audio] + [Chapter 2 Audio] + ... + [Chapter N Audio]
  // Using Blob chunk list directly eliminates the risk of giant contiguous ArrayBuffer allocation failures
  const blobParts: BlobPart[] = [id3TagBuffer, masterXingFrame];
  for (const stream of processedStreams) {
    blobParts.push(stream.audioBytes);
  }

  const blob = new Blob(blobParts, { type: 'audio/mp3' });

  onProgress?.(100, 'Master audiobook successfully stitched and packaged!');

  return {
    blob,
    totalDuration,
  };
}
