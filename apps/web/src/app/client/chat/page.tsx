'use client';

import { useEffect, useState } from 'react';
import type { ChatThreadSummary } from '@gart/shared';

import { Conversation } from '@/components/chat/conversation';
import { ChatSkeleton, useToast } from '@/components/ui';
import { getMyThread } from '@/lib/chat';

/** The client's one conversation, with their trainer. */
export default function ClientChatPage() {
  const { notify } = useToast();
  const [thread, setThread] = useState<ChatThreadSummary | undefined>();

  useEffect(() => {
    let active = true;

    getMyThread()
      .then((loaded) => {
        if (active) setThread(loaded);
      })
      .catch(() => {
        notify('Не вдалося відкрити чат', 'danger');
      });

    return () => {
      active = false;
    };
  }, [notify]);

  if (thread === undefined) {
    return <ChatSkeleton label="Завантаження чату" />;
  }

  return (
    <>
      <p className="mb-2 text-2xs font-bold uppercase tracking-[0.16em] text-accent-text">
        Звʼязок із тренером
      </p>
      <h1 className="pb-4 text-3xl font-bold tracking-[-0.045em] text-text sm:text-4xl">
        {thread.title}
      </h1>
      <Conversation threadId={thread.id} mine="CLIENT" />
    </>
  );
}
