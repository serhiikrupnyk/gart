import { Activity, Check, Flame, MessageCircle, TrendingUp } from 'lucide-react';

/**
 * A deliberately art-directed product composition, built from real Gart
 * surfaces. The trainer workspace sits behind the client's phone so the hero
 * communicates both sides of the product before a visitor reads the details.
 */
export function HeroVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative min-h-[39rem] select-none sm:min-h-[42rem] lg:min-h-[44rem]"
    >
      <div className="pointer-events-none absolute left-[44%] top-[48%] size-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/20 blur-[90px]" />
      <span className="pointer-events-none absolute left-[14%] top-[8%] size-[29rem] rounded-full border border-white/[0.07]" />
      <span className="pointer-events-none absolute left-[24%] top-[18%] size-[22rem] rounded-full border border-accent/20" />

      {/* Trainer workspace — deliberately clipped and rotated like a physical object. */}
      <div className="absolute left-[-3%] top-[11%] hidden w-[80%] -rotate-[4deg] overflow-hidden rounded-[2rem] border border-[#353832] bg-[#171915] p-2 shadow-e4 sm:block lg:left-[-8%] lg:w-[84%]">
        <div className="flex h-10 items-center gap-1.5 px-3 text-[#72786f]">
          <span className="size-2 rounded-full bg-accent" />
          <span className="size-2 rounded-full bg-[#3c413a]" />
          <span className="size-2 rounded-full bg-[#3c413a]" />
          <span className="ml-auto text-[0.55rem] font-bold uppercase tracking-[0.2em]">
            Trainer OS
          </span>
        </div>

        <div className="grid h-[26rem] grid-cols-[5rem_1fr] overflow-hidden rounded-[1.35rem] bg-[#efeee8]">
          <div className="flex flex-col items-center gap-5 border-r border-[#dedbd0] bg-[#e5e3dc] py-5">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-[#171915] text-[0.65rem] font-extrabold text-[#f7f6f2]">
              G
            </span>
            {[Activity, TrendingUp, MessageCircle].map((Icon, index) => (
              <span
                key={index}
                className={`inline-flex size-8 items-center justify-center rounded-xl ${index === 0 ? 'bg-accent text-[#171915]' : 'text-[#858a81]'}`}
              >
                <Icon className="size-3.5" />
              </span>
            ))}
          </div>

          <div className="p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.18em] text-[#8a8f86]">
                  Понеділок · 24 серпня
                </p>
                <p className="mt-1 text-xl font-bold tracking-[-0.045em] text-[#171915]">
                  Вітаємо, Олено
                </p>
              </div>
              <span className="rounded-full bg-[#d9ddd3] px-3 py-1 text-[0.6rem] font-bold text-[#50554d]">
                8 активних
              </span>
            </div>

            <div className="mt-6 grid grid-cols-[1.25fr_0.75fr] gap-3">
              <div className="rounded-[1.3rem] bg-[#fffefa] p-4 shadow-[0_12px_30px_rgb(28_29_25_/_0.08)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#171915]">Клієнти сьогодні</p>
                  <span className="text-[0.55rem] font-bold uppercase tracking-[0.14em] text-accent">
                    Live
                  </span>
                </div>
                <div className="mt-4 space-y-2.5">
                  {[
                    ['Олена К.', 'Силове · 18:30', '78%'],
                    ['Максим Б.', 'Біг · виконано', '100%'],
                    ['Ірина М.', 'Відновлення', '62%'],
                  ].map(([name, detail, progress]) => (
                    <div
                      key={name}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl bg-[#f1f0ea] px-3 py-2.5"
                    >
                      <div>
                        <p className="text-[0.65rem] font-bold text-[#292b27]">{name}</p>
                        <p className="mt-0.5 text-[0.55rem] text-[#7d8279]">{detail}</p>
                      </div>
                      <span className="text-[0.6rem] font-bold tabular-nums text-[#50554d]">
                        {progress}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col rounded-[1.3rem] bg-[#171915] p-4 text-[#f7f6f2]">
                <TrendingUp className="size-4 text-accent" />
                <p className="mt-4 text-3xl font-bold tracking-[-0.06em]">+18%</p>
                <p className="mt-1 text-[0.58rem] leading-relaxed text-[#9ba197]">
                  регулярність клієнтів цього місяця
                </p>
                <div className="mt-auto flex h-16 items-end gap-1">
                  {[36, 52, 44, 68, 57, 78, 92].map((height, index) => (
                    <span
                      key={index}
                      className="flex-1 rounded-full bg-accent"
                      style={{ height: `${height}%`, opacity: 0.35 + index * 0.09 }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Client phone — the foreground object and the mobile hero. */}
      <div className="absolute right-[2%] top-[3%] w-[17rem] rotate-[3deg] rounded-[2.8rem] border border-[#454840] bg-[#0d0f0c] p-[0.42rem] shadow-e4 sm:right-[1%] sm:top-[13%] sm:w-[18rem] lg:right-[0%] lg:w-[19rem]">
        <div className="relative min-h-[35.5rem] overflow-hidden rounded-[2.35rem] bg-[#f2f0e9] px-4 pb-4 pt-10 sm:min-h-[37.5rem]">
          <span className="absolute left-1/2 top-2.5 h-5 w-20 -translate-x-1/2 rounded-full bg-[#0d0f0c]" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.55rem] font-bold uppercase tracking-[0.16em] text-[#8a8f86]">
                Сьогодні
              </p>
              <p className="mt-1 text-base font-bold tracking-[-0.04em] text-[#171915]">
                Привіт, Олено
              </p>
            </div>
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-[0.65rem] font-extrabold text-[#171915]">
              ОК
            </span>
          </div>

          <div className="mt-5 overflow-hidden rounded-[1.55rem] bg-[#171915] p-4 text-[#f7f6f2]">
            <div className="flex items-center justify-between">
              <span className="text-[0.62rem] font-bold uppercase tracking-[0.13em] text-[#92988e]">
                Тренування A
              </span>
              <span className="size-2 rounded-full bg-accent" />
            </div>
            <p className="mt-3 text-xl font-bold tracking-[-0.045em]">Ноги · сила</p>
            <p className="mt-1 text-[0.6rem] text-[#92988e]">4 вправи · 52 хв</p>

            <div className="mt-5 space-y-2">
              <div className="rounded-xl bg-white/[0.07] p-3">
                <p className="text-[0.6rem] text-[#aeb4aa]">Присідання зі штангою</p>
                <p className="mt-1 text-sm font-bold tabular-nums">5×5 · 82,5 кг</p>
              </div>
              <div className="rounded-xl bg-white/[0.07] p-3">
                <p className="text-[0.6rem] text-[#aeb4aa]">Румунська тяга</p>
                <p className="mt-1 text-sm font-bold tabular-nums">3×8 · 60 кг</p>
              </div>
            </div>

            <div className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-accent text-[0.65rem] font-bold text-[#171915]">
              <Check className="size-3.5" />
              Почати тренування
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3 rounded-[1.3rem] bg-[#fffefa] p-3 shadow-[0_8px_24px_rgb(28_29_25_/_0.07)]">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#ffe1d8]">
              <Flame className="size-4 text-accent" />
            </span>
            <div>
              <p className="text-xs font-bold text-[#171915]">7 днів поспіль</p>
              <p className="mt-0.5 text-[0.58rem] text-[#7d8279]">Нова особиста серія</p>
            </div>
          </div>

          <div className="absolute inset-x-4 bottom-4 flex items-center justify-around rounded-[1.15rem] bg-[#e5e3dc] py-3 text-[#8a8f86]">
            <span className="size-2 rounded-full bg-accent" />
            <Activity className="size-4 text-[#171915]" />
            <TrendingUp className="size-4" />
            <MessageCircle className="size-4" />
          </div>
        </div>
      </div>

      <div className="absolute bottom-[9%] left-[0%] hidden items-center gap-3 rounded-[1.25rem] border border-white/10 bg-[#f7f6f2]/95 px-4 py-3.5 text-[#171915] shadow-e4 backdrop-blur-xl sm:flex">
        <span className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-xs font-extrabold">
          G
        </span>
        <div>
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.16em] text-[#858a81]">
            White label
          </p>
          <p className="mt-0.5 text-xs font-bold">Ваш бренд. Ваші клієнти.</p>
        </div>
      </div>
    </div>
  );
}
