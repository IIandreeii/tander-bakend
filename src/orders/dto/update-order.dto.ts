import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderPackageType } from '../../../generated/prisma/client';

const trimText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOptionalText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
};

export class UpdateOrderDto {
  @IsOptional()
  @Transform(trimText)
  @IsString()
  origin?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  destination?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  recipientFullName?: string;

  @IsOptional()
  @Transform(trimText)
  @IsString()
  recipientPhone?: string;

  @IsOptional()
  @Transform(trimOptionalText)
  @IsString()
  note?: string;

  @IsOptional()
  @IsEnum(OrderPackageType)
  packageType?: OrderPackageType;

  @IsOptional()
  @IsNumber()
  @Min(-12.60)
  @Max(-11.55)
  @Type(() => Number)
  originLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-77.50)
  @Max(-76.55)
  @Type(() => Number)
  originLng?: number;

  @IsOptional()
  @IsNumber()
  @Min(-12.60)
  @Max(-11.55)
  @Type(() => Number)
  destinationLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-77.50)
  @Max(-76.55)
  @Type(() => Number)
  destinationLng?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  weightGrams?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  collectionAmount?: number;

  @IsOptional()
  @IsBoolean()
  recaudo?: boolean;
}
