import {
  CHAT_ATTACHMENT_RULES,
  type ChatAttachmentKind,
  type ChatAttachmentUpload,
} from '@gart/shared';

import { presignAttachment } from './chat';
import { uploadToStorage } from './upload';

/**
 * `MediaRecorder` reports types like `audio/webm;codecs=opus`. The parameter
 * would fail the allowlist AND break the presigned signature, since the
 * browser must send back exactly what was signed — so it is stripped once,
 * here, and the blob is re-wrapped with the base type before uploading.
 */
export function baseContentType(type: string): string {
  return type.split(';')[0]?.trim() ?? '';
}

export function attachmentKindFor(type: string): ChatAttachmentKind | null {
  const base = baseContentType(type);

  if (CHAT_ATTACHMENT_RULES.IMAGE.contentTypes.includes(base)) return 'IMAGE';
  if (CHAT_ATTACHMENT_RULES.VIDEO.contentTypes.includes(base)) return 'VIDEO';
  if (CHAT_ATTACHMENT_RULES.VOICE.contentTypes.includes(base)) return 'VOICE';

  return null;
}

export class AttachmentRejected extends Error {}

/**
 * The Step 8 flow, unchanged: presign, PUT straight to storage, then hand the
 * key back with the message. The browser refuses what the API would refuse,
 * so an oversized file never leaves the device.
 */
export async function uploadAttachment(
  threadId: string,
  file: Blob,
  kind: ChatAttachmentKind,
  onProgress: (fraction: number) => void,
  durationSeconds?: number,
): Promise<ChatAttachmentUpload> {
  const contentType = baseContentType(file.type);
  const rules = CHAT_ATTACHMENT_RULES[kind];

  if (!rules.contentTypes.includes(contentType)) {
    throw new AttachmentRejected('Непідтримуваний тип файлу');
  }
  if (file.size > rules.maxSizeBytes) {
    throw new AttachmentRejected('Файл завеликий');
  }

  const presigned = await presignAttachment(threadId, kind, contentType, file.size);

  // Re-wrapped so the PUT sends exactly the type that was signed.
  await uploadToStorage(presigned.uploadUrl, new Blob([file], { type: contentType }), onProgress);

  return { key: presigned.key, kind, durationSeconds };
}
