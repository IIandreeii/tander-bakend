import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { OrderPackageType } from '../../../generated/prisma/client';

const trimText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

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

  @IsEnum(OrderPackageType)
  packageType!: OrderPackageType;
}
