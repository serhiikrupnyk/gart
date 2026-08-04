export const CHAT_ROLES = ['TRAINER', 'CLIENT'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const MESSAGE_BODY_MAX_LENGTH = 2000;
export const MESSAGES_PER_PAGE = 30;

/** How much of a message rides along in a notification. */
export const MESSAGE_PREVIEW_LENGTH = 80;

export const CHAT_ATTACHMENT_KINDS = ['VOICE', 'IMAGE', 'VIDEO'] as const;
export type ChatAttachmentKind = (typeof CHAT_ATTACHMENT_KINDS)[number];

export const CHAT_ATTACHMENT_LABELS: Record<ChatAttachmentKind, string> = {
  VOICE: 'Голосове повідомлення',
  IMAGE: 'Фото',
  VIDEO: 'Відео',
};

/**
 * What each kind accepts and how big it may be — the same numbers the API
 * enforces, so the browser can refuse a file before uploading it.
 */
export const CHAT_ATTACHMENT_RULES: Record<
  ChatAttachmentKind,
  { contentTypes: string[]; maxSizeBytes: number }
> = {
  // MediaRecorder emits webm (Chrome, Firefox) or mp4 (Safari); ogg and mpeg
  // cover the rest. Five megabytes is minutes of opus.
  VOICE: {
    contentTypes: ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
  IMAGE: {
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  VIDEO: { contentTypes: ['video/mp4', 'video/webm'], maxSizeBytes: 50 * 1024 * 1024 },
};

/** Recording stops itself here; a chat note is not a podcast. */
export const VOICE_MAX_SECONDS = 300;

/** Metadata only — the storage key never crosses the wire. */
export interface ChatAttachmentInfo {
  id: string;
  kind: ChatAttachmentKind;
  contentType: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

export interface ChatMessage {
  id: string;
  senderRole: ChatRole;
  /** Empty when the message is pure media. */
  body: string;
  attachment: ChatAttachmentInfo | null;
  createdAt: string;
}

/** A conversation as one participant sees it — «mine» is their own side. */
export interface ChatThreadSummary {
  id: string;
  clientId: string;
  /** The other participant's display name. */
  title: string;
  lastMessageAt: string | null;
  unreadCount: number;
}

export interface ChatHistory {
  threadId: string;
  /** Oldest first, so the UI appends downward like a conversation reads. */
  messages: ChatMessage[];
  /** Pass as `before` to walk further back; null when the start is reached. */
  nextBefore: string | null;
  unreadCount: number;
}

/** What the sender echoes back after uploading, for verification. */
export interface ChatAttachmentUpload {
  key: string;
  kind: ChatAttachmentKind;
  durationSeconds?: number | null;
}

export interface SendChatMessageRequest {
  body?: string;
  attachment?: ChatAttachmentUpload;
}

export interface PresignChatAttachmentRequest {
  kind: ChatAttachmentKind;
  contentType: string;
  sizeBytes: number;
}

export interface OpenThreadRequest {
  clientId: string;
}

/** What the SSE stream emits. One event type today: a new message. */
export interface ChatStreamEvent {
  threadId: string;
  message: ChatMessage;
}
