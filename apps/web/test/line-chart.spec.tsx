import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LineChart } from '@/components/progress/line-chart';

const POINTS = [
  { date: '2026-06-01', value: 86.1 },
  { date: '2026-07-01', value: 84.35 },
  { date: '2026-08-01', value: 83 },
];

describe('LineChart', () => {
  it('describes the whole trend in words, not only in pixels', () => {
    render(<LineChart title="Вага" unit="кг" points={POINTS} />);

    const figure = screen.getByRole('img');
    expect(figure).toHaveAccessibleName(
      'Вага: 3 замірів з 01.06.2026 до 01.08.2026, від 86,1 до 83 кг (-3,1 кг).',
    );
  });

  it('offers every value as a real table', async () => {
    const user = userEvent.setup();
    render(<LineChart title="Вага" unit="кг" points={POINTS} />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Показати таблицю' }));

    const table = screen.getByRole('table');
    expect(within(table).getByText('01.07.2026')).toBeInTheDocument();
    expect(within(table).getByText('84,35 кг')).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(POINTS.length + 1);

    await user.click(screen.getByRole('button', { name: 'Сховати таблицю' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('draws one marker per measurement and labels the last value', () => {
    const { container } = render(<LineChart title="Вага" unit="кг" points={POINTS} />);

    expect(container.querySelectorAll('circle')).toHaveLength(3);
    expect(container.querySelector('polyline')).toBeInTheDocument();
    expect(screen.getByText(/83 кг/)).toBeInTheDocument();
  });

  it('handles a single measurement without dividing by zero', () => {
    const { container } = render(
      <LineChart title="Вага" unit="кг" points={[{ date: '2026-08-01', value: 80 }]} />,
    );

    expect(screen.getByRole('img')).toHaveAccessibleName('Вага: один замір 01.08.2026 — 80 кг.');
    expect(container.querySelectorAll('circle')).toHaveLength(1);
  });

  it('says so plainly when there is nothing to draw', () => {
    render(<LineChart title="Вага" unit="кг" points={[]} />);

    expect(screen.getByText('Ще немає замірів')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
