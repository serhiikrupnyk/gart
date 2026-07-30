import Link from 'next/link';

import { Wordmark } from '@/components/layout/wordmark';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui';

export default function HomePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-bg-subtle px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <Wordmark size="lg" href="/" />

      <p className="mt-3 max-w-sm text-center text-sm text-text-secondary">
        Платформа для персональних тренерів
      </p>

      <div className="mt-8 flex gap-3">
        <Link href="/login">
          <Button variant="primary">Увійти</Button>
        </Link>
        <Link href="/register">
          <Button variant="secondary">Зареєструватися</Button>
        </Link>
      </div>
    </main>
  );
}
