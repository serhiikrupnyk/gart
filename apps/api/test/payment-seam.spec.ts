import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { FakePaymentProvider } from '../src/payments/fake-payment-provider';
import { InvalidCallbackError, PaymentProvider } from '../src/payments/payment-provider';
import { PaymentsService } from '../src/payments/payments.service';

const SRC = path.resolve(__dirname, '../src');
const PAYMENTS_DIR = path.join(SRC, 'payments');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      return entry === 'generated' ? [] : sourceFiles(full);
    }

    return full.endsWith('.ts') ? [full] : [];
  });
}

/**
 * The seam itself, asserted rather than assumed.
 *
 * The whole point of Step 22 is that nothing downstream knows which acquirer is
 * behind the interface. That property is invisible to every other test in the
 * suite — they would all pass just as happily if a controller imported the fake
 * directly — so it is checked here, structurally.
 */
describe('the payment seam', () => {
  it('is the abstraction that PaymentsService depends on, not an implementation', () => {
    // Nest resolves constructor parameters by their design:paramtypes metadata,
    // so this is the same list the injector reads — not a reading of the source.
    const injected = Reflect.getMetadata('design:paramtypes', PaymentsService) as unknown[];

    expect(injected).toContain(PaymentProvider);
  });

  it('is never reached around: no file outside src/payments names a provider', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => !file.startsWith(PAYMENTS_DIR))
      .filter((file) => {
        const source = readFileSync(file, 'utf8');

        return (
          source.includes('FakePaymentProvider') ||
          source.includes('fake-payment-provider') ||
          /\bliqpay\b|\bfondy\b|\bwayforpay\b/i.test(source)
        );
      })
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });

  it('keeps the concrete provider out of the service and the controllers', () => {
    for (const file of ['payments.service.ts', 'payments.controller.ts']) {
      const source = readFileSync(path.join(PAYMENTS_DIR, file), 'utf8');

      // Even inside the payments folder, only the module may name the class.
      expect(source).not.toContain('FakePaymentProvider');
    }
  });

  it('carries a real acquirer through end to end when reached only as the abstraction', async () => {
    // Typed as the abstract class on purpose: if this exercise passes, a LiqPay
    // or Fondy adapter can take the same route with no caller changing.
    const provider: PaymentProvider = new FakePaymentProvider();

    const session = await provider.chargeRecurring({
      orderRef: 'order-1',
      recurrenceRef: 'mandate-1',
      amount: { amount: '500.00', currency: 'UAH' },
      description: 'Gart PRO',
      callbackUrl: 'https://example.invalid/callback',
      metadata: { trainerId: 't' },
    });

    // A reference to reconcile against, and the mandate it charged.
    expect(session.providerRef.length).toBeGreaterThan(8);
    expect(session.recurrenceRef).toBe('mandate-1');
    expect(session.inlineCallback).not.toBeNull();

    // A signed callback that verifies and arrives in OUR vocabulary, not the
    // provider's: the caller never sees `success`, only SUCCEEDED.
    const parsed = await provider.parseCallback(session.inlineCallback!);

    expect(parsed).toMatchObject({
      orderRef: 'order-1',
      status: 'SUCCEEDED',
      rawStatus: 'success',
      amount: { amount: '500.00', currency: 'UAH' },
    });

    // And a reconciliation path for the callback that never arrives.
    await expect(provider.fetchStatus(session.providerRef)).resolves.toMatchObject({
      orderRef: 'order-1',
      status: 'SUCCEEDED',
    });
  });

  it('refuses a payload that did not come from the provider', async () => {
    const provider: PaymentProvider = new FakePaymentProvider();

    await expect(
      provider.parseCallback({ body: { data: 'x', signature: 'y' }, headers: {} }),
    ).rejects.toBeInstanceOf(InvalidCallbackError);
  });
});
