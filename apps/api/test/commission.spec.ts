import { Prisma } from '../src/generated/prisma/client.js';
import { COMMISSION_PERCENT_ENV, commissionPercent, splitAmount } from '../src/payments/commission';

const FIVE = new Prisma.Decimal(5);

describe('the commission rate', () => {
  it('defaults to five percent when nothing is configured', () => {
    expect(commissionPercent({}).toFixed(2)).toBe('5.00');
    expect(commissionPercent({ [COMMISSION_PERCENT_ENV]: '' }).toFixed(2)).toBe('5.00');
  });

  it('takes a configured rate, including a fractional one', () => {
    expect(commissionPercent({ [COMMISSION_PERCENT_ENV]: '7.5' }).toFixed(2)).toBe('7.50');
    expect(commissionPercent({ [COMMISSION_PERCENT_ENV]: '0' }).toFixed(2)).toBe('0.00');
    expect(commissionPercent({ [COMMISSION_PERCENT_ENV]: '100' }).toFixed(2)).toBe('100.00');
  });

  it('refuses to start on a rate that would take the wrong amount of money', () => {
    // 500 would take five times the payment; -5 would pay the trainer more than
    // the client paid. Neither is a value to fall back from quietly.
    for (const bad of ['500', '-5', 'five', '5%', '1e2', ' 5', '5.005', '101']) {
      expect(() => commissionPercent({ [COMMISSION_PERCENT_ENV]: bad })).toThrow(
        COMMISSION_PERCENT_ENV,
      );
    }
  });
});

describe('splitting an amount', () => {
  it('computes the case a float gets wrong', () => {
    // 23.00 x 5 / 100 is exactly 1.15 — but 1.15 has no exact binary form, so a
    // float lands on 1.1499999999999999 and the floor takes a whole kopiyka off
    // the platform. On twenty-three hryvnia.
    const { fee, payout } = splitAmount(new Prisma.Decimal('23.00'), FIVE);

    expect(fee.toFixed(2)).toBe('1.15');
    expect(payout.toFixed(2)).toBe('21.85');

    // What the same arithmetic does in floating point, pinned so the reason
    // this module exists cannot quietly stop being true.
    expect((Math.floor(((23.0 * 5) / 100) * 100) / 100).toFixed(2)).toBe('1.14');
  });

  it('rounds the fee down, never up — a fraction of a kopiyka goes to the trainer', () => {
    // 5.90 x 5 / 100 = 0.295 exactly. Rounding half-up would give 0.30.
    const { fee, payout } = splitAmount(new Prisma.Decimal('5.90'), FIVE);

    expect(fee.toFixed(2)).toBe('0.29');
    expect(payout.toFixed(2)).toBe('5.61');
  });

  it('always sums back to the amount, across the whole price range', () => {
    // The property that matters more than any single value: the two halves are
    // the amount. Derived by subtraction, so this holds by construction.
    for (let cents = 100; cents <= 100_000_000; cents += 999_983) {
      const amount = new Prisma.Decimal(cents).div(100);
      const { fee, payout } = splitAmount(amount, FIVE);

      expect(fee.plus(payout).toFixed(2)).toBe(amount.toFixed(2));
      expect(fee.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(payout.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(fee.isNegative()).toBe(false);
      expect(payout.isNegative()).toBe(false);
    }
  });

  it('balances at the floor of the price range', () => {
    const { fee, payout } = splitAmount(new Prisma.Decimal('1.00'), FIVE);

    expect(fee.toFixed(2)).toBe('0.05');
    expect(payout.toFixed(2)).toBe('0.95');
    expect(fee.plus(payout).toFixed(2)).toBe('1.00');
  });

  it('balances at the ceiling of the price range', () => {
    const { fee, payout } = splitAmount(new Prisma.Decimal('1000000.00'), FIVE);

    expect(fee.toFixed(2)).toBe('50000.00');
    expect(payout.toFixed(2)).toBe('950000.00');
    expect(fee.plus(payout).toFixed(2)).toBe('1000000.00');
  });

  it('gives the trainer everything when the platform waives its commission', () => {
    // The only way a fee of zero is reachable: the smallest sellable product is
    // ₴1, which at 5% is 0.05, so a 0.00 fee means the rate itself is 0.
    const { fee, payout } = splitAmount(new Prisma.Decimal('1500.00'), new Prisma.Decimal(0));

    expect(fee.toFixed(2)).toBe('0.00');
    expect(payout.toFixed(2)).toBe('1500.00');
  });

  it('leaves the trainer nothing when the platform takes everything', () => {
    const { fee, payout } = splitAmount(new Prisma.Decimal('1500.00'), new Prisma.Decimal(100));

    expect(fee.toFixed(2)).toBe('1500.00');
    expect(payout.toFixed(2)).toBe('0.00');
  });
});
