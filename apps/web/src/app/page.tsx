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
  'Чат із клієнтами впереміш з особистим',
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

function SectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="scroll-mt-24 text-2xl font-semibold tracking-tight text-text sm:text-3xl"
    >
      {children}
    </h2>
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

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1fr_minmax(0,26rem)] lg:pb-28 lg:pt-24">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
                Українська платформа для персональних тренерів
              </p>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-text sm:text-5xl">
                Тренуйте людей, <br />а не таблиці.
              </h1>

              <p className="mt-6 max-w-xl text-lg text-text-secondary">
                Gart замінює Excel, PDF і Telegram одним застосунком: програми тренувань, прогрес,
                звички і чат — українською. А кожен ваш клієнт отримує застосунок під вашим брендом.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <CtaLink href="/register">Спробувати безкоштовно</CtaLink>
                <CtaLink href="/login" variant="secondary">
                  Увійти
                </CtaLink>
              </div>

              <ul className="mt-6 space-y-1.5">
                {[
                  'Застосунок для ваших клієнтів — безкоштовний',
                  'Працює на будь-якому телефоні',
                ].map((line) => (
                  <li key={line} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check className="size-4 shrink-0 text-success" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <HeroVisual />
          </div>
        </section>

        {/* ── Problem → solution ───────────────────────────────────────── */}
        <section className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading>Знайоме?</SectionHeading>
            <p className="mt-2 max-w-2xl text-text-secondary">
              Тренерський бізнес сьогодні здебільшого виглядає так:
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CHAOS.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-sm text-text"
                >
                  <X className="size-4 shrink-0 text-danger" />
                  {item}
                </li>
              ))}
            </ul>

            <p className="mt-8 max-w-2xl text-text-secondary">
              Години адмінки щотижня. Непрофесійний вигляд перед клієнтом. Більше клієнтів — більше
              хаосу.
            </p>
            <p className="mt-2 text-lg font-semibold text-text">Gart збирає все в одне місце.</p>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <SectionHeading id="mozhlyvosti">
            Все, що потрібно тренеру. В одному місці.
          </SectionHeading>

          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="rounded-card border border-border bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="inline-flex size-10 items-center justify-center rounded-control bg-accent-subtle text-accent">
                    <feature.icon className="size-5" />
                  </span>
                  {feature.soon === true && (
                    <span className="rounded-full border border-border-strong px-2 py-0.5 text-xs font-medium text-text-secondary">
                      Скоро
                    </span>
                  )}
                </div>
                <h3 className="mt-4 text-base font-semibold text-text">{feature.title}</h3>
                <p className="mt-1.5 text-sm text-text-secondary">{feature.copy}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 rounded-card border border-dashed border-border-strong px-4 py-3 text-center text-sm text-text-secondary">
            Попереду: харчування і журнал їжі · групові заняття й агенда · нативні iOS та Android
          </p>
        </section>

        {/* ── Who it's for ─────────────────────────────────────────────── */}
        <section className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading id="dlia-koho">Для кого Gart</SectionHeading>

            <ul className="mt-10 grid gap-4 lg:grid-cols-3">
              {AUDIENCES.map((audience) => (
                <li
                  key={audience.title}
                  className="rounded-card border border-border bg-surface p-5"
                >
                  <h3 className="text-base font-semibold text-text">{audience.title}</h3>
                  <p className="mt-1.5 text-sm text-text-secondary">{audience.copy}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── The moat ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <SectionHeading id="chomu-gart">Чому Gart, а не глобальні сервіси</SectionHeading>

          <ul className="mt-10 grid gap-4 lg:grid-cols-3">
            {MOAT.map((pillar) => (
              <li key={pillar.number} className="rounded-card border border-border p-5">
                <span className="text-sm font-semibold tabular-nums text-accent">
                  {pillar.number}
                </span>
                <h3 className="mt-3 text-base font-semibold text-text">{pillar.title}</h3>
                <p className="mt-1.5 text-sm text-text-secondary">{pillar.copy}</p>
              </li>
            ))}
          </ul>

          <p className="mt-8 max-w-2xl text-sm text-text-secondary">
            Глобальні сервіси — англійською, в доларах, зі Stripe, недоступним ФОПу. Gart живе там,
            куди вони не заходять.
          </p>
        </section>

        {/* ── Social proof (honest placeholder) ─────────────────────────── */}
        <section className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
            <SectionHeading>Тренери про Gart</SectionHeading>

            <div className="mx-auto mt-10 max-w-2xl rounded-card border border-dashed border-border-strong bg-surface p-8 text-center">
              <p className="text-text-secondary">
                Ми збираємо перші історії тренерів — чесно, без вигаданих відгуків.
              </p>
              <p className="mt-1 font-medium text-text">Ваша може бути тут.</p>
              <div className="mt-6 flex justify-center">
                <CtaLink href="/register" variant="secondary" size="md">
                  Стати одним із перших
                </CtaLink>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <div className="relative overflow-hidden rounded-card border border-border bg-surface px-6 py-12 text-center sm:px-12">
            <div
              aria-hidden="true"
              className="absolute -top-24 left-1/2 size-64 -translate-x-1/2 rounded-full bg-accent/15 blur-3xl"
            />
            <h2 className="relative text-2xl font-semibold tracking-tight text-text sm:text-3xl">
              Менше адмінки. Більше тренувань.
            </h2>
            <div className="relative mt-8 flex justify-center">
              <CtaLink href="/register">Спробувати безкоштовно</CtaLink>
            </div>
            <p className="relative mt-4 text-sm text-text-secondary">
              Реєстрація за хвилину · Клієнти отримують застосунок безкоштовно
            </p>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Wordmark href="/" />
            <p className="mt-2 max-w-xs text-sm text-text-secondary">
              Українська платформа для персональних тренерів.
            </p>
          </div>

          <nav aria-label="Футер">
            <ul className="flex items-center gap-6 text-sm">
              <li>
                <Link
                  href="/login"
                  className="inline-flex min-h-11 items-center text-text-secondary hover:text-text"
                >
                  Увійти
                </Link>
              </li>
              <li>
                <Link
                  href="/register"
                  className="inline-flex min-h-11 items-center text-text-secondary hover:text-text"
                >
                  Зареєструватися
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-text-secondary sm:px-6">
            © 2026 Gart
          </p>
        </div>
      </footer>
    </div>
  );
}
