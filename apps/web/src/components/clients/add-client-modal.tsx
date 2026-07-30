'use client';

import { type FormEvent, useState } from 'react';
import type { ClientWithInvite } from '@gart/shared';

import { Button, FormField, Input, Modal } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createClient } from '@/lib/clients';
import { validateEmail } from '@/lib/validation';

export interface AddClientModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (result: ClientWithInvite) => void;
}

export function AddClientModal({ open, onClose, onCreated }: AddClientModalProps) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  function reset(): void {
    setFullName('');
    setEmail('');
    setFieldErrors({});
    setFormError(undefined);
    setPending(false);
  }

  function handleClose(): void {
    reset();
    onClose();
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();

    const errors: Record<string, string> = {};

    if (fullName.trim().length === 0) errors.fullName = "Введіть ім'я клієнта";
    const emailError = validateEmail(email);
    if (emailError !== undefined) errors.email = emailError;

    setFieldErrors(errors);
    setFormError(undefined);

    if (Object.keys(errors).length > 0) return;

    setPending(true);

    try {
      const result = await createClient({ fullName, email });
      reset();
      onCreated(result);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'Не вдалося додати клієнта');
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Додати клієнта"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={pending}>
            Скасувати
          </Button>
          <Button variant="primary" form="add-client-form" type="submit" loading={pending}>
            {pending ? 'Створюємо…' : 'Створити запрошення'}
          </Button>
        </>
      }
    >
      <form id="add-client-form" onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField label="Ім'я та прізвище" error={fieldErrors.fullName}>
          {(props) => (
            <Input
              {...props}
              type="text"
              value={fullName}
              onChange={(event) => {
                setFullName(event.target.value);
              }}
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
              disabled={pending}
            />
          )}
        </FormField>

        {formError !== undefined && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-sm text-danger">
            {formError}
          </p>
        )}
      </form>
    </Modal>
  );
}
