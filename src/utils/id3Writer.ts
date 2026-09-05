/**
 * Pure TypeScript ID3v2.3 Tag Writer and Parser.
 * Compatible with all modern media players, iTunes/Apple Books, VLC, and hardware players.
 */

export interface ID3TagData {
  title?: string;
  artist?: string;
  album?: string;
  track?: string; // e.g. "1/12"
  year?: string;
  genre?: string;
  comment?: string;
  composer?: string;
  durationMs?: number; // Total length in milliseconds for TLEN frame
  image?: {
    mimeType: string;
    description?: string;
    data: ArrayBuffer | Uint8Array;
  };
  chapters?: Array<{
    id: string;
    startTimeMs: number;
    endTimeMs: number;
    title: string;
  }>;
}

/**
 * Encodes text to UTF-16LE with BOM or ISO-8859-1 for ID3 frames
 */
function encodeTextUTF16(str: string): Uint8Array {
  const buf = new Uint8Array(str.length * 2 + 2);
  // UTF-16LE BOM: 0xFF, 0xFE
  buf[0] = 0xff;
  buf[1] = 0xfe;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    buf[2 + i * 2] = code & 0xff;
    buf[2 + i * 2 + 1] = (code >> 8) & 0xff;
  }
  return buf;
}

function encodeTextLatin1(str: string): Uint8Array {
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    buf[i] = str.charCodeAt(i) & 0xff;
  }
  return buf;
}

/**
 * Creates an ID3v2.3 frame with 10-byte header
 */
function createTextFrame(frameId: string, text: string): Uint8Array {
  if (!text) return new Uint8Array(0);
  const encoded = encodeTextUTF16(text);
  const framePayload = new Uint8Array(encoded.length + 1);
  framePayload[0] = 0x01; // UTF-16 with BOM encoding flag
  framePayload.set(encoded, 1);

  const frameSize = framePayload.length;
  const frame = new Uint8Array(10 + frameSize);

  // Frame ID (4 bytes)
  for (let i = 0; i < 4; i++) {
    frame[i] = frameId.charCodeAt(i);
  }

  // Frame size (4 bytes big-endian)
  frame[4] = (frameSize >> 24) & 0xff;
  frame[5] = (frameSize >> 16) & 0xff;
  frame[6] = (frameSize >> 8) & 0xff;
  frame[7] = frameSize & 0xff;

  // Flags (2 bytes)
  frame[8] = 0x00;
  frame[9] = 0x00;

  // Payload
  frame.set(framePayload, 10);
  return frame;
}

/**
 * Creates an ID3v2.3 APIC (Attached Picture) frame
 */
function createAPICFrame(image: {
  mimeType: string;
  description?: string;
  data: ArrayBuffer | Uint8Array;
}): Uint8Array {
  const imageData = image.data instanceof Uint8Array ? image.data : new Uint8Array(image.data);
  const mime = encodeTextLatin1(image.mimeType || 'image/jpeg');
  const desc = encodeTextLatin1(image.description || 'Cover');

  // Encoding (1 byte = 0 for ISO-8859-1) + MIME string + null (1 byte) + Picture Type (1 byte = 0x03 Cover Front) + Desc + null (1 byte) + Image Data
  const payloadLength = 1 + mime.length + 1 + 1 + desc.length + 1 + imageData.length;
  const payload = new Uint8Array(payloadLength);

  let offset = 0;
  payload[offset++] = 0x00; // ISO-8859-1 encoding for mime/desc
  payload.set(mime, offset);
  offset += mime.length;
  payload[offset++] = 0x00; // null terminator for MIME

  payload[offset++] = 0x03; // Picture Type: 0x03 = Cover (front)

  payload.set(desc, offset);
  offset += desc.length;
  payload[offset++] = 0x00; // null terminator for description

  payload.set(imageData, offset);

  const frameSize = payload.length;
  const frame = new Uint8Array(10 + frameSize);

  // Frame ID: "APIC"
  frame[0] = 0x41; // 'A'
  frame[1] = 0x50; // 'P'
  frame[2] = 0x49; // 'I'
  frame[3] = 0x43; // 'C'

  frame[4] = (frameSize >> 24) & 0xff;
  frame[5] = (frameSize >> 16) & 0xff;
  frame[6] = (frameSize >> 8) & 0xff;
  frame[7] = frameSize & 0xff;

  frame[8] = 0x00;
  frame[9] = 0x00;

  frame.set(payload, 10);
  return frame;
}

