import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowUpRight,
  Check,
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
];

interface Feature {
  icon: LucideIcon;
  title: string;
  copy: string;
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
    title: 'Українською повністю',
    copy: 'Інтерфейс, підтримка і база вправ — не переклад, а контент, створений під український ринок.',
  },
  {
    number: '02',
    title: 'Свій',
    copy: 'Локальний бренд, підтримка українською, ціни в гривні — під українського тренера, а не під західні ціни.',
  },
];

const PRODUCT_PROMISES = [
  { marker: '01', title: 'Один простір', copy: 'клієнти, плани й результати' },
  { marker: '02', title: 'Будь-який екран', copy: 'зручно у вебі та на телефоні' },
  { marker: '03', title: 'Ваш бренд', copy: 'окремий досвід для клієнта' },
];

function SectionHeading({
  id,
  inverse = false,
  children,
}: {
  id?: string;
  inverse?: boolean;
  children: ReactNode;
}) {
  return (
    <h2
      id={id}
      className={`text-balance scroll-mt-24 text-3xl font-bold leading-tight tracking-[-0.045em] sm:text-4xl ${inverse ? 'text-[#f7f6f2]' : 'text-text'}`}
    >
      {children}
    </h2>
  );
}

/** A short line above a section heading — orientation without another heading. */
function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-2 text-2xs font-bold uppercase tracking-[0.18em] text-accent-text before:h-px before:w-6 before:bg-accent">
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

      <main id="main">
        {/* ── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#10120f] text-[#f7f6f2]">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_85%_75%_at_50%_20%,black,transparent)] opacity-[0.08]"
            style={{
              backgroundImage:
                'linear-gradient(to right, #f7f6f2 1px, transparent 1px), linear-gradient(to bottom, #f7f6f2 1px, transparent 1px)',
              backgroundSize: '72px 72px',
            }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-48 top-0 size-[46rem] rounded-full bg-accent/20 blur-[120px] motion-safe:animate-ember"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-12 left-1/2 -translate-x-1/2 text-[22vw] font-extrabold leading-none tracking-[-0.09em] text-white/[0.018]"
          >
            GART
          </span>

          <div className="relative mx-auto grid min-h-[54rem] max-w-7xl items-center gap-8 px-4 pb-28 pt-28 sm:min-h-[58rem] sm:px-6 sm:pb-32 sm:pt-32 lg:min-h-[min(58rem,100dvh)] lg:grid-cols-[0.8fr_1.2fr] lg:gap-8 lg:pb-24 lg:pt-28">
            <div className="relative z-10 max-w-2xl text-left">
              <p className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-[#b9c0b6] backdrop-blur-sm">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-accent shadow-[0_0_0_5px_rgb(255_91_50_/_0.12)]"
                />
                Українська платформа для персональних тренерів
              </p>

              <h1 className="mt-8 text-[3.55rem] font-bold leading-[0.88] tracking-[-0.075em] text-[#f7f6f2] sm:text-[5.5rem] lg:text-[clamp(5rem,7vw,7rem)]">
                <span className="block">Тренуйте</span>{' '}
                <span className="block text-accent">людей,</span>{' '}
                <span className="block">а не таблиці.</span>
              </h1>

              <p className="text-pretty mt-7 max-w-lg text-base leading-relaxed text-[#aeb4aa] sm:text-lg">
                Gart замінює Excel, PDF і Telegram одним застосунком: програми тренувань, прогрес,
                звички і чат — українською. А кожен ваш клієнт отримує застосунок під вашим брендом.
              </p>

              <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row">
                <CtaLink href="/register">
                  Спробувати безкоштовно
                  <ArrowUpRight className="size-4" aria-hidden="true" />
                </CtaLink>
                <CtaLink
                  href="/login"
                  variant="secondary"
                  className="border-white/15 bg-white/[0.06] text-[#f7f6f2] shadow-none hover:bg-white/10"
                >
                  Увійти
                </CtaLink>
              </div>

              <ul className="mt-8 flex flex-col items-start gap-x-6 gap-y-2.5 sm:flex-row">
                {[
                  'Застосунок для ваших клієнтів — безкоштовний',
                  'Працює на будь-якому телефоні',
                ].map((line) => (
                  <li key={line} className="flex items-center gap-2 text-sm text-[#92998f]">
                    <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.08]">
                      <Check className="size-3.5 text-success" />
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="reveal relative z-10 lg:-mr-20">
              <HeroVisual />
            </div>
          </div>
        </section>

        <section aria-label="Ключові переваги" className="relative z-20 bg-bg">
          <div className="mx-auto -mt-12 max-w-7xl px-4 sm:px-6">
            <ul className="grid overflow-hidden rounded-panel border border-border bg-surface shadow-e4 sm:grid-cols-3 sm:divide-x sm:divide-border">
              {PRODUCT_PROMISES.map((item) => (
                <li
                  key={item.marker}
                  className="flex items-start gap-4 border-b border-border px-5 py-5 last:border-b-0 sm:border-b-0 sm:px-7 sm:py-7"
                >
                  <span className="pt-0.5 text-[0.625rem] font-bold tracking-[0.14em] text-accent">
                    {item.marker}
                  </span>
                  <div>
                    <p className="text-sm font-bold text-text">{item.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-text-secondary">{item.copy}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Problem → solution ───────────────────────────────────────── */}
        <section className="bg-bg-subtle">
          <div className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:py-36">
            <div className="grid items-start gap-12 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
              <div className="max-w-xl lg:sticky lg:top-28">
                <Eyebrow>Проблема</Eyebrow>
                <SectionHeading>Знайоме?</SectionHeading>
                <p className="text-pretty mt-4 max-w-sm leading-relaxed text-text-secondary">
                  Тренерський бізнес не має виглядати як колекція випадкових файлів і чатів.
                </p>
                <p
                  aria-hidden="true"
                  className="mt-10 hidden text-7xl font-extrabold tracking-[-0.07em] text-border/70 lg:block"
                >
                  LESS
                  <br />
                  CHAOS.
                </p>
              </div>

              <ul className="reveal-stagger grid gap-3 sm:grid-cols-2">
                {CHAOS.map((item, index) => (
                  <li
                    key={item}
                    className="group relative flex min-h-28 items-end overflow-hidden rounded-panel border border-border bg-surface p-5 text-sm font-semibold text-text shadow-e1 transition-[transform,box-shadow] hover:-translate-y-1 hover:shadow-e3"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute right-4 top-3 text-xs font-bold tabular text-text-muted"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="relative flex items-center gap-3">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-danger/10">
                        <X className="size-4 text-danger-text" />
                      </span>
                      {item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-16 grid gap-6 overflow-hidden rounded-[2rem] border border-[#2b2e29] bg-[#151713] p-7 shadow-e4 sm:p-10 lg:grid-cols-[1fr_auto] lg:items-center lg:px-12 lg:py-10">
              <span
                aria-hidden="true"
                className="absolute -left-12 top-0 size-48 rounded-full bg-accent/20 blur-3xl"
              />
              <div>
                <p className="text-pretty relative text-[#aeb4aa]">
                  Години адмінки щотижня. Непрофесійний вигляд перед клієнтом. Більше клієнтів —
                  більше хаосу.
                </p>
                <p className="text-balance relative mt-2 text-xl font-bold tracking-[-0.03em] text-[#f7f6f2] sm:text-2xl">
                  Gart збирає все в одне місце.
                </p>
              </div>

              <div>
                <CtaLink href="/register" size="md">
                  Спробувати безкоштовно
                </CtaLink>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden bg-[#10120f] py-24 sm:py-28 lg:py-36">
          <span
            aria-hidden="true"
            className="absolute -right-32 top-24 size-[32rem] rounded-full bg-accent/10 blur-[120px]"
          />
          <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
            <div className="max-w-2xl">
              <Eyebrow>Можливості</Eyebrow>
              <SectionHeading id="mozhlyvosti" inverse>
                Все, що потрібно тренеру. В одному місці.
              </SectionHeading>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-[#92998f]">
                Не набір розрізнених інструментів, а цілісна операційна система вашої практики.
              </p>
            </div>

            <ul className="reveal-stagger mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
              {FEATURES.map((feature, index) => (
                <li
                  key={feature.title}
                  className={`group relative overflow-hidden rounded-panel border p-6 shadow-e1 transition-[border-color,box-shadow,transform] duration-300 ease-out-expo hover:-translate-y-1 hover:shadow-e3 sm:p-7 lg:col-span-4 ${
                    index === 0
                      ? 'border-accent bg-accent sm:col-span-2 lg:col-span-8 lg:min-h-[20rem]'
                      : index === FEATURES.length - 1
                        ? 'border-[#dedbd0] bg-[#f7f6f2] sm:col-span-2 lg:col-span-12'
                        : 'border-white/10 bg-[#181b17] hover:border-white/20'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute -right-2 -top-7 text-8xl font-extrabold tracking-[-0.08em] ${index === 0 ? 'text-[#171813]/10' : index === FEATURES.length - 1 ? 'text-[#171813]/5' : 'text-white/[0.035]'}`}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="flex items-center justify-between">
                    <span
                      className={`relative inline-flex size-12 items-center justify-center rounded-card transition-transform duration-300 ease-out-expo group-hover:rotate-[-4deg] group-hover:scale-105 ${index === 0 ? 'bg-[#151713] text-accent' : index === FEATURES.length - 1 ? 'bg-accent-subtle text-accent-text' : 'bg-white/[0.07] text-accent'}`}
                    >
                      <feature.icon className="size-5" />
                    </span>
                  </div>
                  <h3
                    className={`relative mt-6 font-bold ${index === 0 ? 'max-w-md text-3xl tracking-[-0.05em] text-accent-contrast sm:text-4xl' : index === FEATURES.length - 1 ? 'text-lg text-[#171813]' : 'text-lg text-[#f7f6f2]'}`}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className={`text-pretty relative mt-3 max-w-xl text-sm leading-relaxed ${index === 0 ? 'text-[#44362f]' : index === FEATURES.length - 1 ? 'text-[#5f645a]' : 'text-[#aeb4aa]'}`}
                  >
                    {feature.copy}
                  </p>
                </li>
              ))}
            </ul>

            <p className="mt-8 rounded-card border border-dashed border-white/15 px-4 py-3.5 text-center text-sm text-[#92998f]">
              Попереду: харчування і журнал їжі · групові заняття й агенда · нативні iOS та Android
            </p>
          </div>
        </section>

        {/* ── Who it's for ─────────────────────────────────────────────── */}
        <section className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
            <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
              <div>
                <Eyebrow>Аудиторія</Eyebrow>
                <SectionHeading id="dlia-koho">Для кого Gart</SectionHeading>
              </div>
              <p className="max-w-xl text-pretty text-sm leading-relaxed text-text-secondary lg:justify-self-end">
                Для практики будь-якого формату — від перших онлайн-клієнтів до команди, яка працює
                під одним брендом.
              </p>
            </div>

            <ul className="reveal-stagger mt-12 grid gap-4 lg:grid-cols-12">
              {AUDIENCES.map((audience, index) => (
                <li
                  key={audience.title}
                  className={`relative flex min-h-64 flex-col justify-between overflow-hidden rounded-panel border p-6 shadow-e2 sm:p-8 ${
                    index === 0
                      ? 'border-[#2b2e29] bg-[#171915] text-[#f7f6f2] lg:col-span-5 lg:min-h-[21rem]'
                      : index === 1
                        ? 'border-accent bg-accent text-[#171915] lg:col-span-7 lg:min-h-[21rem]'
                        : 'border-border bg-surface lg:col-span-12 lg:min-h-0 lg:flex-row lg:items-end lg:gap-16'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute -right-3 -top-8 text-9xl font-extrabold tabular-nums tracking-[-0.08em] ${
                      index === 0
                        ? 'text-white/[0.045]'
                        : index === 1
                          ? 'text-[#171915]/[0.07]'
                          : 'text-border/60'
                    }`}
                  >
                    0{index + 1}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`relative size-3 rounded-full ${index === 0 ? 'bg-accent' : index === 1 ? 'bg-[#171915]' : 'bg-success'}`}
                  />
                  <div className={index === 2 ? 'lg:flex lg:items-end lg:gap-16' : ''}>
                    <h3
                      className={`relative max-w-sm text-2xl font-bold tracking-[-0.04em] ${
                        index === 0
                          ? 'text-[#f7f6f2]'
                          : index === 1
                            ? 'text-[#171915]'
                            : 'text-text'
                      }`}
                    >
                      {audience.title}
                    </h3>
                    <p
                      className={`text-pretty relative mt-3 max-w-lg text-sm leading-relaxed ${
                        index === 0
                          ? 'text-[#aeb4aa]'
                          : index === 1
                            ? 'text-[#51372f]'
                            : 'text-text-secondary lg:mt-0'
                      }`}
                    >
                      {audience.copy}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── The moat ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-32">
          <div className="grid items-start gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-24">
            <div className="max-w-xl lg:sticky lg:top-28">
              <Eyebrow>Чому ми</Eyebrow>
              <SectionHeading id="chomu-gart">Чому Gart, а не глобальні сервіси</SectionHeading>
              <p className="text-pretty mt-6 max-w-sm text-sm leading-relaxed text-text-secondary">
                Глобальні сервіси — англійською і в доларах. Gart живе там, куди вони не заходять.
              </p>
            </div>

            <ul className="reveal-stagger border-t border-border-strong">
              {MOAT.map((pillar) => (
                <li
                  key={pillar.number}
                  className="group grid gap-4 border-b border-border-strong py-8 sm:grid-cols-[4rem_1fr] sm:gap-6 sm:py-10"
                >
                  <span className="text-xs font-bold tabular-nums tracking-[0.16em] text-accent-text">
                    {pillar.number}
                  </span>
                  <div>
                    <h3 className="text-2xl font-bold tracking-[-0.04em] text-text transition-transform duration-300 ease-out-expo group-hover:translate-x-1 sm:text-3xl">
                      {pillar.title}
                    </h3>
                    <p className="text-pretty mt-3 max-w-xl text-sm leading-relaxed text-text-secondary">
                      {pillar.copy}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Social proof (honest placeholder) ─────────────────────────── */}
        <section className="border-y border-border bg-bg-subtle">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-28">
            <SectionHeading>Тренери про Gart</SectionHeading>

            <div className="mx-auto mt-10 max-w-2xl rounded-panel border border-dashed border-border-strong bg-surface p-8 text-center shadow-e2 sm:p-12">
              <p className="text-pretty text-text-secondary">
                Ми збираємо перші історії тренерів — чесно, без вигаданих відгуків.
              </p>
              <p className="mt-1.5 text-lg font-medium text-text">Ваша може бути тут.</p>
              <div className="mt-6 flex justify-center">
                <CtaLink href="/register" variant="secondary" size="md">
                  Стати одним із перших
                </CtaLink>
              </div>
            </div>
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:py-32">
          <div className="relative overflow-hidden rounded-panel border border-[#2b2e29] bg-[#151713] px-6 py-16 text-center shadow-e4 sm:px-12 sm:py-24">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-28 left-1/2 size-[34rem] max-w-[140%] -translate-x-1/2 rounded-full bg-accent/25 blur-3xl motion-safe:animate-ember"
            />
            <h2 className="text-balance relative text-3xl font-bold tracking-[-0.05em] text-[#f7f6f2] sm:text-5xl">
              Менше адмінки. Більше тренувань.
            </h2>
            <p className="text-pretty relative mx-auto mt-5 max-w-md text-[#aeb4aa]">
              Реєстрація за хвилину. Клієнти отримують застосунок безкоштовно.
            </p>
            <div className="relative mt-8 flex justify-center">
              <CtaLink href="/register">Спробувати безкоштовно</CtaLink>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-12 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div>
            <Wordmark href="/" />
            <p className="text-pretty mt-3 max-w-xs text-sm text-text-secondary">
              Українська платформа для персональних тренерів.
            </p>
          </div>

          <nav aria-label="Футер">
            <ul className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-8">
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
          <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-text-secondary sm:px-6">
            © 2026 Gart
          </p>
        </div>
      </footer>
    </div>
  );
}
