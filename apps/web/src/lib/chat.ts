import type {
  ChatAttachmentKind,
  ChatAttachmentUpload,
  ChatHistory,
  ChatMessage,
  ChatStreamEvent,
  ChatThreadSummary,
  MediaUrlResponse,
  PresignMediaResponse,
} from '@gart/shared';

import { API_URL, apiFetch } from './api';

export function openThread(clientId: string): Promise<ChatThreadSummary> {
  return apiFetch<ChatThreadSummary>('/chat/threads', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  });
}

export function getMyThread(): Promise<ChatThreadSummary> {
  return apiFetch<ChatThreadSummary>('/chat/thread');
}

export function getHistory(threadId: string, before?: string): Promise<ChatHistory> {
  const query = before === undefined ? '' : `?before=${before}`;

  return apiFetch<ChatHistory>(`/chat/threads/${threadId}/messages${query}`);
}

export function sendMessage(
  threadId: string,
  body: string,
  attachment?: ChatAttachmentUpload,
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/chat/threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify(attachment === undefined ? { body } : { body, attachment }),
  });
}

export function presignAttachment(
  threadId: string,
  kind: ChatAttachmentKind,
  contentType: string,
  sizeBytes: number,
): Promise<PresignMediaResponse> {
  return apiFetch<PresignMediaResponse>(`/chat/threads/${threadId}/attachments/presign`, {
    method: 'POST',
    body: JSON.stringify({ kind, contentType, sizeBytes }),
  });
}

/** Minted per view — nothing is fetched until an attachment is opened. */
export function getAttachmentUrl(attachmentId: string): Promise<MediaUrlResponse> {
  return apiFetch<MediaUrlResponse>(`/chat/attachments/${attachmentId}/url`);
}

export function markThreadRead(threadId: string): Promise<null> {
  return apiFetch<null>(`/chat/threads/${threadId}/read`, { method: 'POST' });
}

/**
 * Live delivery, and nothing depends on it: the browser reconnects on its own,
 * and every message is already readable over plain HTTP. `withCredentials`
 * carries the same session cookie every other request uses.
 */
export function subscribeToThread(
  threadId: string,
  onMessage: (event: ChatStreamEvent) => void,
): () => void {
  if (typeof EventSource === 'undefined') {
    return () => undefined;
  }

  const source = new EventSource(`${API_URL}/chat/threads/${threadId}/stream`, {
    withCredentials: true,
  });

  source.onmessage = (event: MessageEvent<string>) => {
    try {
      onMessage(JSON.parse(event.data) as ChatStreamEvent);
    } catch {
      // A malformed frame is not worth breaking the conversation over.
    }
  };

  return () => {
    source.close();
  };
}
