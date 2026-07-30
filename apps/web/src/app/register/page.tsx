'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import type { AuthSession } from '@gart/shared';

import { AuthCard } from '@/components/auth-card';
import { SubmitButton } from '@/components/submit-button';
import { TextField } from '@/components/text-field';
import { ApiError, apiFetch } from '@/lib/api';
import { PASSWORD_MIN_LENGTH, validateEmail, validatePassword } from '@/lib/validation';

export default function RegisterPage() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const errors: Record<string, string> = {};

    if (displayName.trim().length === 0) errors.displayName = "Введіть ім'я";
    const emailError = validateEmail(email);
    if (emailError !== undefined) errors.email = emailError;
    const passwordError = validatePassword(password);
    if (passwordError !== undefined) errors.password = passwordError;

    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.keys(errors).length > 0) return;

    setPending(true);

    try {
      await apiFetch<AuthSession>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName }),
      });
      router.replace('/dashboard');
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не вдалося зареєструватися');
      setPending(false);
    }
  }

  return (
    <AuthCard
      title="Створити акаунт"
      subtitle="Почніть вести клієнтів у Gart"
      footer={
        <>
          Вже маєте акаунт?{' '}
          <Link href="/login" className="font-medium text-neutral-900 underline underline-offset-4">
            Увійти
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <TextField
          label="Ім'я"
          type="text"
          value={displayName}
          onChange={setDisplayName}
          error={fieldErrors.displayName}
          autoComplete="name"
          disabled={pending}
        />

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
          autoComplete="new-password"
          disabled={pending}
        />

        <p className="text-xs text-neutral-500">Щонайменше {PASSWORD_MIN_LENGTH} символів.</p>

        {formError !== undefined && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        <SubmitButton label="Зареєструватися" pendingLabel="Створюємо акаунт…" pending={pending} />
      </form>
    </AuthCard>
  );
}
