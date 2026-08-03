'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { ClientListItem, ClientWithInvite } from '@gart/shared';

import { AddClientModal } from '@/components/clients/add-client-modal';
import { ClientAttention } from '@/components/clients/client-attention';
import { ClientStatusBadge } from '@/components/clients/client-status-badge';
import { InviteLink } from '@/components/clients/invite-link';
import { PageHeader } from '@/components/layout/page-header';
import {
  Button,
  EmptyState,
  Spinner,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { listClients } from '@/lib/clients';

export default function DashboardPage() {
  const { notify } = useToast();

  const [clients, setClients] = useState<ClientListItem[] | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [created, setCreated] = useState<ClientWithInvite | undefined>();
  // Bumped to re-run the load; the effect owns the fetch so state is only ever
  // set from a settled promise, never synchronously during the effect.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;

    listClients()
      .then((loaded) => {
        if (active) setClients(loaded);
      })
      .catch((error: unknown) => {
        if (!active) return;
        // Without this an API failure leaves the spinner up for ever.
        setClients([]);
        notify(
          error instanceof ApiError ? error.message : 'Не вдалося завантажити клієнтів',
          'danger',
        );
      });

    return () => {
      active = false;
    };
  }, [reloadKey, notify]);

  function handleCreated(result: ClientWithInvite): void {
    setCreated(result);
    setModalOpen(false);
    setReloadKey((key) => key + 1);
  }

  return (
    <>
      <PageHeader
        title="Клієнти"
        description="Запрошуйте клієнтів і стежте за їхнім статусом"
        actions={
          <Button
            variant="primary"
            onClick={() => {
              setCreated(undefined);
              setModalOpen(true);
            }}
          >
            Додати клієнта
          </Button>
        }
      />

      {created !== undefined && (
        <div className="mb-6">
          <InviteLink url={created.inviteUrl} />
        </div>
      )}

      {clients === undefined ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" label="Завантаження клієнтів" />
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          title="Ще немає клієнтів"
          description="Додайте першого клієнта — ми згенеруємо для нього посилання-запрошення."
          action={
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(true);
              }}
            >
              Додати клієнта
            </Button>
          }
        />
      ) : (
        <Table caption="Список ваших клієнтів">
          <Thead>
            <Tr>
              <Th>Клієнт</Th>
              <Th>Email</Th>
              <Th>Статус</Th>
              <Th>Активність</Th>
            </Tr>
          </Thead>
          <Tbody>
            {clients.map((client) => (
              <Tr key={client.id}>
                <Td>
                  {/* The link is the interactive element, so the row works for
                      keyboard and screen-reader users without a click handler
                      on the <tr> that they could never reach. */}
                  <Link
                    href={`/dashboard/clients/${client.id}`}
                    className="font-medium text-text hover:underline"
                  >
                    {client.fullName}
                  </Link>
                </Td>
                <Td>
                  <span className="text-text-secondary">{client.email}</span>
                </Td>
                <Td>
                  <ClientStatusBadge status={client.status} />
                </Td>
                <Td>
                  <ClientAttention client={client} now={new Date()} />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      )}

      <AddClientModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
        }}
        onCreated={handleCreated}
      />
    </>
  );
}
