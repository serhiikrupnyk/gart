'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicProgramDetail } from '@gart/shared';

import { ProgramBuilder } from '@/components/programs/program-builder';
import { Button, DetailSkeleton, EmptyState } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { getProgram } from '@/lib/programs';
import { ProgressLink } from '@/components/layout/navigation-progress';

export default function EditProgramPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const programId = params.id;

  const [program, setProgram] = useState<PublicProgramDetail | undefined>();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;

    getProgram(programId)
      .then((loaded) => {
        if (active) setProgram(loaded);
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          router.replace('/login');
          return;
        }
        if (active) setNotFound(true);
      });

    return () => {
      active = false;
    };
  }, [programId, router]);

  if (notFound) {
    return (
      <EmptyState
        title="Програму не знайдено"
        description="Можливо, її видалено або вона належить іншому тренеру."
        action={
          <ProgressLink href="/dashboard/programs">
            <Button variant="secondary">До програм</Button>
          </ProgressLink>
        }
      />
    );
  }

  if (program === undefined) {
    return <DetailSkeleton label="Завантаження програми" />;
  }

  return <ProgramBuilder initial={program} />;
}
