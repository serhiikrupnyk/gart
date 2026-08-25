'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { formatMoney, type ClientListItem, type PublicProduct } from '@gart/shared';

import { Button, FormError, FormField, Modal, Select, useToast } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { listClients } from '@/lib/clients';
import { createCheckout } from '@/lib/payments';
import { listProducts } from '@/lib/products';

export interface CheckoutModalProps {
  open: boolean;
  onClose: () => void;
  /** Fired after a checkout is opened, so the payments list refreshes. */
  onCreated: () => void;
}

/**
 * Opening a checkout: a client and a product, and nothing else.
 *
 * There is deliberately no amount field. The price and the platform's fee are
 * computed on the server from the stored product, so this form has nothing to
 * propose and no way to propose it — which is why only ACTIVE clients and
 * ACTIVE products are offered: those are the two the server would accept.
 */
export function CheckoutModal({ open, onClose, onCreated }: CheckoutModalProps) {
  const { notify } = useToast();

  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [clientId, setClientId] = useState('');
  const [productId, setProductId] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;

    let active = true;

    Promise.all([listClients('ACTIVE'), listProducts('active')])
      .then(([loadedClients, loadedProducts]) => {
        if (!active) return;
        setClients(loadedClients);
        setProducts(loadedProducts);
        setClientId(loadedClients[0]?.id ?? '');
        setProductId(loadedProducts[0]?.id ?? '');
        setError(undefined);
      })
      .catch(() => {
        if (active) setError('Не вдалося завантажити клієнтів і продукти');
      });

    return () => {
      active = false;
    };
  }, [open]);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(undefined);

    try {
      await createCheckout(clientId, productId);
      notify('Рахунок виставлено', 'success');
      onCreated();
      onClose();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Не вдалося виставити рахунок');
    } finally {
      setPending(false);
    }
  }

  const ready = clients.length > 0 && products.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Виставити рахунок"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Скасувати
          </Button>
          <Button
            type="submit"
            form="checkout-form"
            variant="primary"
            loading={pending}
            disabled={!ready}
          >
            {pending ? 'Створюємо…' : 'Виставити'}
          </Button>
        </>
      }
    >
      <form
        id="checkout-form"
        noValidate
        className="space-y-4"
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        {!ready && error === undefined && (
          <p className="text-sm leading-relaxed text-text-secondary">
            {clients.length === 0
              ? 'Спочатку додайте активного клієнта.'
              : 'Спочатку створіть активний продукт.'}
          </p>
        )}

        {ready && (
          <>
            <FormField label="Клієнт">
              {(field) => (
                <Select
                  {...field}
                  value={clientId}
                  options={clients.map((client) => ({
                    value: client.id,
                    label: client.fullName,
                  }))}
                  onChange={(event) => {
                    setClientId(event.target.value);
                  }}
                />
              )}
            </FormField>

            <FormField label="Продукт">
              {(field) => (
                <Select
                  {...field}
                  value={productId}
                  options={products.map((product) => ({
                    value: product.id,
                    label: `${product.name} — ${formatMoney(product.price)}`,
                  }))}
                  onChange={(event) => {
                    setProductId(event.target.value);
                  }}
                />
              )}
            </FormField>

            <p className="text-xs leading-relaxed text-text-secondary">
              Клієнт отримає посилання на оплату. Суму й комісію рахує сервер за обраним продуктом.
            </p>
          </>
        )}

        {error !== undefined && <FormError>{error}</FormError>}
      </form>
    </Modal>
  );
}
