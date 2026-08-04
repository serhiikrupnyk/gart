'use client';

import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import type { InvitePreview } from '@gart/shared';

import { AuthLayout } from '@/components/layout/auth-layout';
import { Button, FormField, Input, Skeleton, SkeletonRegion } from '@/components/ui';
import { ApiError, apiFetch } from '@/lib/api';
import { PASSWORD_MIN_LENGTH, validatePassword } from '@/lib/validation';

type LoadState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly preview: InvitePreview }
  | { readonly kind: 'unusable'; readonly message: string };

const EXPIRED_MESSAGE = 'Термін дії цього запрошення минув. Попросіть тренера надіслати нове.';
const INVALID_MESSAGE = 'Це запрошення недійсне або вже використане.';

export default function InvitePage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;

    apiFetch<InvitePreview>(`/invites/${token}`)
      .then((preview) => {
        if (active) setState({ kind: 'ready', preview });
      })
      .catch((caught: unknown) => {
        if (!active) return;
        // 410 is the one distinction the API draws: a link that was real but ran
        // out. Everything else is deliberately indistinguishable.
        const expired = caught instanceof ApiError && caught.status === 410;
        setState({ kind: 'unusable', message: expired ? EXPIRED_MESSAGE : INVALID_MESSAGE });
      });

    return () => {
      active = false;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const error = validatePassword(password);
    setPasswordError(error);
    setFormError(undefined);

    if (error !== undefined) return;

    setPending(true);

    try {
      await apiFetch<null>('/auth/accept-invite', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      router.replace('/client');
    } catch (caught) {
      setFormError(caught instanceof ApiError ? caught.message : INVALID_MESSAGE);
      setPending(false);
    }
  }

  if (state.kind === 'loading') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-bg-subtle px-4">
        <SkeletonRegion label="Перевіряємо запрошення" className="w-full max-w-sm space-y-4">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 rounded-control" />
        </SkeletonRegion>
      </main>
    );
  }

  if (state.kind === 'unusable') {
    return (
      <AuthLayout
        title="Запрошення недоступне"
        subtitle={state.message}
        footer="Зверніться до свого тренера по нове посилання."
      />
    );
  }

  return (
    <AuthLayout
      title={`Вас запросив ${state.preview.trainerName}`}
      subtitle={`${state.preview.clientFullName}, створіть пароль, щоб почати`}
      footer="Після цього ви зможете входити за своїм email."
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <FormField
          label="Пароль"
          error={passwordError}
          hint={`Щонайменше ${String(PASSWORD_MIN_LENGTH)} символів.`}
        >
          {(props) => (
            <Input
              {...props}
              type="password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              autoComplete="new-password"
              disabled={pending}
            />
          )}
        </FormField>

        {formError !== undefined && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" variant="primary" fullWidth loading={pending}>
          {pending ? 'Створюємо акаунт…' : 'Прийняти запрошення'}
        </Button>
      </form>
    </AuthLayout>
  );
}
