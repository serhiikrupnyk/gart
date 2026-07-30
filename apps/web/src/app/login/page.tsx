'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import type { AuthSession } from '@gart/shared';

import { AuthCard } from '@/components/auth-card';
import { SubmitButton } from '@/components/submit-button';
import { TextField } from '@/components/text-field';
import { ApiError, apiFetch } from '@/lib/api';
import { validateEmail } from '@/lib/validation';

export default function LoginPage() {
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
    // No length rule here: the API answers a short password exactly as it
    // answers a wrong one, and the form should not imply otherwise.
    if (password.length === 0) errors.password = 'Введіть пароль';

    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.keys(errors).length > 0) return;

    setPending(true);

    try {
      await apiFetch<AuthSession>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      router.replace('/dashboard');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не вдалося увійти');
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Вхід"
      subtitle="Увійдіть у свій кабінет тренера"
      footer={
        <>
          Ще не маєте акаунта?{' '}
          <Link
            href="/register"
            className="font-medium text-neutral-900 underline underline-offset-4"
          >
            Зареєструватися
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          error={fieldErrors.email}
          autoComplete="email"
          disabled={pending}
        />

        <TextField
          label="Пароль"
          type="password"
          value={password}
          onChange={setPassword}
          error={fieldErrors.password}
          autoComplete="current-password"
          disabled={pending}
        />

        {formError !== undefined && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <SubmitButton label="Увійти" pendingLabel="Входимо…" pending={pending} />
      </form>
    </AuthCard>
  );
}