/**
 * Creates an ID3v2.3 COMM (Comments) frame
 */
function createCommentFrame(comment: string): Uint8Array {
  if (!comment) return new Uint8Array(0);
  const lang = encodeTextLatin1('eng');
  const desc = encodeTextUTF16('');
  const text = encodeTextUTF16(comment);

  const payloadLength = 1 + 3 + desc.length + 2 + text.length;
  const payload = new Uint8Array(payloadLength);

  let offset = 0;
  payload[offset++] = 0x01; // UTF-16
  payload.set(lang, offset);
  offset += 3;

  payload.set(desc, offset);
  offset += desc.length;
  payload[offset++] = 0x00;
  payload[offset++] = 0x00;

  payload.set(text, offset);

  const frameSize = payload.length;
  const frame = new Uint8Array(10 + frameSize);

  frame[0] = 0x43; // 'C'
  frame[1] = 0x4f; // 'O'
  frame[2] = 0x4d; // 'M'
  frame[3] = 0x4d; // 'M'

  frame[4] = (frameSize >> 24) & 0xff;
  frame[5] = (frameSize >> 16) & 0xff;
  frame[6] = (frameSize >> 8) & 0xff;
  frame[7] = frameSize & 0xff;

  frame[8] = 0x00;
  frame[9] = 0x00;

  frame.set(payload, 10);
  return frame;
}

/**
 * Creates ID3v2.3 CHAP (Chapter) frames and CTOC (Table of Contents) frame
 */
