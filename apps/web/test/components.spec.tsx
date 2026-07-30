import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';

import { ClientStatusBadge } from '@/components/clients/client-status-badge';
import {
  Badge,
  EmptyState,
  Select,
  Table,
  Tabs,
  Tbody,
  Td,
  Th,
  Thead,
  Textarea,
  Tr,
} from '@/components/ui';

describe('Badge', () => {
  it.each(['neutral', 'success', 'warning', 'danger', 'accent'] as const)(
    'renders the %s tone',
    (tone) => {
      render(<Badge tone={tone}>Мітка</Badge>);
      expect(screen.getByText('Мітка')).toBeInTheDocument();
    },
  );
});

describe('ClientStatusBadge', () => {
  it.each([
    ['INVITED', 'Запрошено'],
    ['ACTIVE', 'Активний'],
    ['ARCHIVED', 'В архіві'],
  ] as const)('labels %s in Ukrainian', (status, label) => {
    render(<ClientStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders its message and optional action', () => {
    render(
      <EmptyState
        title="Ще немає клієнтів"
        description="Додайте першого."
        action={<button type="button">Додати</button>}
      />,
    );

    expect(screen.getByText('Ще немає клієнтів')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Додати' })).toBeInTheDocument();
  });
});

describe('Table', () => {
  it('exposes a caption and column headers', () => {
    render(
      <Table caption="Клієнти">
        <Thead>
          <Tr>
            <Th>Клієнт</Th>
          </Tr>
        </Thead>
        <Tbody>
          <Tr>
            <Td>Марія</Td>
          </Tr>
        </Tbody>
      </Table>,
    );

    expect(screen.getByRole('table', { name: 'Клієнти' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Клієнт' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Марія' })).toBeInTheDocument();
  });
});

describe('Select', () => {
  it('renders its options and reports changes', async () => {
    function Fixture() {
      const [value, setValue] = useState('a');

      return (
        <>
          <Select
            aria-label="Статус"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
            }}
            options={[
              { value: 'a', label: 'Перший' },
              { value: 'b', label: 'Другий' },
            ]}
          />
          <output>{value}</output>
        </>
      );
    }

    render(<Fixture />);
    await userEvent.selectOptions(screen.getByLabelText('Статус'), 'b');

    expect(screen.getByRole('status')).toHaveTextContent('b');
  });
});

describe('Textarea', () => {
  it('accepts input and flags invalid state', async () => {
    render(<Textarea aria-label="Нотатки" invalid />);

    const field = screen.getByLabelText('Нотатки');
    await userEvent.type(field, 'привіт');

    expect(field).toHaveValue('привіт');
    expect(field).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Tabs', () => {
  function Fixture() {
    const [value, setValue] = useState('one');

    return (
      <Tabs
        label="Розділи"
        value={value}
        onChange={setValue}
        items={[
          { value: 'one', label: 'Перший', content: <p>вміст один</p> },
          { value: 'two', label: 'Другий', content: <p>вміст два</p> },
        ]}
      />
    );
  }

  it('shows only the selected panel', () => {
    render(<Fixture />);

    expect(screen.getByRole('tab', { name: 'Перший' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('вміст один')).toBeInTheDocument();
    expect(screen.queryByText('вміст два')).not.toBeInTheDocument();
  });

  it('moves between tabs with the arrow keys', async () => {
    render(<Fixture />);

    screen.getByRole('tab', { name: 'Перший' }).focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Другий' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('вміст два')).toBeInTheDocument();
  });
});
