import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Check,
  CreditCard,
  Dumbbell,
  Flame,
  MessageCircle,
  Smartphone,
  TrendingUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { CtaLink } from '@/components/marketing/cta-link';
import { HeroVisual } from '@/components/marketing/hero-visual';
import { LandingHeader } from '@/components/marketing/landing-header';
import { Wordmark } from '@/components/layout/wordmark';

export const metadata: Metadata = {
  title: 'Gart — українська платформа для персональних тренерів',
  description:
    'Gart замінює Excel, PDF і Telegram одним застосунком: програми тренувань, прогрес, звички і чат — українською. Кожен клієнт отримує застосунок під вашим брендом.',
  openGraph: {
    title: 'Gart — українська платформа для персональних тренерів',
    description:
      'Програми тренувань, прогрес, звички і чат — в одному застосунку, українською. Клієнти отримують застосунок під вашим брендом.',
    type: 'website',
    locale: 'uk_UA',
  },
};

/** Everything the trainer juggles today; straight from the presentation. */
const CHAOS = [
  'Програми — в Excel і PDF',
  'Відео вправ — десь у Telegram',
  'Харчування — в нотатках',
  'Прогрес — ніде',
  'Чат впереміш з особистим',
  'Оплати — «скинь на картку»',
];

interface Feature {
  icon: LucideIcon;
  title: string;
  copy: string;
  soon?: boolean;
}

const FEATURES: Feature[] = [
  {
    icon: Dumbbell,
    title: 'Конструктор тренувань',
    copy: 'Програма за хвилини, а не за вечір. Бібліотека вправ із відео, шаблони, сила / біг / AMRAP / EMOM / кругові.',
  },
  {
    icon: Smartphone,
    title: 'Застосунок клієнта',
    copy: 'Клієнт відкриває ваш застосунок — з вашим лого і кольором. Бачить сьогоднішнє тренування, логує ваги й повтори.',
  },
  {
    icon: TrendingUp,
    title: 'Прогрес і заміри',
    copy: 'Заміри, фото, графіки — і показники під вашу методику. Прогрес, який видно, утримує клієнта.',
  },
  {
    icon: Flame,
    title: 'Звички і серії',
    copy: 'Вода, кроки, сон. Серії мотивують відкривати застосунок щодня — навіть у день відпочинку.',
  },
  {
    icon: MessageCircle,
    title: 'Чат і сповіщення',
    copy: 'Робоче спілкування окремо від особистого: текст, голосові, фото й відео — у контексті тренувань.',
  },
  {
    icon: CreditCard,
    title: 'Українські оплати',
    copy: 'Разові оплати й підписки через українські платіжні системи, з ФОП-обліком. Без «скинь на картку».',
    soon: true,
  },
];

const AUDIENCES = [
  {
    title: 'Онлайн-тренерам',
    copy: 'Ведіть клієнтів дистанційно: програма в застосунку, результати — у вас перед очима, а не в листуванні.',
  },
  {
    title: 'Тренерам у залі',
    copy: 'План на планшеті замість роздруківок. Історія кожного клієнта — під рукою на наступному тренуванні.',
  },
  {
    title: 'Нутриціологам і студіям',
    copy: 'Далі — ролі для нутриціолога, команда та групові заняття. Gart росте разом із вашою практикою.',
  },
];

const MOAT = [
  {
    number: '01',
    title: 'Українські платежі',
    copy: 'Скоро — оплати через LiqPay, Fondy чи WayForPay, зі сплітом і ФОП-обліком. Те, чого закордонна платформа не зробить заради нашого ринку.',
  },
  {
    number: '02',
    title: 'Українською повністю',
    copy: 'Інтерфейс, підтримка і база вправ — не переклад, а контент, створений під український ринок.',
  },
  {
    number: '03',
    title: 'Свій',
    copy: 'Локальний бренд, підтримка українською, ціни в гривні — під українського тренера, а не під західні ціни.',
  },
];

/** Block heading. Large by default — the style calls for 32px and up. */
function BlockHeading({
  id,
  onInk = false,
  children,
}: {
  id?: string;
  onInk?: boolean;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className={`text-balance scroll-mt-20 text-[clamp(1.75rem,5vw,2.75rem)] font-bold leading-[1.1] tracking-tight ${
        onInk ? 'text-on-ink' : 'text-text'
      }`}
    >
      {children}
    </h2>
  );
}

function Eyebrow({ onInk = false, children }: { onInk?: boolean; children: ReactNode }) {
  return (
    <p
      className={`mb-4 text-xs font-bold uppercase tracking-[0.16em] ${
        onInk ? 'text-accent' : 'text-accent-text'
      }`}
    >
      {children}
    </p>
  );
}

