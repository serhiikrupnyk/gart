import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BrandSettings, ClientSession, InvitePreview } from '@gart/shared';

import BrandPage from '@/app/(app)/dashboard/brand/page';
import InvitePage from '@/app/(auth)/invite/[token]/page';
import { AppNav } from '@/components/layout/app-nav';
import { ClientShell } from '@/components/layout/client-shell';
import { ThemeProvider } from '@/components/theme/theme-provider';
import { ToastProvider } from '@/components/ui';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: jest.fn() }),
  usePathname: () => '/client',
  useParams: () => ({ token: 'invite-token' }),
}));

const apiFetch = jest.fn();
jest.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args) as unknown,
  API_URL: 'http://api.test',
  ApiError: class extends Error {},
}));

const uploadToStorage = jest.fn();
jest.mock('@/lib/upload', () => ({
  uploadToStorage: (...args: unknown[]) => uploadToStorage(...args) as unknown,
}));

function session(brand: Partial<ClientSession['trainer']> = {}): ClientSession {
  return {
    client: {
      id: 'c1',
      fullName: 'Марія Бондаренко',
      email: 'maria@example.com',
      status: 'ACTIVE',
      hasAccount: true,
      invitedAt: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    trainer: {
      displayName: 'Олена Ковальчук',
      brandName: null,
      brandLogoUrl: null,
      brandColor: null,
      ...brand,
    },
  };
}

function renderClientApp(brand: Partial<ClientSession['trainer']> = {}) {
  apiFetch.mockImplementation((path: string) =>
    path === '/auth/client/me' ? Promise.resolve(session(brand)) : Promise.resolve([]),
  );

  return render(
    <ThemeProvider initial="system">
      <ToastProvider>
        <ClientShell>
          <p>вміст клієнта</p>
        </ClientShell>
      </ToastProvider>
    </ThemeProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  uploadToStorage.mockReset();
  replace.mockReset();
});

describe("the client app wears its trainer's brand", () => {
  it('shows the brand name, logo and colour instead of the Gart wordmark', async () => {
    renderClientApp({
      brandName: 'Кузня Сили',
      brandLogoUrl: '/brand/t1/logo/abc.png',
      brandColor: '#2e86de',
    });

    expect(await screen.findByText('Кузня Сили')).toBeInTheDocument();
    // The wordmark is gone: the header belongs to the trainer.
    expect(screen.queryByRole('link', { name: /gart/i })).not.toBeInTheDocument();

    // Absolute against the API origin, not the Next server: the two are
    // separate origins, and a bare path would 404 against the wrong one.
    const logo = document.querySelector('img[src="http://api.test/brand/t1/logo/abc.png"]');
    expect(logo).not.toBeNull();

    // The colour enters the tree exactly once, as a custom property — every
    // branded surface reads it through `var(--brand, …)` rather than repeating
    // a value nobody could then bound.
    const definers = document.querySelectorAll('[style*="--brand:"]');
    expect(definers).toHaveLength(1);
    expect(definers[0]?.getAttribute('style')).toContain('#2e86de');
  });

  it('falls back to the Gart wordmark when nothing is set', async () => {
    renderClientApp();

    expect(await screen.findByText('вміст клієнта')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /gart/i })).toBeInTheDocument();
    expect(document.querySelector('[style*="--brand:"]')).toBeNull();
  });

  it('shows the trainer\'s own name beside a logo with no brand name — never "Gart"', async () => {
    // The half-branded case: a trainer's mark sitting next to our name is
    // worse than either brand alone.
    renderClientApp({ brandLogoUrl: '/brand/t1/logo/abc.png' });

    expect(await screen.findByText('Олена Ковальчук')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /gart/i })).not.toBeInTheDocument();
  });

  it('renders every partial combination deliberately', async () => {
    const cases: [Partial<ClientSession['trainer']>, string][] = [
      [{ brandName: 'Кузня' }, 'Кузня'],
      [{ brandColor: '#123456' }, 'Олена Ковальчук'],
      [{ brandLogoUrl: '/brand/t1/logo/a.png', brandColor: '#123456' }, 'Олена Ковальчук'],
    ];

    for (const [brand, expected] of cases) {
      const view = renderClientApp(brand);
      expect(await screen.findByText(expected)).toBeInTheDocument();
      // Never a broken image and never a stray "Gart" beside a brand.
      expect(screen.queryByRole('link', { name: /gart/i })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('never prints text in the brand colour', async () => {
    const brandColor = '#2e86de';
    renderClientApp({ brandName: 'Кузня Сили', brandColor });

    await screen.findByText('Кузня Сили');

    // The structural guarantee behind the AA claim: the colour decorates and
    // never carries a glyph. Anything that DID would be unverifiable, because
    // the trainer chose it and we cannot know what it is.
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('[style]'))) {
      const style = element.getAttribute('style') ?? '';
      expect(style).not.toMatch(/(^|;)\s*color\s*:/);
    }
  });

  it('keeps the Gart attribution, away from the header the trainer owns', async () => {
    const user = userEvent.setup();
    renderClientApp({ brandName: 'Кузня Сили' });

    await screen.findByText('Кузня Сили');
    await user.click(screen.getByRole('button', { name: 'Меню користувача' }));

    expect(await screen.findByText('Працює на Gart')).toBeInTheDocument();
  });
});

