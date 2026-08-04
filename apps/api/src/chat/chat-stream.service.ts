import { Injectable } from '@nestjs/common';
import type { ChatRole, ChatStreamEvent } from '@gart/shared';
import { Observable, Subject, filter } from 'rxjs';

/**
 * Live delivery, in process.
 *
 * Chat is never allowed to depend on this: messages are persisted first and
 * read back over plain HTTP, so a subscriber that never connects — or a browser
 * that cannot — loses nothing but immediacy.
 *
 * Because a stream is opened PER THREAD, an open subscription is not a guess
 * about presence: it is the fact that somebody has that conversation on screen.
 * That is what lets the send path decide whether a notification is warranted
 * without timers or heartbeats.
 *
 * Multiple instances would put a Redis pub/sub adapter behind this same shape —
 * the seam this codebase has used for storage, queues and push. Building it for
 * one instance would be inventing a problem.
 */
@Injectable()
export class ChatStream {
  private readonly events = new Subject<ChatStreamEvent>();
  private readonly watchers = new Map<string, number>();

  publish(event: ChatStreamEvent): void {
    this.events.next(event);
  }

  /** Only this thread's events, and only while somebody is listening. */
  subscribe(threadId: string, role: ChatRole): Observable<ChatStreamEvent> {
    return new Observable<ChatStreamEvent>((subscriber) => {
      const key = watcherKey(threadId, role);

      this.watchers.set(key, (this.watchers.get(key) ?? 0) + 1);

      const subscription = this.events
        .pipe(filter((event) => event.threadId === threadId))
        .subscribe(subscriber);

      return () => {
        subscription.unsubscribe();

        const remaining = (this.watchers.get(key) ?? 1) - 1;

        if (remaining <= 0) {
          this.watchers.delete(key);
        } else {
          this.watchers.set(key, remaining);
        }
      };
    });
  }

  /** Whether that side currently has this conversation open. */
  isWatching(threadId: string, role: ChatRole): boolean {
    return (this.watchers.get(watcherKey(threadId, role)) ?? 0) > 0;
  }
}

function watcherKey(threadId: string, role: ChatRole): string {
  return `${threadId}:${role}`;
}
