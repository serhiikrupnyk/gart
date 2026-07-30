import { AuthLayout } from '@/components/layout/auth-layout';

/**
 * The client-side shell, deliberately a placeholder.
 *
 * Accepting an invite issues a session cookie, but there is no client-facing API
 * yet — AuthGuard resolves the trainer tenant and so answers only to trainers.
 * Client login and the real shell are a later step; this page exists so the
 * invite flow ends somewhere honest rather than on a 404.
 */
export default function ClientShellPage() {
  return (
    <AuthLayout
      title="Акаунт створено"
      subtitle="Ваш тренер незабаром додасть тренування."
      footer="Цей розділ скоро запрацює."
    />
  );
}
