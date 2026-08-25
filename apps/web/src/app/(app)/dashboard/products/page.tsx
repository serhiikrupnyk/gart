'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  formatMoney,
  PRODUCT_KIND_LABELS,
  SUBSCRIPTION_PERIOD_LABELS,
  type PublicProduct,
} from '@gart/shared';

import { PageHeader } from '@/components/layout/page-header';
import { PaymentTabs } from '@/components/layout/payment-tabs';
import { ProductFormModal } from '@/components/products/product-form-modal';
import {
  Badge,
  Button,
  EmptyState,
  Modal,
  Table,
  TableSkeleton,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { deleteProduct, listProducts, updateProduct } from '@/lib/products';

type FormState = { open: false } | { open: true; product?: PublicProduct };

/**
 * Ukrainian counts in three forms, and «1 днів» is none of them. The bounds
 * start at one day, so the singular is a shape a real catalogue entry takes.
 */
function days(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;

  if (lastTwo >= 11 && lastTwo <= 14) return `${String(count)} днів`;
  if (last === 1) return `${String(count)} день`;
  if (last >= 2 && last <= 4) return `${String(count)} дні`;

  return `${String(count)} днів`;
}

/** What a product grants, in one phrase per kind. */
function accessLabel(product: PublicProduct): string {
  if (product.kind === 'SUBSCRIPTION') {
    return product.period === null ? '—' : SUBSCRIPTION_PERIOD_LABELS[product.period];
  }

  return product.accessDays === null ? 'Без обмеження' : days(product.accessDays);
}

export default function ProductsPage() {
  const { notify } = useToast();

  const [products, setProducts] = useState<PublicProduct[] | undefined>();
  const [failed, setFailed] = useState(false);
  const [form, setForm] = useState<FormState>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<PublicProduct | undefined>();
  const [busyId, setBusyId] = useState<string | undefined>();
  const [reloadKey, setReloadKey] = useState(0);

  /**
   * Where focus goes when the element it was on stops existing.
   *
   * Deleting a product unmounts the row holding the Trash button that Modal
   * restores focus to, and creating the first one replaces the empty state's
   * button with the table. Both would drop focus to <body>, sending the next
   * Tab back to the skip link. This button outlives every such change.
   */
  const createRef = useRef<HTMLButtonElement>(null);

  const reload = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  /** A retry that shows it is retrying: the skeleton returns while it runs. */
  const retry = useCallback(() => {
    setProducts(undefined);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    let active = true;

    listProducts('all')
      .then((loaded) => {
        if (!active) return;
        setProducts(loaded);
        setFailed(false);
      })
      .catch(() => {
        if (!active) return;
        setProducts([]);
        setFailed(true);
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  async function toggleActive(product: PublicProduct): Promise<void> {
    if (busyId !== undefined) return;

    setBusyId(product.id);

    try {
      await updateProduct(product.id, { isActive: !product.isActive });
      notify(product.isActive ? 'Продукт деактивовано' : 'Продукт активовано', 'success');
      reload();
    } catch (caught) {
      notify(caught instanceof ApiError ? caught.message : 'Не вдалося змінити статус', 'danger');
    } finally {
      setBusyId(undefined);
    }
  }

  async function confirmDelete(): Promise<void> {
    if (deleteTarget === undefined) return;

    setBusyId(deleteTarget.id);

    try {
      await deleteProduct(deleteTarget.id);
      notify('Продукт видалено', 'success');
      setDeleteTarget(undefined);
      reload();
      createRef.current?.focus();
    } catch (caught) {
      // A 409 here is the delete contract speaking: the product has been sold,
      // and its own message says to deactivate instead. Surfaced verbatim
      // rather than flattened into a generic failure.
      notify(caught instanceof ApiError ? caught.message : 'Не вдалося видалити продукт', 'danger');
      setDeleteTarget(undefined);
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <>
      <PaymentTabs active="/dashboard/products" />
      <PageHeader
        title="Продукти"
        description="Що ви продаєте: разові пакети та підписки. Ціни у гривнях."
        actions={
          <Button
            ref={createRef}
            variant="primary"
            onClick={() => {
              setForm({ open: true });
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Створити продукт
          </Button>
        }
      />

      {products === undefined ? (
        <TableSkeleton rows={4} columns={6} label="Завантаження продуктів" />
      ) : failed ? (
        <EmptyState
          title="Не вдалося завантажити продукти"
          description="Перевірте з’єднання і спробуйте ще раз."
          action={
            <Button variant="primary" onClick={retry}>
              Спробувати ще раз
            </Button>
          }
        />
      ) : products.length === 0 ? (
        <EmptyState
          title="Ще немає жодного продукту"
          description="Створіть разовий пакет або підписку — і зможете виставляти рахунки клієнтам."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setForm({ open: true });
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Створити продукт
            </Button>
          }
        />
      ) : (
        <Table caption="Ваші продукти">
          <Thead>
            <Tr>
              <Th>Назва</Th>
              <Th>Тип</Th>
              <Th>Доступ</Th>
              <Th numeric>Ціна</Th>
              <Th>Статус</Th>
              <Th>Дії</Th>
            </Tr>
          </Thead>
          <Tbody>
            {products.map((product) => (
              <Tr key={product.id} className={product.isActive ? undefined : 'bg-bg-subtle'}>
                <Td>
                  <span className="font-semibold text-text">{product.name}</span>
                  {product.description !== null && (
                    <span className="mt-0.5 block max-w-md truncate text-xs text-text-secondary">
                      {product.description}
                    </span>
                  )}
                </Td>
                <Td>{PRODUCT_KIND_LABELS[product.kind]}</Td>
                <Td>{accessLabel(product)}</Td>
                <Td numeric>
                  <span className="font-semibold text-text">{formatMoney(product.price)}</span>
                </Td>
                <Td>
                  <Badge tone={product.isActive ? 'success' : 'neutral'}>
                    {product.isActive ? 'Активний' : 'Неактивний'}
                  </Badge>
                </Td>
                <Td>
                  <div className="flex justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${product.isActive ? 'Деактивувати' : 'Активувати'} ${product.name}`}
                      onClick={() => {
                        void toggleActive(product);
                      }}
                    >
                      {product.isActive ? 'Деактивувати' : 'Активувати'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Редагувати ${product.name}`}
                      onClick={() => {
                        setForm({ open: true, product });
                      }}
                    >
                      <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Видалити ${product.name}`}
                      onClick={() => {
                        setDeleteTarget(product);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <ProductFormModal
        open={form.open}
        product={form.open ? form.product : undefined}
        onClose={() => {
          setForm({ open: false });
        }}
        onSaved={() => {
          reload();
          createRef.current?.focus();
        }}
      />

      <Modal
        open={deleteTarget !== undefined}
        onClose={() => {
          setDeleteTarget(undefined);
        }}
        title="Видалити продукт?"
        footer={
          <>
            <Button
              variant="secondary"
              disabled={busyId !== undefined}
              onClick={() => {
                setDeleteTarget(undefined);
              }}
            >
              Скасувати
            </Button>
            <Button
              variant="danger"
              loading={busyId !== undefined && busyId === deleteTarget?.id}
              onClick={() => {
                void confirmDelete();
              }}
            >
              Видалити
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary">
          {deleteTarget?.name} буде видалено назавжди. Продукт, який уже продавався, видалити не
          можна — його можна лише деактивувати.
        </p>
      </Modal>
    </>
  );
}
