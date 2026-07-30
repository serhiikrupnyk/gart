import { EmptyState } from '@/components/ui';

/**
 * The client home. Phase 1 replaces this with the day's workout; until then the
 * shell around it is the deliverable and the emptiness is stated honestly.
 */
export default function ClientHomePage() {
  return (
    <>
      <h1 className="pb-6 text-2xl font-semibold tracking-tight text-text">Мої тренування</h1>

      <EmptyState
        title="Тренувань ще немає"
        description="Ваш тренер незабаром складе вашу першу програму — вона з'явиться тут."
      />
    </>
  );
}
