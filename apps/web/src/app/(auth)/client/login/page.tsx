'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import type { ClientSession } from '@gart/shared';

import { AuthLayout, AuthPitch } from '@/components/layout/auth-layout';
import { Button, FormError, FormField, Input } from '@/components/ui';
import { ApiError, apiFetch } from '@/lib/api';
import { validateEmail } from '@/lib/validation';

export default function ClientLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const errors: Record<string, string> = {};

    const emailError = validateEmail(email);
    if (emailError !== undefined) errors.email = emailError;
    // No length rule: the API answers a short password exactly as a wrong one.
    if (password.length === 0) errors.password = 'Введіть пароль';

    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.keys(errors).length > 0) return;

    setPending(true);

    try {
      await apiFetch<ClientSession>('/auth/client/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.replace('/client');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не вдалося увійти');
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Вхід для клієнтів"
      subtitle="Увійдіть, щоб бачити свої тренування"
      pitch={
        <AuthPitch
          headline="Ваш тренер поруч."
          body="Сьогоднішнє тренування, ваш прогрес і чат — у одному застосунку."
        />
      }
      footer={
        <>
          <p>
            Отримали запрошення? Скористайтеся посиланням від тренера — воно створить ваш акаунт.
          </p>
          <p>
            Ви тренер?{' '}
            <Link href="/login" className="font-medium text-text underline underline-offset-4">
              Вхід для тренерів
            </Link>
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <FormField label="Email" error={fieldErrors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              leadingIcon={Mail}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              autoComplete="email"
              disabled={pending}
            />
          )}
        </FormField>

        <FormField label="Пароль" error={fieldErrors.password}>
          {(props) => (
            <Input
              {...props}
              type="password"
              leadingIcon={Lock}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              autoComplete="current-password"
              disabled={pending}
            />
          )}
        </FormField>

        {formError !== undefined && <FormError>{formError}</FormError>}

        <Button type="submit" variant="primary" fullWidth loading={pending}>
          {pending ? 'Входимо…' : 'Увійти'}
        </Button>
      </form>
    </AuthLayout>
  );
}
