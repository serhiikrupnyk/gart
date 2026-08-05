import { ChevronRight } from 'lucide-react';
import type { ClientListItem } from '@gart/shared';

import { ProgressLink } from '@/components/layout/navigation-progress';
import { Avatar, Td, Tr } from '@/components/ui';
import { ClientAttention } from './client-attention';
import { ClientStatusBadge } from './client-status-badge';

/**
 * One client, scannable in a single pass: who they are, where they stand, and
 * whether they need the trainer today.
 *
 * The name link is the only interactive element — a click handler on the row
 * would be unreachable by keyboard. `group` on the row lets the ember edge and
 * the chevron respond to hovering or tabbing anywhere in it, without making
 * the row itself a control.
 */
export function ClientRow({ client, now }: { client: ClientListItem; now: Date }) {
  return (
    <Tr className="group transition-colors hover:bg-bg-subtle focus-within:bg-bg-subtle">
      <Td>
        <div className="flex items-center gap-3">
          {/* The ember edge: on hover or keyboard focus, never at rest. */}
          <span
            aria-hidden="true"
            className="h-8 w-0.5 shrink-0 rounded-full bg-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          />

          <Avatar name={client.fullName} />

          {/*
            The table lays out on auto width, so `truncate` alone does nothing —
            the column simply grows to the longest email. A max-width is what
            gives it something to truncate against, and keeps the four columns
            inside a 375px viewport.
          */}
          <span className="block max-w-[9rem] sm:max-w-[14rem]">
            <ProgressLink
              href={`/dashboard/clients/${client.id}`}
              className="block truncate font-medium text-text hover:underline"
            >
              {client.fullName}
            </ProgressLink>
            <span className="block truncate text-sm text-text-secondary">{client.email}</span>
          </span>
        </div>
      </Td>

      <Td>
        <ClientStatusBadge status={client.status} />
      </Td>

      <Td>
        <ClientAttention client={client} now={now} />
      </Td>

      <Td>
        <span className="flex justify-end">
          {/*
            A real target rather than a decorative glyph: the column is headed
            «Відкрити», and it is always visible, because a hover-gated
            affordance does not exist at all on a touch device.
          */}
          <ProgressLink
            href={`/dashboard/clients/${client.id}`}
            aria-label={`Відкрити картку: ${client.fullName}`}
            className="inline-flex size-8 items-center justify-center rounded-control text-text-secondary transition-colors hover:bg-bg-subtle hover:text-text"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </ProgressLink>
        </span>
      </Td>
    </Tr>
  );
}
