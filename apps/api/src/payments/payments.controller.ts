import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicPayment } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { callbackThrottle } from '../auth/throttle.config';
import { InvalidCallbackError } from './payment-provider';
import { PaymentsService } from './payments.service';

@Controller('billing/payments')
@UseGuards(TrainerGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /** What this trainer has been charged for their own subscription. */
  @Get()
  async mine(@CurrentAuth() auth: AuthContext): Promise<PublicPayment[]> {
    return this.payments.forTrainer(auth.trainer.id);
  }
}

/**
 * Where a provider reports what happened. Deliberately unauthenticated: an
 * acquirer's servers hold no session and never will. The signature is the
 * credential, and PaymentProvider verifies it — this controller never sees one.
 *
 * The budget is its own and generous. A webhook throttled into dropping
 * deliveries is a payment that silently never settles, which is a far worse
 * failure than the flood the limit exists to stop.
 */
@Controller('payments/callback')
export class PaymentCallbackController {
  constructor(private readonly payments: PaymentsService) {}

  @Post(':provider')
  @Throttle(callbackThrottle())
  @HttpCode(HttpStatus.NO_CONTENT)
  async receive(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    try {
      await this.payments.applyCallback({ body, headers }, provider);
    } catch (error: unknown) {
      if (error instanceof InvalidCallbackError) {
        // Nothing about WHY. A caller probing signatures learns only that this
        // one was refused, which is all a legitimate provider needs too.
        throw new BadRequestException();
      }

      throw error;
    }
  }
}
