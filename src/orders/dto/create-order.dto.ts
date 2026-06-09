import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { OrderPackageType } from '../../../generated/prisma/client';

const trimText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOptionalText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
};

export class CreateOrderDto {
  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  origin!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  destination!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  recipientFullName!: string;

  @Transform(trimText)
  @IsString()
  @IsNotEmpty()
  recipientPhone!: string;

  @Transform(trimOptionalText)
  @IsOptional()
  @IsString()
  note?: string;

  @IsEnum(OrderPackageType)
  packageType!: OrderPackageType;
}