function createChapterFrames(chapters: Array<{ id: string; startTimeMs: number; endTimeMs: number; title: string }>): Uint8Array[] {
  if (!chapters || chapters.length === 0) return [];
  const frames: Uint8Array[] = [];
  const elementIds: string[] = [];

  chapters.forEach((ch, idx) => {
    const elemId = `chp${idx}`;
    elementIds.push(elemId);
    const elemIdBytes = encodeTextLatin1(elemId);
    const subFrame = createTextFrame('TIT2', ch.title);

    // Payload: Element ID + null (1) + Start Time (4) + End Time (4) + Start Offset (4) + End Offset (4) + Sub-frames
    const payloadLen = elemIdBytes.length + 1 + 4 + 4 + 4 + 4 + subFrame.length;
    const payload = new Uint8Array(payloadLen);

    let offset = 0;
    payload.set(elemIdBytes, offset);
    offset += elemIdBytes.length;
    payload[offset++] = 0x00;

    // Start time (ms)
    payload[offset++] = (ch.startTimeMs >> 24) & 0xff;
    payload[offset++] = (ch.startTimeMs >> 16) & 0xff;
    payload[offset++] = (ch.startTimeMs >> 8) & 0xff;
    payload[offset++] = ch.startTimeMs & 0xff;

    // End time (ms)
    payload[offset++] = (ch.endTimeMs >> 24) & 0xff;
    payload[offset++] = (ch.endTimeMs >> 16) & 0xff;
    payload[offset++] = (ch.endTimeMs >> 8) & 0xff;
    payload[offset++] = ch.endTimeMs & 0xff;

    // Start offset in bytes (0xFFFFFFFF = unused)
    payload[offset++] = 0xff;
    payload[offset++] = 0xff;
    payload[offset++] = 0xff;
    payload[offset++] = 0xff;

    // End offset in bytes (0xFFFFFFFF = unused)
    payload[offset++] = 0xff;
    payload[offset++] = 0xff;
    payload[offset++] = 0xff;
    payload[offset++] = 0xff;

    // Sub-frame (TIT2)
    payload.set(subFrame, offset);

    const frameSize = payload.length;
    const frame = new Uint8Array(10 + frameSize);
    frame[0] = 0x43; // C
    frame[1] = 0x48; // H
    frame[2] = 0x41; // A
    frame[3] = 0x50; // P

    frame[4] = (frameSize >> 24) & 0xff;
    frame[5] = (frameSize >> 16) & 0xff;
    frame[6] = (frameSize >> 8) & 0xff;
    frame[7] = frameSize & 0xff;

    frame[8] = 0x00;
    frame[9] = 0x00;

    frame.set(payload, 10);
    frames.push(frame);
  });

  // Now create CTOC (Table of Contents) frame
  const tocId = encodeTextLatin1('toc');
  const flags = 0x03; // top-level + ordered
  const entryCount = elementIds.length;
  
  let tocEntriesLen = 0;
  const entryBytesList: Uint8Array[] = [];
  elementIds.forEach(id => {
    const bytes = encodeTextLatin1(id);
    const withNull = new Uint8Array(bytes.length + 1);
    withNull.set(bytes, 0);
    withNull[bytes.length] = 0x00;
    entryBytesList.push(withNull);
    tocEntriesLen += withNull.length;
  });

  const tocSubFrame = createTextFrame('TIT2', 'Table of Contents');
  const tocPayloadLen = tocId.length + 1 + 1 + 1 + tocEntriesLen + tocSubFrame.length;
  const tocPayload = new Uint8Array(tocPayloadLen);

  let tocOff = 0;
  tocPayload.set(tocId, tocOff);
  tocOff += tocId.length;
  tocPayload[tocOff++] = 0x00;

  tocPayload[tocOff++] = flags;
  tocPayload[tocOff++] = entryCount;

  entryBytesList.forEach(eb => {
    tocPayload.set(eb, tocOff);
    tocOff += eb.length;
  });

  tocPayload.set(tocSubFrame, tocOff);

  const tocFrame = new Uint8Array(10 + tocPayloadLen);
  tocFrame[0] = 0x43; // C
  tocFrame[1] = 0x54; // T
  tocFrame[2] = 0x4f; // O
  tocFrame[3] = 0x43; // C

  tocFrame[4] = (tocPayloadLen >> 24) & 0xff;
  tocFrame[5] = (tocPayloadLen >> 16) & 0xff;
  tocFrame[6] = (tocPayloadLen >> 8) & 0xff;
  tocFrame[7] = tocPayloadLen & 0xff;

  tocFrame[8] = 0x00;
  tocFrame[9] = 0x00;

  tocFrame.set(tocPayload, 10);
  frames.unshift(tocFrame);

  return frames;
}

/**
 * Builds a complete ID3v2.3 header and tag block
 */
