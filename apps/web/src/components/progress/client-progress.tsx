'use client';

import { useEffect, useState } from 'react';
import type { ClientProgress } from '@gart/shared';

import { ChartSkeleton, useToast } from '@/components/ui';
import { getClientProgress } from '@/lib/progress';
import { ExerciseHistory } from './exercise-history';
import { ProgressPhotos } from './progress-photos';
import { ProgressVariables } from './progress-variables';

/** «Прогрес» on the trainer's client page: measurements, photos, load trends. */
export function ClientProgressPanel({ clientId }: { clientId: string }) {
  const { notify } = useToast();

  const [progress, setProgress] = useState<ClientProgress | undefined>();
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    getClientProgress(clientId)
      .then((loaded) => {
        if (active) setProgress(loaded);
      })
      .catch(() => {
        notify('Не вдалося завантажити прогрес', 'danger');
      });

    return () => {
      active = false;
    };
  }, [clientId, reloadKey, notify]);

  function reload(): void {
    setReloadKey((key) => key + 1);
  }

  return (
    <section className="mt-6">
      <h2 className="text-lg font-semibold text-text">Прогрес</h2>

      {progress === undefined ? (
        <ChartSkeleton label="Завантаження прогресу" />
      ) : (
        <div className="mt-3 space-y-6">
          <ProgressVariables
            clientId={clientId}
            variables={progress.variables}
            mode="trainer"
            onChanged={reload}
          />
          <ProgressPhotos
            clientId={clientId}
            photos={progress.photos}
            canManage
            onChanged={reload}
          />
          <ExerciseHistory clientId={clientId} />
        </div>
      )}
    </section>
  );
}
