import { render, screen } from '@testing-library/react';
import type { ClientListItem } from '@gart/shared';

import { ClientAttention } from '@/components/clients/client-attention';

const NOW = new Date(2026, 7, 6, 12, 0);

function client(overrides: Partial<ClientListItem> = {}): ClientListItem {
  return {
    id: 'c-1',
    fullName: 'Марія Бондаренко',
    email: 'maria@example.com',
    status: 'ACTIVE',
    hasAccount: true,
    invitedAt: '2026-01-01T00:00:00.000Z',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastLoggedAt: null,
    attention: null,
    ...overrides,
  };
}

describe('ClientAttention', () => {
  it('flags a stated skip in the strongest tone', () => {
    render(<ClientAttention client={client({ attention: 'SKIPPED' })} now={NOW} />);

    expect(screen.getByText('Пропустив вправи')).toBeInTheDocument();
  });

  it('flags repeated silence', () => {
    render(<ClientAttention client={client({ attention: 'MISSED' })} now={NOW} />);

    expect(screen.getByText('Пропущені сесії')).toBeInTheDocument();
  });

  it('shows only the pulse when nothing needs attention', () => {
    render(
      <ClientAttention client={client({ lastLoggedAt: '2026-08-06T09:00:00.000Z' })} now={NOW} />,
    );

    expect(screen.getByText('Тренувався сьогодні')).toBeInTheDocument();
  });

  it('counts the days since the last record in Ukrainian', () => {
    const { rerender } = render(
      <ClientAttention client={client({ lastLoggedAt: '2026-08-05T09:00:00.000Z' })} now={NOW} />,
    );
    expect(screen.getByText('Тренувався вчора')).toBeInTheDocument();

    rerender(
      <ClientAttention client={client({ lastLoggedAt: '2026-08-03T09:00:00.000Z' })} now={NOW} />,
    );
    expect(screen.getByText('Тренувався 3 дні тому')).toBeInTheDocument();

    rerender(
      <ClientAttention client={client({ lastLoggedAt: '2026-07-31T09:00:00.000Z' })} now={NOW} />,
    );
    expect(screen.getByText('Тренувався 6 днів тому')).toBeInTheDocument();
  });

  it('shows a dash for a client who has never recorded anything', () => {
    render(<ClientAttention client={client()} now={NOW} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