describe("the invite page — a client's first impression", () => {
  function renderInvite(preview: Partial<InvitePreview> = {}) {
    apiFetch.mockResolvedValue({
      trainerName: 'Кузня Сили',
      clientFullName: 'Марія Бондаренко',
      brandLogoUrl: null,
      brandColor: null,
      ...preview,
    } satisfies InvitePreview);

    return render(
      <ThemeProvider initial="system">
        <ToastProvider>
          <InvitePage />
        </ToastProvider>
      </ThemeProvider>,
    );
  }

  it("carries the inviting trainer's brand", async () => {
    renderInvite({ brandLogoUrl: '/brand/t1/logo/abc.png', brandColor: '#2e86de' });

    expect(await screen.findByText(/Вас запросив Кузня Сили/)).toBeInTheDocument();
    expect(
      document.querySelector('img[src="http://api.test/brand/t1/logo/abc.png"]'),
    ).not.toBeNull();
    expect(document.querySelector('[style*="--brand:"]')?.getAttribute('style')).toContain(
      '#2e86de',
    );
  });

  it('keeps the Gart wordmark when the trainer has set no brand', async () => {
    renderInvite();

    expect(await screen.findByText(/Вас запросив Кузня Сили/)).toBeInTheDocument();
    expect(document.querySelector('[style*="--brand:"]')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    // The panel's wordmark is a real link and the only one in it. Replacing it
    // with a 2xl repeat of the name the heading beside it already carries would
    // be worse than either brand alone.
    expect(screen.getByRole('link', { name: /gart/i })).toBeInTheDocument();
  });
});

describe("the trainer's brand settings", () => {
  const BRAND: BrandSettings = {
    displayName: 'Олена Ковальчук',
    brandName: null,
    brandLogoUrl: null,
    brandColor: null,
  };

  function renderSettings(brand: Partial<BrandSettings> = {}) {
    apiFetch.mockImplementation((path: string) => {
      if (path === '/trainer/brand') return Promise.resolve({ ...BRAND, ...brand });

      return Promise.resolve({ ...BRAND, ...brand });
    });

    return render(
      <ThemeProvider initial="system">
        <ToastProvider>
          <BrandPage />
        </ToastProvider>
      </ThemeProvider>,
    );
  }

  it('is reachable from the main navigation', () => {
    render(
      <ThemeProvider initial="system">
        <AppNav />
      </ThemeProvider>,
    );

    expect(screen.getByRole('link', { name: /Бренд/ })).toHaveAttribute('href', '/dashboard/brand');
  });

  it('saves the colour it is showing, not a null the trainer never chose', async () => {
    const user = userEvent.setup();
    renderSettings();

    await screen.findByLabelText('Назва бренду');

    // The picker cannot render «nothing», so it opens on the app's own accent.
    // A trainer who accepts that swatch without opening the picker must get it
    // SAVED — otherwise nothing changes anywhere, and because the default IS
    // that accent there is no tell on this screen at all.
    const picker = screen.getByLabelText('Колір бренду') as HTMLInputElement;
    expect(picker.value).toBe('#ff5b32');

    await user.click(screen.getAllByRole('button', { name: 'Зберегти' })[1] as HTMLElement);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/trainer/brand', {
        method: 'PATCH',
        body: JSON.stringify({ brandColor: '#ff5b32' }),
      });
    });
  });

  it('saves a brand name, and clearing it sends an explicit null', async () => {
    const user = userEvent.setup();
    renderSettings();

    const input = await screen.findByLabelText('Назва бренду');
    await user.type(input, 'Кузня Сили');
    await user.click(screen.getAllByRole('button', { name: 'Зберегти' })[0] as HTMLElement);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/trainer/brand', {
        method: 'PATCH',
        body: JSON.stringify({ brandName: 'Кузня Сили' }),
      });
    });

    await user.clear(input);
    await user.click(screen.getAllByRole('button', { name: 'Зберегти' })[0] as HTMLElement);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith('/trainer/brand', {
        method: 'PATCH',
        body: JSON.stringify({ brandName: null }),
      });
    });
  });

  it('previews the client header the trainer is actually changing', async () => {
    const user = userEvent.setup();
    renderSettings({ brandColor: '#2e86de' });

    const preview = await screen.findByText('Як це бачить клієнт');
    const card = preview.closest('div');
    expect(card).not.toBeNull();

    const input = await screen.findByLabelText('Назва бренду');
    await user.type(input, 'Кузня');

    // The preview follows the field before anything is saved.
    expect(within(card as HTMLElement).getByText('Кузня')).toBeInTheDocument();
  });

  it('refuses an unsupported file before any round trip', async () => {
    renderSettings();

    await screen.findByLabelText('Назва бренду');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // SVG is the one that matters: it carries script, and Gart serves logos
    // from its own origin.
    // The file is attached directly rather than through userEvent, whose upload
    // honours the input's `accept` and would drop an SVG before the code under
    // test ever saw it. `accept` is a picker convenience and never the gate —
    // a real caller can hand the input anything, so the check must be ours.
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    Object.defineProperty(input, 'files', { value: [svg], configurable: true });
    fireEvent.change(input);

    expect(await screen.findByText('Підійде JPEG, PNG або WebP')).toBeInTheDocument();
    expect(uploadToStorage).not.toHaveBeenCalled();
    expect(apiFetch).not.toHaveBeenCalledWith('/trainer/brand/logo/presign', expect.anything());
  });

  it('walks presign → upload → finalize for a valid logo', async () => {
    const user = userEvent.setup();

    apiFetch.mockImplementation((path: string) => {
      if (path === '/trainer/brand/logo/presign') {
        return Promise.resolve({
          uploadUrl: 'https://storage.test/put',
          key: 'brand/t1/abc.png',
          expiresAt: '2026-01-01T00:00:00.000Z',
        });
      }
      if (path === '/trainer/brand/logo/finalize') {
        return Promise.resolve({ ...BRAND, brandLogoUrl: '/brand/t1/logo/abc.png' });
      }

      return Promise.resolve(BRAND);
    });
    uploadToStorage.mockResolvedValue(undefined);

    render(
      <ThemeProvider initial="system">
        <ToastProvider>
          <BrandPage />
        </ToastProvider>
      </ThemeProvider>,
    );

    await screen.findByLabelText('Назва бренду');
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, new File(['x'], 'logo.png', { type: 'image/png' }));

    await waitFor(() => {
      expect(uploadToStorage).toHaveBeenCalled();
    });
    expect(apiFetch).toHaveBeenCalledWith('/trainer/brand/logo/finalize', {
      method: 'POST',
      body: JSON.stringify({ key: 'brand/t1/abc.png' }),
    });
  });
});
