import { render, screen, within } from '@testing-library/react';

import { Modal, Skeleton, SkeletonRegion, TableSkeleton, ChatSkeleton } from '@/components/ui';
import { NavigationProgress, ProgressLink } from '@/components/layout/navigation-progress';
import { ShellSkeleton } from '@/components/layout/shell-skeleton';

const linkStatus = jest.fn(() => ({ pending: false }));
jest.mock('next/link', () => {
  const Mock = ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );

  return {
    __esModule: true,
    default: Mock,
    useLinkStatus: () => linkStatus(),
  };
});

describe('Skeleton', () => {
  it('is hidden from assistive tech — the region announces the load, not the blocks', () => {
    const { container } = render(<Skeleton className="h-4 w-10" />);
    const block = container.firstElementChild;

    expect(block).toHaveAttribute('aria-hidden', 'true');
    expect(block).toHaveClass('h-4', 'w-10');
  });

  it('gates the shimmer behind motion-safe, so reduced motion leaves a static block', () => {
    const { container } = render(<Skeleton />);

    // jsdom cannot evaluate the media query, so the guard is asserted on the
    // class itself: the animation only ever applies under motion-safe.
    expect(container.firstElementChild).toHaveClass('motion-safe:animate-pulse-soft');
    expect(container.firstElementChild).not.toHaveClass('animate-pulse-soft');
  });

  it('announces what is loading as real text, not a label on an empty region', () => {
    render(
      <SkeletonRegion label="Завантаження клієнтів">
        <Skeleton />
      </SkeletonRegion>,
    );

    const region = screen.getByRole('status');

    // A live region is announced from its CONTENTS. Every skeleton inside is
    // aria-hidden, so the label has to be a real (visually hidden) child —
    // an aria-label on an otherwise empty region says nothing at all.
    expect(within(region).getByText('Завантаження клієнтів')).toBeInTheDocument();

    // aria-busy on a live region withholds updates until it flips to false,
    // which never happens here: the region is unmounted when data lands.
    expect(region).not.toHaveAttribute('aria-busy');
  });

  it('lets each surface say what it is loading, so concurrent regions differ', () => {
    render(<TableSkeleton rows={1} columns={1} label="Завантаження клієнтів" />);

    expect(screen.getByText('Завантаження клієнтів')).toBeInTheDocument();
  });
});

describe('shaped skeletons', () => {
  it('renders a table skeleton with a header and the requested rows', () => {
    const { container } = render(<TableSkeleton rows={5} columns={3} />);

    // header + 5 rows, each holding 3 blocks
    // header row + 5 body rows, 3 blocks each; the sr-only label is not hidden
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(6 * 3);
  });

  it('alternates chat bubbles so the conversation does not jump', () => {
    const { container } = render(<ChatSkeleton count={4} />);
    const rows = container.querySelectorAll('[role="status"] > div');

    expect(rows).toHaveLength(4);
    expect(rows[0]).not.toHaveClass('justify-end');
    expect(rows[1]).toHaveClass('justify-end');
  });

  it('draws the real chrome in the shell skeleton so nothing shifts on boot', () => {
    const { container } = render(<ShellSkeleton variant="client" />);

    expect(container.querySelector('header')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

describe('NavigationProgress', () => {
  beforeEach(() => {
    linkStatus.mockReturnValue({ pending: false });
  });

  it('shows nothing while navigation is idle', () => {
    const { container } = render(
      <>
        <NavigationProgress />
        <ProgressLink href="/dashboard">Кабінет</ProgressLink>
      </>,
    );

    expect(container.querySelector('.fixed')).not.toBeInTheDocument();
  });

  it('appears while a link navigation is pending', () => {
    linkStatus.mockReturnValue({ pending: true });

    const { container } = render(
      <>
        <NavigationProgress />
        <ProgressLink href="/dashboard">Кабінет</ProgressLink>
      </>,
    );

    const bar = container.querySelector('.fixed');

    expect(bar).toBeInTheDocument();
    // Decorative: a route change already announces the new page.
    expect(bar).toHaveAttribute('aria-hidden', 'true');
    expect(bar?.firstElementChild).toHaveClass('motion-safe:animate-indeterminate');
  });
});

describe('icon accessibility', () => {
  it('keeps an accessible name on an icon-only button', () => {
    render(
      <Modal open title="Тест" onClose={() => undefined}>
        <p>Вміст</p>
      </Modal>,
    );

    const close = screen.getByRole('button', { name: 'Закрити' });

    // The lucide glyph inside must not leak into the accessible name.
    expect(close.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(close).toHaveAccessibleName('Закрити');
  });
});
