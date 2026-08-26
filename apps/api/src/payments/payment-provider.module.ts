import { Logger, Module, type Provider } from '@nestjs/common';

import { FakePaymentProvider } from './fake-payment-provider';
import { PaymentProvider } from './payment-provider';

/** Selects the binding. The one line a real acquirer replaces. */
export const PAYMENT_PROVIDER_ENV = 'PAYMENT_PROVIDER';

/** Deliberately explicit and deliberately awkward to set by accident. */
export const ALLOW_FAKE_PAYMENTS_ENV = 'ALLOW_FAKE_PAYMENTS';

export const FAKE_IN_PRODUCTION_MESSAGE =
  'Refusing to start: the fake payment provider grants real access without taking money. ' +
  `Set ${PAYMENT_PROVIDER_ENV} to a real provider, or ${ALLOW_FAKE_PAYMENTS_ENV}=true to override.`;

/**
 * The only environments where a fake acquirer is a sane default.
 *
 * Checked as an allow-list rather than by excluding 'production', which is the
 * distinction that matters: NODE_ENV unset, or set to 'prod' or 'staging',
 * would pass an exclusion test and get the fake silently. Fail closed — an
 * environment that has not said what it is does not get to hand out free
 * access, and can still say ALLOW_FAKE_PAYMENTS=true if it means it.
 */
export const FAKE_SAFE_ENVIRONMENTS = ['development', 'test'] as const;

export const UNKNOWN_PROVIDER_MESSAGE = 'Unknown payment provider';

/**
 * Builds the provider the environment asks for.
 *
 * Every other seam in this app is safe to fake by accident: a fake bucket loses
 * an upload, a fake queue drops a notification. A fake ACQUIRER hands out paid
 * access to anyone who asks and takes no money for it — the failure is silent,
 * it looks exactly like success, and it is discovered from the bank statement.
 * So the fake refuses to load in production rather than trusting deployment
 * discipline to keep it out.
 */
export function resolvePaymentProvider(env: NodeJS.ProcessEnv): PaymentProvider {
  const requested = env[PAYMENT_PROVIDER_ENV] ?? 'fake';

  if (requested !== 'fake') {
    // Nothing else exists yet. A typo must stop the boot rather than fall back
    // to the fake, which is the one outcome worse than not starting at all.
    throw new Error(`${UNKNOWN_PROVIDER_MESSAGE}: ${requested}`);
  }

  const environment = env.NODE_ENV ?? '';
  const safe = FAKE_SAFE_ENVIRONMENTS.some((known) => known === environment);

  if (!safe && env[ALLOW_FAKE_PAYMENTS_ENV] !== 'true') {
    throw new Error(FAKE_IN_PRODUCTION_MESSAGE);
  }

  // Loud on purpose. Even where the fake is legitimate, the one failure mode
  // worth never being subtle about is money that was never actually taken.
  new Logger('PaymentProvider').warn(
    'Payments are FAKE: charges confirm themselves and no money is taken.',
  );

  return new FakePaymentProvider();
}

const paymentProvider: Provider = {
  provide: PaymentProvider,
  useFactory: () => resolvePaymentProvider(process.env),
};

/**
 * The binding, in its own module so the seam is visible in the import graph:
 * anything that needs to take money imports this, and gets an abstraction.
 */
@Module({
  providers: [paymentProvider],
  exports: [PaymentProvider],
})
export class PaymentProviderModule {}
