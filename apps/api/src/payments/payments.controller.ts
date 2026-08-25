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
import type { CheckoutResult, PublicEntitlement, PublicPayment } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { type ClientAuthContext, CurrentClientAuth } from '../auth/client-auth-context';
import { ClientGuard } from '../auth/client.guard';
import { TrainerGuard } from '../auth/trainer.guard';
import { callbackThrottle } from '../auth/throttle.config';
import { CreateCheckoutDto } from './dto/payment.dto';
import { InvalidCallbackError } from './payment-provider';
import { PaymentsService } from './payments.service';

@Controller('clients/:clientId/payments')
@UseGuards(TrainerGuard)
export class ClientPaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  async forClient(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
  ): Promise<PublicPayment[]> {
    return this.payments.forClient(auth.trainer.id, clientId);
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Param('clientId') clientId: string,
    @Body() dto: CreateCheckoutDto,
  ): Promise<CheckoutResult> {
    return this.payments.createCheckout(auth.trainer.id, clientId, dto.productId);
  }
}

@Controller('payments')
@UseGuards(TrainerGuard)
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get(':id')
  async one(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<PublicPayment> {
    return this.payments.oneForTrainer(auth.trainer.id, id);
  }
}

@Controller('me/entitlements')
@UseGuards(ClientGuard)
export class MeEntitlementsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  async mine(@CurrentClientAuth() auth: ClientAuthContext): Promise<PublicEntitlement[]> {
    return this.payments.entitlementsForClient(auth.trainer.id, auth.client.id, new Date());
  }
}

/**
 * Where a provider reports what happened. Deliberately unauthenticated: an
 * acquirer's servers hold no session and never will. The signature is the
 * credential, and PaymentProvider verifies it — this controller never sees one.
 *
 * The budget is its own and generous. A webhook throttled into dropping
 * deliveries is a payment that silently never grants access, which is a far
 * worse failure than the flood the limit exists to stop.
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
