'use client';

import { type FormEvent, useState } from 'react';
import {
  PRODUCT_ACCESS_DAYS_MAX,
  PRODUCT_ACCESS_DAYS_MIN,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_KIND_LABELS,
  PRODUCT_KINDS,
  PRODUCT_NAME_MAX,
  PRODUCT_PRICE_MAX,
  PRODUCT_PRICE_MIN,
  SUBSCRIPTION_PERIOD_LABELS,
  SUBSCRIPTION_PERIODS,
  type CreateProductRequest,
  type ProductKind,
  type PublicProduct,
  type SubscriptionPeriod,
} from '@gart/shared';

import {
  Button,
  FormError,
  FormField,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { createProduct, updateProduct } from '@/lib/products';

interface FormValues {
  name: string;
  description: string;
  kind: ProductKind;
  period: SubscriptionPeriod;
  price: string;
  accessDays: string;
}

function initialValues(product: PublicProduct | undefined): FormValues {
  return {
    name: product?.name ?? '',
    description: product?.description ?? '',
    kind: product?.kind ?? 'ONE_TIME',
    period: product?.period ?? 'MONTHLY',
    // The amount arrives as a decimal string and stays one: nothing here parses
    // it to a number, which is the discipline the server applies too.
    price: product?.price.amount ?? '',
    accessDays: product?.accessDays == null ? '' : String(product.accessDays),
  };
}

export interface ProductFormModalProps {
  open: boolean;
  /** Present when editing; absent when creating. */
  product?: PublicProduct | undefined;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Create and edit in one form.
 *
 * The kind decides which fields EXIST, not merely which are enabled: a
 * subscription has no access window and a one-time product has no period, so
 * the irrelevant control is absent. A disabled field invites the trainer to
 * wonder what filling it would do; an absent one asks nothing.
 */
export function ProductFormModal({ open, product, onClose, onSaved }: ProductFormModalProps) {
  const { notify } = useToast();

  const [values, setValues] = useState<FormValues>(() => initialValues(product));
  const [seededFor, setSeededFor] = useState<string | undefined>(product?.id);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  // Re-seed when the modal is reused for a different product.
  const seedKey = product?.id ?? 'new';
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setValues(initialValues(product));
    setError(undefined);
  }

  function close(): void {
    setSeededFor(undefined);
    onClose();
  }

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]): void {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    const subscription = values.kind === 'SUBSCRIPTION';
    const days = values.accessDays.trim();
    const description = values.description.trim();

    const body: CreateProductRequest = {
      name: values.name.trim(),
      description: description === '' ? null : description,
      kind: values.kind,
      price: values.price.trim(),
      // Exactly one is meaningful per kind; the other goes as null so changing
      // the kind of an existing product clears what the old kind left behind.
      period: subscription ? values.period : null,
      accessDays: subscription || days === '' ? null : Number(days),
    };

    try {
      if (product === undefined) {
        await createProduct(body);
        notify('Продукт створено', 'success');
      } else {
        await updateProduct(product.id, body);
        notify('Продукт оновлено', 'success');
      }

      onSaved();
      close();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не вдалося зберегти продукт');
    } finally {
      setPending(false);
    }
  }

  const subscription = values.kind === 'SUBSCRIPTION';

  return (
    <Modal
      open={open}
      onClose={close}
      title={product === undefined ? 'Новий продукт' : 'Редагувати продукт'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            Скасувати
          </Button>
          <Button type="submit" form="product-form" variant="primary" loading={pending}>
            {pending ? 'Зберігаємо…' : 'Зберегти'}
          </Button>
        </>
      }
    >
      <form
        id="product-form"
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <FormField label="Назва">
          {(field) => (
            <Input
              {...field}
              value={values.name}
              maxLength={PRODUCT_NAME_MAX}
              required
              autoFocus
              onChange={(event) => {
                set('name', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField label="Опис" hint="Не обов’язково">
          {(field) => (
            <Textarea
              {...field}
              rows={3}
              value={values.description}
              maxLength={PRODUCT_DESCRIPTION_MAX}
              onChange={(event) => {
                set('description', event.target.value);
              }}
            />
          )}
        </FormField>

        <FormField label="Тип">
          {(field) => (
            <Select
              {...field}
              value={values.kind}
              options={PRODUCT_KINDS.map((kind) => ({
                value: kind,
                label: PRODUCT_KIND_LABELS[kind],
              }))}
              onChange={(event) => {
                set('kind', event.target.value as ProductKind);
              }}
            />
          )}
        </FormField>

        {subscription ? (
          <FormField label="Періодичність">
            {(field) => (
              <Select
                {...field}
                value={values.period}
                options={SUBSCRIPTION_PERIODS.map((period) => ({
                  value: period,
                  label: SUBSCRIPTION_PERIOD_LABELS[period],
                }))}
                onChange={(event) => {
                  set('period', event.target.value as SubscriptionPeriod);
                }}
              />
            )}
          </FormField>
        ) : (
          <FormField
            label="Тривалість доступу, днів"
            hint={`Порожньо — доступ без обмеження в часі. Від ${String(PRODUCT_ACCESS_DAYS_MIN)} до ${String(PRODUCT_ACCESS_DAYS_MAX)} днів.`}
          >
            {(field) => (
              <Input
                {...field}
                inputMode="numeric"
                value={values.accessDays}
                onChange={(event) => {
                  set('accessDays', event.target.value.replace(/\D/g, ''));
                }}
              />
            )}
          </FormField>
        )}

        <FormField
          label="Ціна, ₴"
          hint={`Від ${String(PRODUCT_PRICE_MIN)} до ${PRODUCT_PRICE_MAX.toLocaleString('uk-UA')} ₴.`}
        >
          {(field) => (
            <Input
              {...field}
              // Text, not number: a numeric input hands back a float, and a
              // price is the one value in this app that must never become one.
              inputMode="decimal"
              value={values.price}
              required
              placeholder="1500.00"
              onChange={(event) => {
                set('price', event.target.value.replace(/,/g, '.').replace(/[^\d.]/g, ''));
              }}
            />
          )}
        </FormField>

        {error !== undefined && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
