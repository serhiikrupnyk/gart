import {
  CHAT_ATTACHMENT_RULES,
  MEDIA_RULES,
  PROGRESS_PHOTO_RULES,
  type ChatAttachmentKind,
  type MediaKind,
} from '@gart/shared';

/**
 * The entire media-type policy in one table: what each kind accepts, the file
 * extension we derive (never taken from user input), and how the leading bytes
 * must look. The client-declared content type is checked here at presign, but
 * finalize re-verifies against storage AND against the magic numbers — the
 * declaration is never trusted alone.
 */
interface MediaTypeRule {
  extension: string;
  matchesMagic: (bytes: Buffer) => boolean;
}

/** ISO-BMFF ("ftyp" at offset 4) — mp4 video and m4a audio alike. */
function isIsoBmff(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.toString('latin1', 4, 8) === 'ftyp';
}

/** Matroska/WebM EBML header. */
function isEbml(bytes: Buffer): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  );
}

/** MP3: an ID3 tag, or a raw MPEG audio frame sync. */
function isMp3(bytes: Buffer): boolean {
  if (bytes.length >= 3 && bytes.toString('latin1', 0, 3) === 'ID3') {
    return true;
  }

  return bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0;
}

function isJpeg(bytes: Buffer): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function isPng(bytes: Buffer): boolean {
  return bytes.length >= 8 && bytes.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n';
}

/** RIFF container whose form type is WEBP. */
function isWebp(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  );
}

/**
 * Progress photos live in the same policy table rather than a parallel one:
 * one place decides what may be stored and how its bytes must look.
 */
export const IMAGE_TYPE_RULES: Record<string, MediaTypeRule> = {
  'image/jpeg': { extension: 'jpg', matchesMagic: isJpeg },
  'image/png': { extension: 'png', matchesMagic: isPng },
  'image/webp': { extension: 'webp', matchesMagic: isWebp },
};

export const IMAGE_SIZE_LIMIT = PROGRESS_PHOTO_RULES.maxSizeBytes;

/** Ogg container — Firefox's MediaRecorder output. */
function isOgg(bytes: Buffer): boolean {
  return bytes.length >= 4 && bytes.toString('latin1', 0, 4) === 'OggS';
}

/**
 * Chat attachments compose matchers that already exist rather than adding a
 * second policy: audio/webm is the same EBML container as video/webm, and
 * audio/mp4 the same ISO-BMFF as video/mp4.
 */
export const CHAT_TYPE_RULES: Record<ChatAttachmentKind, Record<string, MediaTypeRule>> = {
  VOICE: {
    'audio/webm': { extension: 'weba', matchesMagic: isEbml },
    'audio/mp4': { extension: 'm4a', matchesMagic: isIsoBmff },
    'audio/ogg': { extension: 'ogg', matchesMagic: isOgg },
    'audio/mpeg': { extension: 'mp3', matchesMagic: isMp3 },
  },
  IMAGE: IMAGE_TYPE_RULES,
  VIDEO: {
    'video/mp4': { extension: 'mp4', matchesMagic: isIsoBmff },
    'video/webm': { extension: 'webm', matchesMagic: isEbml },
  },
};

export const CHAT_SIZE_LIMITS: Record<ChatAttachmentKind, number> = {
  VOICE: CHAT_ATTACHMENT_RULES.VOICE.maxSizeBytes,
  IMAGE: CHAT_ATTACHMENT_RULES.IMAGE.maxSizeBytes,
  VIDEO: CHAT_ATTACHMENT_RULES.VIDEO.maxSizeBytes,
};

export const MEDIA_TYPE_RULES: Record<MediaKind, Record<string, MediaTypeRule>> = {
  VIDEO: {
    'video/mp4': { extension: 'mp4', matchesMagic: isIsoBmff },
    'video/webm': { extension: 'webm', matchesMagic: isEbml },
  },
  AUDIO: {
    'audio/mpeg': { extension: 'mp3', matchesMagic: isMp3 },
    'audio/mp4': { extension: 'm4a', matchesMagic: isIsoBmff },
  },
};

/**
 * Cost guardrails, not just security ones — the numbers live in @gart/shared
 * (MEDIA_RULES) so the web pre-checks against exactly what the API enforces.
 * Egress is the real video cost (every client view re-streams the clip), which
 * is why serving is presigned (no hotlinking) and production should sit on an
 * egress-free S3 provider.
 */
export const MEDIA_SIZE_LIMITS: Record<MediaKind, number> = {
  VIDEO: MEDIA_RULES.VIDEO.maxSizeBytes,
  AUDIO: MEDIA_RULES.AUDIO.maxSizeBytes,
};

/** How many leading bytes finalize fetches for the magic check. */
export const MAGIC_BYTES_LENGTH = 12;

export function allowedContentTypes(kind: MediaKind): string[] {
  return Object.keys(MEDIA_TYPE_RULES[kind]);
}
