import { IsIn, IsOptional } from 'class-validator';
import type { ClientStatus } from '@gart/shared';

const CLIENT_STATUSES: readonly ClientStatus[] = ['INVITED', 'ACTIVE', 'ARCHIVED'];

export class ListClientsQuery {
  @IsOptional()
  @IsIn(CLIENT_STATUSES, { message: 'Некоректний статус' })
  status?: ClientStatus;
}
