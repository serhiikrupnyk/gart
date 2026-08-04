'use client';

import { useEffect, useState } from 'react';
import type { ChatThreadSummary } from '@gart/shared';

import { Conversation } from '@/components/chat/conversation';
import { Spinner, useToast } from '@/components/ui';
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
    return (
      <div className="flex justify-center py-16">
        <Spinner size="lg" label="Завантаження чату" />
      </div>
    );
  }

  return (
    <>
      <h1 className="pb-4 text-2xl font-semibold tracking-tight text-text">{thread.title}</h1>
      <Conversation threadId={thread.id} mine="CLIENT" />
    </>
  );
}
