'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { Lock, Mail } from 'lucide-react';
import type { AuthSession } from '@gart/shared';

import { AuthLayout, AuthPitch } from '@/components/layout/auth-layout';
import { Button, FormError, FormField, Input } from '@/components/ui';
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
    <AuthLayout
      title="Вхід"
      subtitle="Увійдіть у свій кабінет тренера"
      pitch={
        <AuthPitch
          headline="З поверненням."
          body="Ваші клієнти, програми й прогрес — там, де ви їх залишили."
        />
      }
      footer={
        <>
          <p>
            Ще не маєте акаунта?{' '}
            <Link href="/register" className="font-medium text-text underline underline-offset-4">
              Зареєструватися
            </Link>
          </p>
          <p>
            Ви клієнт?{' '}
            <Link
              href="/client/login"
              className="font-medium text-text underline underline-offset-4"
            >
              Вхід для клієнтів
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
