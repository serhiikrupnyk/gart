export const CHAT_ROLES = ['TRAINER', 'CLIENT'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];

export const MESSAGE_BODY_MAX_LENGTH = 2000;
export const MESSAGES_PER_PAGE = 30;

/** How much of a message rides along in a notification. */
export const MESSAGE_PREVIEW_LENGTH = 80;

export interface ChatMessage {
  id: string;
  senderRole: ChatRole;
  body: string;
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

export interface SendChatMessageRequest {
  body: string;
}

export interface OpenThreadRequest {
  clientId: string;
}

/** What the SSE stream emits. One event type today: a new message. */
export interface ChatStreamEvent {
  threadId: string;
  message: ChatMessage;
}
