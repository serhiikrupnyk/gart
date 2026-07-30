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
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <p className="text-2xl font-semibold tracking-tight text-neutral-900">Gart</p>

        <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-6">
          <h1 className="text-lg font-semibold text-neutral-900">Акаунт створено</h1>
          <p className="mt-2 text-sm text-neutral-500">
            Ваш тренер незабаром додасть тренування. Цей розділ скоро запрацює.
          </p>
        </div>
      </div>
    </main>
  );
}
