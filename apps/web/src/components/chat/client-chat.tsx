'use client';

import { useEffect, useState } from 'react';
import type { ChatThreadSummary } from '@gart/shared';

import { Conversation } from '@/components/chat/conversation';
import { ChatSkeleton, useToast } from '@/components/ui';
import { openThread } from '@/lib/chat';

/** «Чат» on the trainer's client page — where they already are when they think of that client. */
export function ClientChat({ clientId }: { clientId: string }) {
  const { notify } = useToast();
  const [thread, setThread] = useState<ChatThreadSummary | undefined>();

  useEffect(() => {
    let active = true;

    openThread(clientId)
      .then((loaded) => {
        if (active) setThread(loaded);
      })
      .catch(() => {
        notify('Не вдалося відкрити чат', 'danger');
      });

    return () => {
      active = false;
    };
  }, [clientId, notify]);

  return (
    <section id="chat" className="mt-6">
      <h2 className="text-lg font-semibold text-text">Чат</h2>

      <div className="mt-3">
        {thread === undefined ? (
          <ChatSkeleton label="Завантаження чату" />
        ) : (
          <Conversation threadId={thread.id} mine="TRAINER" />
        )}
      </div>
    </section>
  );
}
