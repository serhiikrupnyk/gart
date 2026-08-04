'use client';

import { useEffect, useState } from 'react';
import type { ClientProgress } from '@gart/shared';

import { ProgressPhotos } from '@/components/progress/progress-photos';
import { ProgressVariables } from '@/components/progress/progress-variables';
import { ChartSkeleton, EmptyState, useToast } from '@/components/ui';
import { getMyProgress } from '@/lib/progress';

/** The client's own «Прогрес»: their charts, their measurements, their photos. */
export default function ClientProgressPage() {
  const { notify } = useToast();

  const [progress, setProgress] = useState<ClientProgress | undefined>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    getMyProgress()
      .then((loaded) => {
        if (active) setProgress(loaded);
      })
      .catch(() => {
        notify('Не вдалося завантажити прогрес', 'danger');
      });

    return () => {
      active = false;
    };
  }, [reloadKey, notify]);

  if (progress === undefined) {
    return <ChartSkeleton label="Завантаження прогресу" />;
  }

  const empty = progress.variables.length === 0 && progress.photos.length === 0;

  return (
    <>
      <h1 className="pb-6 text-2xl font-semibold tracking-tight text-text">Прогрес</h1>

      {empty ? (
        <EmptyState
          title="Ще немає замірів"
          description="Коли тренер додасть показники або фото, вони зʼявляться тут."
        />
      ) : (
        <div className="space-y-6">
          <ProgressVariables
            clientId=""
            variables={progress.variables}
            mode="client"
            onChanged={() => {
              setReloadKey((key) => key + 1);
            }}
          />
          <ProgressPhotos
            clientId=""
            photos={progress.photos}
            canManage={false}
            onChanged={() => {
              setReloadKey((key) => key + 1);
            }}
          />
        </div>
      )}
    </>
  );
}
