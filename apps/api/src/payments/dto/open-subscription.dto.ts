import { IsIn } from 'class-validator';
import {
  SUBSCRIPTION_PERIODS,
  SUBSCRIPTION_PLANS,
  type SubscriptionPeriod,
  type SubscriptionPlan,
} from '@gart/shared';

/**
 * What the trainer is buying.
 *
 * Deliberately no amount: the price is derived server-side from the plan and
 * the cadence, and a client that could name a figure could name any figure.
 *
 * The plan is validated against every plan that EXISTS here, not only the ones
 * that can be bought. Whether GROW is on sale is a product decision, and it
 * belongs with the rest of that decision in the plan registry, where the
 * refusal can say «цей тариф ще недоступний» instead of «invalid value».
 */
export class OpenSubscriptionDto {
  @IsIn([...SUBSCRIPTION_PLANS], { message: 'Невідомий тариф' })
  plan!: SubscriptionPlan;

  @IsIn([...SUBSCRIPTION_PERIODS], { message: 'Невідома періодичність' })
  period!: SubscriptionPeriod;
}

/** A cadence change, applied at the next renewal. */
export class ChangePeriodDto {
  @IsIn([...SUBSCRIPTION_PERIODS], { message: 'Невідома періодичність' })
  period!: SubscriptionPeriod;
}
