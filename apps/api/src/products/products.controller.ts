import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { PublicProduct } from '@gart/shared';

import { type AuthContext, CurrentAuth } from '../auth/auth-context';
import { TrainerGuard } from '../auth/trainer.guard';
import { CreateProductDto, ProductListQuery, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@Controller('products')
@UseGuards(TrainerGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  /**
   * Unpaged, deliberately. Unlike the exercise library — global rows plus the
   * trainer's own, in the hundreds — a catalogue is authored by one person and
   * bounded by what they can meaningfully sell.
   */
  @Get()
  async list(
    @CurrentAuth() auth: AuthContext,
    @Query() query: ProductListQuery,
  ): Promise<PublicProduct[]> {
    return this.products.list(auth.trainer.id, query.status ?? 'all');
  }

  @Post()
  async create(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateProductDto,
  ): Promise<PublicProduct> {
    return this.products.create(auth.trainer.id, dto);
  }

  @Get(':id')
  async one(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<PublicProduct> {
    return this.products.one(auth.trainer.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<PublicProduct> {
    return this.products.update(auth.trainer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<void> {
    return this.products.remove(auth.trainer.id, id);
  }
}