export function buildID3TagBuffer(tags: ID3TagData): Uint8Array {
  const frames: Uint8Array[] = [];

  if (tags.title) frames.push(createTextFrame('TIT2', tags.title));
  if (tags.artist) {
    frames.push(createTextFrame('TPE1', tags.artist));
    frames.push(createTextFrame('TPE2', tags.artist)); // Album artist / Narrator
  }
  if (tags.album) frames.push(createTextFrame('TALB', tags.album));
  if (tags.track) frames.push(createTextFrame('TRCK', tags.track));
  if (tags.year) frames.push(createTextFrame('TYER', tags.year));
  if (tags.genre) frames.push(createTextFrame('TCON', tags.genre));
  if (tags.composer) frames.push(createTextFrame('TCOM', tags.composer));
  if (tags.durationMs && tags.durationMs > 0) {
    frames.push(createTextFrame('TLEN', Math.round(tags.durationMs).toString()));
  }
  if (tags.comment) frames.push(createCommentFrame(tags.comment));
  if (tags.image && tags.image.data) {
    frames.push(createAPICFrame(tags.image));
  }
  if (tags.chapters && tags.chapters.length > 0) {
    const chapterFrames = createChapterFrames(tags.chapters);
    frames.push(...chapterFrames);
  }

  // Calculate total frames size
  let framesSize = 0;
  frames.forEach(f => {
    framesSize += f.length;
  });

  // ID3v2 size is encoded as syncsafe integer (7 bits per byte)
  const syncsafeSize = [
    (framesSize >> 21) & 0x7f,
    (framesSize >> 14) & 0x7f,
    (framesSize >> 7) & 0x7f,
    framesSize & 0x7f,
  ];

  const header = new Uint8Array(10);
  header[0] = 0x49; // 'I'
  header[1] = 0x44; // 'D'
  header[2] = 0x33; // '3'
  header[3] = 0x03; // ID3v2.3.0
  header[4] = 0x00; // Revision
  header[5] = 0x00; // Flags
  header[6] = syncsafeSize[0];
  header[7] = syncsafeSize[1];
  header[8] = syncsafeSize[2];
  header[9] = syncsafeSize[3];

  const tagBuffer = new Uint8Array(10 + framesSize);
  tagBuffer.set(header, 0);

  let offset = 10;
  frames.forEach(f => {
    tagBuffer.set(f, offset);
    offset += f.length;
  });

  return tagBuffer;
}

/**
 * Removes any existing ID3v2 header and trailing ID3v1 from raw audio buffer,
 * and attaches the newly synthesized ID3v2 tag at the head.
 */
export function injectID3TagsToMP3(rawAudioBuffer: ArrayBuffer, tags: ID3TagData): Uint8Array {
  const sourceBytes = new Uint8Array(rawAudioBuffer);
  let audioStartOffset = 0;
  let audioEndOffset = sourceBytes.length;

  // Check for ID3v2 at beginning (starts with "ID3")
  if (
    sourceBytes.length > 10 &&
    sourceBytes[0] === 0x49 &&
    sourceBytes[1] === 0x44 &&
    sourceBytes[2] === 0x33
  ) {
    const size =
      ((sourceBytes[6] & 0x7f) << 21) |
      ((sourceBytes[7] & 0x7f) << 14) |
      ((sourceBytes[8] & 0x7f) << 7) |
      (sourceBytes[9] & 0x7f);
    audioStartOffset = 10 + size;
    // Guard against malformed size
    if (audioStartOffset > sourceBytes.length) {
      audioStartOffset = 0;
    }
  }

  // Check for ID3v1 at end (128 bytes starting with "TAG")
  if (sourceBytes.length > 128) {
    const tagPos = sourceBytes.length - 128;
    if (
      sourceBytes[tagPos] === 0x54 &&
      sourceBytes[tagPos + 1] === 0x41 &&
      sourceBytes[tagPos + 2] === 0x47
    ) {
      audioEndOffset = tagPos;
    }
  }

  const rawAudio = sourceBytes.subarray(audioStartOffset, audioEndOffset);
  const tagHeader = buildID3TagBuffer(tags);

  const output = new Uint8Array(tagHeader.length + rawAudio.length);
  output.set(tagHeader, 0);
  output.set(rawAudio, tagHeader.length);

  return output;
}

/**
 * Extracts raw audio payload by stripping ID3 tags (for seamless concatenation)
 */
export function stripID3Tags(rawBuffer: ArrayBuffer): Uint8Array {
  const bytes = new Uint8Array(rawBuffer);
  let start = 0;
  let end = bytes.length;

  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    start = 10 + size;
    if (start > bytes.length) start = 0;
  }

  if (bytes.length > 128) {
    const tagPos = bytes.length - 128;
    if (bytes[tagPos] === 0x54 && bytes[tagPos + 1] === 0x41 && bytes[tagPos + 2] === 0x47) {
      end = tagPos;
    }
  }

  return bytes.subarray(start, end);
}
