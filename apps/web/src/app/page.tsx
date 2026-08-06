import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { HeroVisual } from '@/components/marketing/hero-visual';
import { LandingHeader } from '@/components/marketing/landing-header';

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

/** The chaos, numbered like a contents page. Straight from the presentation. */
const CHAOS = [
  ['Excel', 'Програми тренувань — у таблицях і PDF'],
  ['Telegram', 'Відео вправ розкидані по чатах'],
  ['Нотатки', 'Харчування — десь окремо'],
  ['Ніде', 'Прогрес клієнта не фіксується'],
  ['Особисте', 'Робочий чат упереміш із життям'],
  ['«На картку»', 'Оплати вручну, без обліку'],
];

const FEATURES = [
  [
    '01',
    'Тренування',
    'Конструктор програм, бібліотека вправ із відео, шаблони. Готова програма за хвилини, а не за вечір.',
  ],
  [
    '02',
    'Застосунок клієнта',
    'Під вашим брендом — назва, лого, колір. Клієнт бачить сьогоднішнє тренування й логує ваги.',
  ],
  ['03', 'Прогрес', 'Заміри, фото, графіки і власні показники під вашу методику.'],
  ['04', 'Звички', 'Вода, кроки, сон. Серії, які мотивують відкривати застосунок щодня.'],
  ['05', 'Чат', 'Текст, голосові, фото й відео — у контексті тренувань, окремо від особистого.'],
  ['06', 'Оплати', 'Разові й підписки українськими системами, з ФОП-обліком. Скоро.'],
];

const AUDIENCES = [
  [
    'Онлайн',
    'Ведіть клієнтів дистанційно: програма в застосунку, результати перед очима, а не в листуванні.',
  ],
  [
    'У залі',
    'План на планшеті замість роздруківок. Історія клієнта — під рукою на наступному тренуванні.',
  ],
  ['Студії', 'Далі — нутриціологи, команда, групові заняття. Gart росте разом із практикою.'],
];

const MOAT = [
  [
    'Платіжна',
    'Оплати всередині платформи українськими системами, зі сплітом і ФОП-обліком. Оригінали працюють через Stripe, недоступний ФОПу. Скоро.',
  ],
  [
    'Мовна',
    'Інтерфейс, підтримка і база вправ українською — не переклад, а контент під наш ринок.',
  ],
  [
    'Довіра',
    'Локальний бренд, українська підтримка, ціни в гривні. «Свій» виграє навіть у маленькій країні.',
  ],
];

/** Section label — small, tracked, set in the display face. */
function Kicker({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-xs font-medium uppercase tracking-[0.22em] text-ink-600 dark:text-paper/60">
      {children}
    </p>
  );
}

function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2
      id={id}
      className="text-balance mt-4 scroll-mt-20 font-display text-[clamp(2rem,6vw,4rem)] font-bold uppercase leading-[0.95] tracking-[-0.01em] text-ink-900 dark:text-paper"
    >
      {children}
    </h2>
  );
}