export default function LandingPage() {
  return (
    <div className="bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-surface-raised focus:px-4 focus:py-2 focus:text-sm"
      >
        Перейти до вмісту
      </a>

      <LandingHeader />

      <main id="main" className="block-snap">
        {/* ── 1 · Hero ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-bg">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_65%_55%_at_50%_0%,black,transparent)] opacity-70"
            style={{
              backgroundImage:
                'linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
            }}
          />

          <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20 lg:pb-32">
            <div className="mx-auto max-w-3xl text-center">
              <p className="inline-flex items-center gap-2 rounded-full border-2 border-border bg-surface px-4 py-1.5 text-xs font-bold text-text-secondary shadow-e1">
                <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                Українська платформа для тренерів
              </p>

              <h1 className="text-balance mt-7 text-[clamp(2.5rem,9vw,4.5rem)] font-bold leading-[1.02] tracking-tight text-text">
                Тренуйте людей, а не таблиці.
              </h1>

              <p className="text-pretty mx-auto mt-6 max-w-xl text-lg text-text-secondary sm:text-xl">
                Gart замінює Excel, PDF і Telegram одним застосунком: програми тренувань, прогрес,
                звички і чат — українською. А кожен ваш клієнт отримує застосунок під вашим брендом.
              </p>

              <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center">
                <CtaLink href="/register">Спробувати безкоштовно</CtaLink>
                <CtaLink href="/login" variant="secondary">
                  Увійти
                </CtaLink>
              </div>

              <ul className="mt-7 flex flex-col items-center gap-x-8 gap-y-2 sm:flex-row sm:justify-center">
                {['Застосунок для клієнтів — безкоштовний', 'Працює на будь-якому телефоні'].map(
                  (line) => (
                    <li
                      key={line}
                      className="flex items-center gap-2 text-sm font-medium text-text-secondary"
                    >
                      <Check className="size-4 shrink-0 text-success" />
                      {line}
                    </li>
                  ),
                )}
              </ul>
            </div>

            <div className="reveal mt-14 sm:mt-20">
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* ── 2 · The problem, as a slab ───────────────────────────────── */}
        <section className="bg-ink">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <div className="max-w-2xl">
              <Eyebrow onInk>Проблема</Eyebrow>
              <BlockHeading onInk>Знайоме?</BlockHeading>
              <p className="text-pretty mt-4 text-lg text-on-ink-secondary">
                Тренерський бізнес сьогодні здебільшого виглядає так.
              </p>
            </div>

            <ul className="reveal-stagger mt-12 grid gap-4 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-6">
              {CHAOS.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-4 rounded-panel border border-ink-border bg-ink-raised px-5 py-5 text-base font-medium text-on-ink"
                >
                  <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-danger/15">
                    <X className="size-4 text-danger" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>

            <p className="text-pretty mt-12 max-w-2xl text-lg text-on-ink-secondary">
              Години адмінки щотижня. Непрофесійний вигляд перед клієнтом. Більше клієнтів — більше
              хаосу.
            </p>
          </div>
        </section>

        {/* ── 3 · The turn ─────────────────────────────────────────────── */}
        <section className="bg-accent-subtle">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-5 py-14 sm:px-8 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-balance text-[clamp(1.75rem,5vw,3rem)] font-bold leading-[1.1] tracking-tight text-text">
              Gart збирає все в одне місце.
            </p>
            <div className="shrink-0">
              <CtaLink href="/register">Спробувати безкоштовно</CtaLink>
            </div>
          </div>
        </section>

        {/* ── 4 · Features ─────────────────────────────────────────────── */}
        <section className="bg-bg">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <div className="max-w-2xl">
              <Eyebrow>Можливості</Eyebrow>
              <BlockHeading id="mozhlyvosti">
                Все, що потрібно тренеру. В одному місці.
              </BlockHeading>
            </div>

            <ul className="reveal-stagger mt-12 grid gap-6 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-8">
              {FEATURES.map((feature) => (
                <li
                  key={feature.title}
                  className="group rounded-panel border-2 border-border bg-surface p-7 transition-colors duration-200 ease-out-expo hover:border-accent hover:bg-accent-subtle"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-card bg-accent-subtle text-accent-text transition-colors duration-200 group-hover:bg-accent group-hover:text-accent-contrast">
                      <feature.icon className="size-6" />
                    </span>
                    {feature.soon === true && (
                      <span className="shrink-0 rounded-full border border-border-strong px-2.5 py-0.5 text-xs font-bold text-text-secondary">
                        Скоро
                      </span>
                    )}
                  </div>
                  <h3 className="mt-6 text-lg font-bold text-text">{feature.title}</h3>
                  <p className="text-pretty mt-2 text-sm leading-relaxed text-text-secondary">
                    {feature.copy}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-10 rounded-panel border-2 border-dashed border-border-strong px-5 py-4 text-center text-sm font-medium text-text-secondary">
              Попереду: харчування і журнал їжі · групові заняття й агенда · нативні iOS та Android
            </p>
          </div>
        </section>

        {/* ── 5 · Who it's for ─────────────────────────────────────────── */}
        <section className="bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <div className="max-w-2xl">
              <Eyebrow>Аудиторія</Eyebrow>
              <BlockHeading id="dlia-koho">Для кого Gart</BlockHeading>
            </div>

            <ul className="reveal-stagger mt-12 grid gap-6 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-8">
              {AUDIENCES.map((audience, index) => (
                <li
                  key={audience.title}
                  className={`rounded-panel border-2 border-border bg-surface p-7 ${
                    index === AUDIENCES.length - 1 ? 'sm:col-span-2 lg:col-span-1' : ''
                  }`}
                >
                  {/*
                    The index sits inside the padding box as a real element. An
                    earlier version placed it absolutely at -right-3 -top-6 in a
                    container with overflow-hidden, which sliced it in half.
                  */}
                  <span
                    aria-hidden="true"
                    className="block text-5xl font-bold leading-none tabular-nums text-accent/25"
                  >
                    {index + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-bold text-text">{audience.title}</h3>
                  {/* Capped so the row-spanning card keeps a readable measure. */}
                  <p className="text-pretty mt-2 max-w-prose text-sm leading-relaxed text-text-secondary">
                    {audience.copy}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── 6 · The moat, as a slab ──────────────────────────────────── */}
        <section className="bg-ink">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <div className="max-w-2xl">
              <Eyebrow onInk>Чому ми</Eyebrow>
              <BlockHeading id="chomu-gart" onInk>
                Чому Gart, а не глобальні сервіси
              </BlockHeading>
            </div>

            <ul className="reveal-stagger mt-12 grid gap-8 sm:grid-cols-2 lg:mt-16 lg:grid-cols-3 lg:gap-12">
              {MOAT.map((pillar, index) => (
                <li
                  key={pillar.number}
                  className={`border-t-2 border-accent pt-6 ${
                    index === MOAT.length - 1 ? 'sm:col-span-2 lg:col-span-1' : ''
                  }`}
                >
                  <span className="text-sm font-bold tabular-nums text-accent">
                    {pillar.number}
                  </span>
                  <h3 className="mt-4 text-xl font-bold tracking-tight text-on-ink">
                    {pillar.title}
                  </h3>
                  <p className="text-pretty mt-3 max-w-prose text-sm leading-relaxed text-on-ink-secondary">
                    {pillar.copy}
                  </p>
                </li>
              ))}
            </ul>

            <p className="text-pretty mt-12 max-w-2xl text-sm text-on-ink-secondary">
              Глобальні сервіси — англійською, в доларах, зі Stripe, недоступним ФОПу. Gart живе
              там, куди вони не заходять.
            </p>
          </div>
        </section>

        {/* ── 7 · Social proof (honest placeholder) ────────────────────── */}
        <section className="bg-bg">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <BlockHeading>Тренери про Gart</BlockHeading>

            <div className="mt-10 rounded-panel border-2 border-dashed border-border-strong bg-bg-subtle p-8 text-center sm:p-12">
              <p className="text-pretty text-lg text-text-secondary">
                Ми збираємо перші історії тренерів — чесно, без вигаданих відгуків.
              </p>
              <p className="text-balance mt-2 text-xl font-bold text-text">Ваша може бути тут.</p>
              <div className="mt-7 flex justify-center">
                <CtaLink href="/register" variant="secondary">
                  Стати одним із перших
                </CtaLink>
              </div>
            </div>
          </div>
        </section>

        {/* ── 8 · Final CTA, full-bleed ember ──────────────────────────── */}
        <section className="bg-accent">
          <div className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8 sm:py-28">
            {/*
              No `overflow-hidden` anywhere around this text, and no absolutely
              positioned decoration overlapping it — the earlier version wrapped
              the heading in a clipped panel, which is the class of bug that cut
              «Більше тренувань.» at the edge.
            */}
            <h2 className="text-balance text-[clamp(2rem,7vw,3.5rem)] font-bold leading-[1.05] tracking-tight text-accent-contrast">
              Менше адмінки. Більше тренувань.
            </h2>
            <p className="text-pretty mx-auto mt-5 max-w-lg text-lg text-accent-contrast">
              Реєстрація за хвилину. Клієнти отримують застосунок безкоштовно.
            </p>
            <div className="mt-9 flex justify-center">
              <Link
                href="/register"
                className="inline-flex min-h-12 items-center justify-center rounded-control bg-ink px-8 text-base font-bold text-on-ink transition-colors duration-200 ease-out-expo hover:bg-ink-raised focus-visible:outline-ink"
              >
                Спробувати безкоштовно
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t-2 border-border bg-bg">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div>
            <Wordmark href="/" />
            <p className="text-pretty mt-3 max-w-xs text-sm text-text-secondary">
              Українська платформа для персональних тренерів.
            </p>
          </div>

          <nav aria-label="Футер">
            <ul className="flex flex-col gap-2 text-sm font-medium sm:flex-row sm:gap-8">
              <li>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center text-text-secondary transition-colors hover:text-text"
                >
                  Увійти
                </Link>
              </li>
              <li>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center text-text-secondary transition-colors hover:text-text"
                >
                  Зареєструватися
                </Link>
              </li>
            </ul>
          </nav>
        </div>

        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-text-secondary sm:px-8">
            © 2026 Gart
          </p>
        </div>
      </footer>
    </div>
  );
}
