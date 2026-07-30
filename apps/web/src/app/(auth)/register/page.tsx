'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import type { AuthSession } from '@gart/shared';

import { AuthLayout } from '@/components/layout/auth-layout';
import { Button, FormField, Input } from '@/components/ui';
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
    <AuthLayout
      title="Створити акаунт"
      subtitle="Почніть вести клієнтів у Gart"
      footer={
        <>
          Вже маєте акаунт?{' '}
          <Link href="/login" className="font-medium text-text underline underline-offset-4">
            Увійти
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
        <FormField label="Ім'я" error={fieldErrors.displayName}>
          {(props) => (
            <Input
              {...props}
              type="text"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
              autoComplete="name"
              disabled={pending}
            />
          )}
        </FormField>

        <FormField label="Email" error={fieldErrors.email}>
          {(props) => (
            <Input
              {...props}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
              autoComplete="email"
              disabled={pending}
            />
          )}
        </FormField>

        <FormField
          label="Пароль"
          error={fieldErrors.password}
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
          {pending ? 'Створюємо акаунт…' : 'Зареєструватися'}
        </Button>
      </form>
    </AuthLayout>
  );
}