export default function LandingPage() {
  return (
    <div className="landing-root bg-paper font-sans text-ink-900 dark:bg-ink-900 dark:text-paper">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:text-paper"
      >
        Перейти до вмісту
      </a>

      <LandingHeader />

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="border-b border-paper-line dark:border-paper/15">
          <div className="mx-auto max-w-[88rem] px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="inline-flex items-center rounded-full bg-volt px-3 py-1 font-display text-xs font-bold uppercase tracking-[0.12em] text-ink-900">
                Українська платформа
              </span>
              <Kicker>для персональних тренерів</Kicker>
            </div>

            <h1 className="text-balance mt-8 font-display text-[clamp(2.75rem,11vw,8rem)] font-bold uppercase leading-[0.88] tracking-[-0.02em] text-ink-900 dark:text-paper">
              Тренуйте людей,
              <br />
              <span className="relative inline-block">
                а не таблиці
                {/* The volt rule sits under the line, not behind the text. */}
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-1 block h-[0.14em] bg-volt sm:-bottom-2"
                />
              </span>
            </h1>

            <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-pretty max-w-xl text-lg leading-relaxed text-ink-600 sm:text-xl dark:text-paper/75">
                  Один застосунок замість Excel, PDF і Telegram. Програми, прогрес, звички й чат —
                  українською. А кожен ваш клієнт отримує застосунок під вашим брендом. Безкоштовно.
                </p>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex min-h-14 items-center justify-center rounded-full bg-ink-900 px-8 font-display text-base font-bold uppercase tracking-[0.06em] text-paper transition-transform duration-200 ease-out-expo hover:-translate-y-0.5 dark:bg-volt dark:text-ink-900"
                  >
                    Спробувати безкоштовно
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex min-h-14 items-center justify-center rounded-full border-2 border-ink-900 px-8 font-display text-base font-bold uppercase tracking-[0.06em] text-ink-900 transition-colors duration-200 hover:bg-ink-900 hover:text-paper dark:border-paper dark:text-paper dark:hover:bg-paper dark:hover:text-ink-900"
                  >
                    Увійти
                  </Link>
                </div>
              </div>

              <div className="reveal">
                <HeroVisual />
              </div>
            </div>
          </div>
        </section>

        {/* ── The chaos, as a contents page ────────────────────────────── */}
        <section className="border-b border-paper-line bg-paper-2 dark:border-paper/15 dark:bg-ink-900">
          <div className="mx-auto max-w-[88rem] px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <Kicker>01 — Проблема</Kicker>
            <SectionTitle id="khaos">Тренер живе в шести вкладках</SectionTitle>

            <ul className="reveal-stagger mt-14 border-t border-ink-900/15 dark:border-paper/20">
              {CHAOS.map(([tool, line]) => (
                <li
                  key={tool}
                  className="grid gap-1 border-b border-ink-900/15 py-6 sm:grid-cols-[minmax(0,11rem)_1fr] sm:gap-8 sm:py-7 dark:border-paper/20"
                >
                  <span className="font-display text-lg font-bold uppercase tracking-[0.04em] text-ink-900 dark:text-paper">
                    {tool}
                  </span>
                  <span className="text-pretty text-base text-ink-600 sm:text-lg dark:text-paper/70">
                    {line}
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-pretty mt-10 max-w-2xl text-lg text-ink-600 dark:text-paper/70">
              Години адміністрування щотижня. Непрофесійний вигляд перед клієнтом. Більше клієнтів —
              більше хаосу.
            </p>
          </div>
        </section>

        {/* ── The turn: full-bleed volt ────────────────────────────────── */}
        <section className="bg-volt">
          <div className="mx-auto flex max-w-[88rem] flex-col items-start gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-balance font-display text-[clamp(2rem,6vw,4rem)] font-bold uppercase leading-[0.95] tracking-[-0.01em] text-ink-900">
              Gart збирає все
              <br className="hidden sm:block" /> в одне місце
            </h2>
            <Link
              href="/register"
              className="inline-flex min-h-14 shrink-0 items-center justify-center rounded-full bg-ink-900 px-8 font-display text-base font-bold uppercase tracking-[0.06em] text-paper transition-transform duration-200 ease-out-expo hover:-translate-y-0.5 focus-visible:outline-ink-900"
            >
              Спробувати безкоштовно
            </Link>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section className="border-b border-paper-line dark:border-paper/15">
          <div className="mx-auto max-w-[88rem] px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <Kicker>02 — Можливості</Kicker>
            <SectionTitle id="mozhlyvosti">Усе, що потрібно тренеру</SectionTitle>

            <ul className="reveal-stagger mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(([n, title, copy]) => (
                <li key={n} className="border-t-2 border-ink-900 pt-5 dark:border-paper">
                  <span className="font-display text-sm font-bold tabular-nums text-ink-600 dark:text-paper/60">
                    {n}
                  </span>
                  <h3 className="mt-3 font-display text-2xl font-bold uppercase leading-tight tracking-[0.01em] text-ink-900 dark:text-paper">
                    {title}
                  </h3>
                  <p className="text-pretty mt-3 max-w-prose text-base leading-relaxed text-ink-600 dark:text-paper/70">
                    {copy}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-14 border-t border-paper-line pt-6 text-sm text-ink-600 dark:border-paper/20 dark:text-paper/60">
              Попереду: харчування і журнал їжі · групові заняття й агенда · нативні iOS та Android
            </p>
          </div>
        </section>

        {/* ── Who it's for ─────────────────────────────────────────────── */}
        <section className="border-b border-paper-line bg-paper-2 dark:border-paper/15 dark:bg-ink-900">
          <div className="mx-auto max-w-[88rem] px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <Kicker>03 — Для кого</Kicker>
            <SectionTitle>Тренерам, які ведуть людей</SectionTitle>

            <ul className="reveal-stagger mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-16">
              {AUDIENCES.map(([title, copy]) => (
                <li key={title}>
                  <h3 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-bold uppercase leading-none tracking-[-0.01em] text-ink-900 dark:text-paper">
                    {title}
                  </h3>
                  <span aria-hidden="true" className="mt-4 block h-1 w-16 bg-volt" />
                  <p className="text-pretty mt-5 max-w-prose text-base leading-relaxed text-ink-600 dark:text-paper/70">
                    {copy}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── The moat ─────────────────────────────────────────────────── */}
        <section className="border-b border-paper-line dark:border-paper/15">
          <div className="mx-auto max-w-[88rem] px-5 py-16 sm:px-8 sm:py-24 lg:py-32">
            <Kicker>04 — Чому Gart</Kicker>
            <SectionTitle id="chomu-gart">
              Три стіни, яких не перейде глобальний гравець
            </SectionTitle>

            <ul className="reveal-stagger mt-14 space-y-px border-y border-ink-900/15 dark:border-paper/20">
              {MOAT.map(([title, copy], index) => (
                <li
                  key={title}
                  className="grid gap-3 py-8 sm:grid-cols-[minmax(0,4rem)_minmax(0,14rem)_1fr] sm:gap-8 sm:py-10"
                >
                  <span className="font-display text-3xl font-bold tabular-nums leading-none text-ink-900 dark:text-volt">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="font-display text-2xl font-bold uppercase leading-tight tracking-[0.01em] text-ink-900 dark:text-paper">
                    {title}
                  </h3>
                  <p className="text-pretty max-w-prose text-base leading-relaxed text-ink-600 dark:text-paper/70">
                    {copy}
                  </p>
                </li>
              ))}
            </ul>

            <p className="text-pretty mt-10 max-w-2xl text-lg text-ink-600 dark:text-paper/70">
              Gart не конкурує з оригіналами в лоб — він у зоні, куди вони не заходять.
            </p>
          </div>
        </section>

        {/* ── Social proof: honest placeholder ─────────────────────────── */}
        <section className="border-b border-paper-line bg-paper-2 dark:border-paper/15 dark:bg-ink-900">
          <div className="mx-auto max-w-[88rem] px-5 py-16 sm:px-8 sm:py-24">
            <Kicker>05 — Тренери</Kicker>
            <h2 className="sr-only">Тренери про Gart</h2>
            <blockquote className="mt-8 max-w-4xl">
              <p className="text-balance font-display text-[clamp(1.75rem,5vw,3.25rem)] font-bold uppercase leading-[1.02] tracking-[-0.01em] text-ink-900 dark:text-paper">
                Тут буде історія першого тренера. Ми її ще збираємо —
                <span className="bg-volt box-decoration-clone px-1.5 text-ink-900">
                  чесно, без вигаданих відгуків.
                </span>
              </p>
            </blockquote>
            <div className="mt-10">
              <Link
                href="/register"
                className="inline-flex min-h-14 items-center justify-center rounded-full border-2 border-ink-900 px-8 font-display text-base font-bold uppercase tracking-[0.06em] text-ink-900 transition-colors duration-200 hover:bg-ink-900 hover:text-paper dark:border-paper dark:text-paper dark:hover:bg-paper dark:hover:text-ink-900"
              >
                Стати одним із перших
              </Link>
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────── */}
        <section className="bg-ink-900">
          <div className="mx-auto max-w-[88rem] px-5 py-20 sm:px-8 sm:py-28">
            <h2 className="text-balance font-display text-[clamp(2.5rem,10vw,7rem)] font-bold uppercase leading-[0.9] tracking-[-0.02em] text-paper">
              Менше адмінки.
              <br />
              <span className="text-volt">Більше тренувань.</span>
            </h2>

            <div className="mt-12 flex flex-col gap-4 sm:flex-row sm:items-center">
              <Link
                href="/register"
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-volt px-8 font-display text-base font-bold uppercase tracking-[0.06em] text-ink-900 transition-transform duration-200 ease-out-expo hover:-translate-y-0.5 focus-visible:outline-paper"
              >
                Спробувати безкоштовно
              </Link>
              <p className="text-sm text-paper/70">
                Реєстрація за хвилину. Клієнти отримують застосунок безкоштовно.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="bg-ink-900 text-paper">
        <div className="mx-auto flex max-w-[88rem] flex-col gap-8 border-t border-paper/15 px-5 py-12 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div>
            <p className="font-display text-2xl font-bold uppercase tracking-[0.02em]">
              Gart
              <span aria-hidden="true" className="ml-1 inline-block size-2 rounded-full bg-volt" />
            </p>
            <p className="text-pretty mt-3 max-w-xs text-sm text-paper/70">
              Українська платформа для персональних тренерів.
            </p>
          </div>

          <nav aria-label="Футер">
            <ul className="flex flex-col gap-2 sm:flex-row sm:gap-8">
              {(
                [
                  ['/login', 'Увійти'],
                  ['/register', 'Зареєструватися'],
                ] as const
              ).map(([href, label]) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center font-display text-sm font-medium uppercase tracking-[0.08em] text-paper/70 transition-colors hover:text-paper"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="mx-auto max-w-[88rem] px-5 pb-8 text-xs text-paper/60 sm:px-8">© 2026 Gart</p>
      </footer>
    </div>
  );
}
