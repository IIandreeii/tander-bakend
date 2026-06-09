import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { WalletTransactionType } from '../../../generated/prisma/client';

const AMOUNT_PATTERN = /^(?:0\.\d{1,2}|[1-9]\d*(?:\.\d{1,2})?)$/;

export class AdjustWalletDto {
  @IsEnum(WalletTransactionType)
  type!: WalletTransactionType;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(AMOUNT_PATTERN, {
    message: 'amount must be a positive decimal with up to 2 fractional digits',
  })
  amount!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
