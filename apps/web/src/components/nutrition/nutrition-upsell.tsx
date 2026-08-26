import Link from 'next/link';
import { Apple, Check, Lock } from 'lucide-react';
import { formatMoney, planPrice, type NutritionStatus } from '@gart/shared';

import { buttonClasses, Card } from '@/components/ui';
import { cx } from '@/lib/cx';

/** What nutrition gives a trainer TODAY, as distinct from what is coming. */
const SHIPPED = [
  'База продуктів із калорійністю та БЖВ',
  'Власні продукти з вашими значеннями',
  'Порції у звичних мірах — склянка, ложка, штука',
  'Пошук українською та фільтри за групами',
];

/** Named, but never sold as though it were already here. */
const COMING = ['Страви та плани харчування', 'Журнал їжі для клієнта'];

/**
 * What a PRO trainer sees where nutrition would be.
 *
 * Not a disabled «скоро» chip and not a hidden section: nutrition is not
 * coming soon, it exists and this trainer does not have it. Saying so plainly,
 * with the price and one button, is the non-punitive version — a dead nav item
 * would tell them nothing, and a 500 would tell them something wrong.
 */
export function NutritionUpsell({ status }: { status: NutritionStatus }) {
  const price = planPrice(status.requiredPlan, 'MONTHLY');

  return (
    <div className="mx-auto max-w-3xl">
      <Card tone="raised">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
            <Apple aria-hidden="true" className="size-6" />
          </span>

          <div className="min-w-0">
            <h2 className="text-xl font-bold tracking-[-0.03em] text-text">
              Харчування — на тарифі {status.requiredPlan}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-text-secondary">
              База продуктів із калорійністю та БЖВ, власні продукти й порції у звичних мірах. Від{' '}
              {formatMoney(price)} на місяць.
            </p>

            <ul className="mt-5 space-y-2 text-sm text-text-secondary">
              {SHIPPED.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-accent" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-text-muted">
              Незабаром на {status.requiredPlan}
            </p>
            <ul className="mt-2 space-y-1.5 text-sm text-text-secondary">
              {COMING.map((item) => (
                <li key={item} className="flex gap-2">
                  <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-text-muted" />
                  {item}
                </li>
              ))}
            </ul>

            {status.customFoodCount > 0 && (
              // The trainer can CHECK that their library survived rather than
              // take our word for it. A count discloses no nutrition data.
              <p className="mt-5 rounded-control border border-border bg-bg-subtle px-3.5 py-3 text-sm leading-relaxed text-text-secondary">
                У вас {String(status.customFoodCount)} власних продуктів. Вони збережені й
                повернуться одразу після оформлення {status.requiredPlan}.
              </p>
            )}

            <Link
              href="/dashboard/billing"
              className={cx(buttonClasses('primary', 'md'), 'mt-6 justify-center')}
            >
              Перейти на {status.requiredPlan}
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
