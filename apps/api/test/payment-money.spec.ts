import { Prisma } from '../src/generated/prisma/client.js';
import { entitlementEnd, addMonths } from '../src/payments/entitlement-window';
import { amountsEqual, parseAmount, toMoney } from '../src/common/money';
import { payloadDigest, sign, signaturesMatch } from '../src/payments/signature';

describe('money', () => {
  it('serialises Decimal to a fixed-scale string, never a number', () => {
    expect(toMoney(new Prisma.Decimal('1500'), 'UAH')).toEqual({
      amount: '1500.00',
      currency: 'UAH',
    });
    expect(toMoney(new Prisma.Decimal('1234.56'), 'UAH').amount).toBe('1234.56');
  });

  it('survives the amount that would betray a float', () => {
    // 0.1 + 0.2 in Decimal is exactly 0.30; in a double it is not.
    const sum = new Prisma.Decimal('0.10').plus(new Prisma.Decimal('0.20'));

    expect(toMoney(sum, 'UAH').amount).toBe('0.30');
    expect(sum.equals(new Prisma.Decimal('0.30'))).toBe(true);
  });

  it('compares by value, so trailing zeros do not lose a payment', () => {
    const stored = new Prisma.Decimal('1500.00');

    expect(amountsEqual(stored, '1500.00')).toBe(true);
    expect(amountsEqual(stored, '1500.0')).toBe(true);
    expect(amountsEqual(stored, '1500')).toBe(true);
    expect(amountsEqual(stored, '1500.01')).toBe(false);
    expect(amountsEqual(stored, '150.00')).toBe(false);
  });

  it('refuses amounts a payment can never legitimately carry', () => {
    for (const bad of ['-1.00', '0', '0.00', 'NaN', 'Infinity', '1e3', '', ' 1.00', '1.005']) {
      expect(parseAmount(bad)).toBeNull();
    }

    expect(parseAmount('1500.00')?.toFixed(2)).toBe('1500.00');
  });

  it('accepts meaningless extra precision but not a genuinely different amount', () => {
    // An acquirer rendering three decimals still means the same money. A
    // refused callback answers 204 and is never retried, so getting this wrong
    // costs a payment rather than an error.
    expect(parseAmount('1500.000')?.toFixed(2)).toBe('1500.00');
    expect(amountsEqual(new Prisma.Decimal('1500.00'), '1500.000')).toBe(true);
    expect(amountsEqual(new Prisma.Decimal('1500.00'), '1500.0000')).toBe(true);

    // These are not 1500.00 and must never pass as it.
    expect(parseAmount('1500.005')).toBeNull();
    expect(parseAmount('1500.001')).toBeNull();
    expect(amountsEqual(new Prisma.Decimal('1500.00'), '1500.005')).toBe(false);

    // And the scale is still bounded — six places, not unbounded.
    expect(parseAmount('1500.0000000')).toBeNull();
  });
});

describe('signatures', () => {
  it('verifies a signature it produced', () => {
    const signature = sign('payload', 'secret');

    expect(signaturesMatch(signature, sign('payload', 'secret'))).toBe(true);
  });

  it('rejects a different payload, a different secret, and a different length', () => {
    expect(signaturesMatch(sign('a', 'secret'), sign('b', 'secret'))).toBe(false);
    expect(signaturesMatch(sign('a', 'one'), sign('a', 'two'))).toBe(false);
    // Length mismatch must be a false, not the throw timingSafeEqual would give.
    expect(signaturesMatch('short', sign('a', 'secret'))).toBe(false);
  });

  it('digests a body independently of key order, so a re-encoded retry collides', () => {
    expect(payloadDigest({ a: 1, b: 2 })).toBe(payloadDigest({ b: 2, a: 1 }));
    expect(payloadDigest({ a: 1 })).not.toBe(payloadDigest({ a: 2 }));
    expect(payloadDigest({ nested: { x: 1, y: [1, 2] } })).toBe(
      payloadDigest({ nested: { y: [1, 2], x: 1 } }),
    );
    // Array order is meaning, not formatting.
    expect(payloadDigest([1, 2])).not.toBe(payloadDigest([2, 1]));
  });
});

describe('entitlement windows', () => {
  const start = new Date('2026-01-31T12:00:00.000Z');

  it('clamps a month boundary rather than rolling into the next month', () => {
    // 31 January + 1 month is 28 February, not 3 March.
    expect(addMonths(start, 1).toISOString()).toBe('2026-02-28T12:00:00.000Z');
  });

  it('counts subscriptions in months', () => {
    expect(entitlementEnd(start, { period: 'MONTHLY', accessDays: null })?.toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
    expect(entitlementEnd(start, { period: 'ANNUAL', accessDays: null })?.toISOString()).toBe(
      '2027-01-31T12:00:00.000Z',
    );
  });

  it('counts one-time access in days, and perpetual access not at all', () => {
    expect(entitlementEnd(start, { period: null, accessDays: 30 })?.toISOString()).toBe(
      '2026-03-02T12:00:00.000Z',
    );
    expect(entitlementEnd(start, { period: null, accessDays: null })).toBeNull();
  });

  it('prefers the subscription period when a product carries both', () => {
    expect(entitlementEnd(start, { period: 'MONTHLY', accessDays: 5 })?.toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });
});
