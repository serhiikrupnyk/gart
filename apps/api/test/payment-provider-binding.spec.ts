import {
  ALLOW_FAKE_PAYMENTS_ENV,
  FAKE_IN_PRODUCTION_MESSAGE,
  PAYMENT_PROVIDER_ENV,
  resolvePaymentProvider,
  UNKNOWN_PROVIDER_MESSAGE,
} from '../src/payments/payment-provider.module';
import { FakePaymentProvider } from '../src/payments/fake-payment-provider';

/**
 * The boot guard. Every other seam in this app is safe to fake by accident; a
 * fake acquirer hands out paid access and takes no money, and does it silently.
 * These assertions exist so that guard cannot regress unnoticed.
 */
describe('payment provider binding', () => {
  it('binds the fake outside production', () => {
    const provider = resolvePaymentProvider({ NODE_ENV: 'development' });

    expect(provider).toBeInstanceOf(FakePaymentProvider);
    expect(provider.id).toBe('fake');
  });

  it('binds the fake under test, which is how this very suite runs', () => {
    expect(resolvePaymentProvider({ NODE_ENV: 'test' })).toBeInstanceOf(FakePaymentProvider);
  });

  it('REFUSES TO START when production would get the fake', () => {
    expect(() => resolvePaymentProvider({ NODE_ENV: 'production' })).toThrow(
      FAKE_IN_PRODUCTION_MESSAGE,
    );
  });

  it('fails CLOSED on an environment that never said what it is', () => {
    // The failure this exists for: a host that runs the built entrypoint
    // without NODE_ENV set, or sets it to something almost right. An
    // exclusion test against 'production' would wave all of these through.
    for (const environment of [undefined, '', 'prod', 'staging', 'PRODUCTION', 'developmnt']) {
      expect(() =>
        resolvePaymentProvider(environment === undefined ? {} : { NODE_ENV: environment }),
      ).toThrow(FAKE_IN_PRODUCTION_MESSAGE);
    }
  });

  it('refuses production even when the provider is named explicitly', () => {
    expect(() =>
      resolvePaymentProvider({ NODE_ENV: 'production', [PAYMENT_PROVIDER_ENV]: 'fake' }),
    ).toThrow(FAKE_IN_PRODUCTION_MESSAGE);
  });

  it('allows the fake in production only when told to, deliberately', () => {
    const provider = resolvePaymentProvider({
      NODE_ENV: 'production',
      [ALLOW_FAKE_PAYMENTS_ENV]: 'true',
    });

    expect(provider).toBeInstanceOf(FakePaymentProvider);
  });

  it('treats any value other than exactly "true" as no permission', () => {
    for (const value of ['1', 'yes', 'TRUE', 'true ', '']) {
      expect(() =>
        resolvePaymentProvider({ NODE_ENV: 'production', [ALLOW_FAKE_PAYMENTS_ENV]: value }),
      ).toThrow(FAKE_IN_PRODUCTION_MESSAGE);
    }
  });

  it('stops rather than falling back when asked for a provider that does not exist', () => {
    // The failure mode worth designing out: a typo in the provider name must
    // not quietly leave the fake taking payments.
    expect(() =>
      resolvePaymentProvider({ NODE_ENV: 'production', [PAYMENT_PROVIDER_ENV]: 'liqpay' }),
    ).toThrow(`${UNKNOWN_PROVIDER_MESSAGE}: liqpay`);

    expect(() =>
      resolvePaymentProvider({ NODE_ENV: 'development', [PAYMENT_PROVIDER_ENV]: 'lqipay' }),
    ).toThrow(`${UNKNOWN_PROVIDER_MESSAGE}: lqipay`);
  });
});
