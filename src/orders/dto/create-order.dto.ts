import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { OrderPackageType } from '../../../generated/prisma/client';

const trimText = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimOptionalText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
};

const PACKAGE_TYPES = Object.values(OrderPackageType).join(', ');

export class CreateOrderDto {
  @Transform(trimText)
  @IsString({ message: 'El origen debe ser texto' })
  @IsNotEmpty({ message: 'El origen es obligatorio' })
  origin!: string;

  @Transform(trimText)
  @IsString({ message: 'El destino debe ser texto' })
  @IsNotEmpty({ message: 'El destino es obligatorio' })
  destination!: string;

  @Transform(trimText)
  @IsString({ message: 'El nombre del destinatario debe ser texto' })
  @IsNotEmpty({ message: 'El nombre del destinatario es obligatorio' })
  recipientFullName!: string;

  @Transform(trimText)
  @IsString({ message: 'El teléfono del destinatario debe ser texto' })
  @IsNotEmpty({ message: 'El teléfono del destinatario es obligatorio' })
  recipientPhone!: string;

  @Transform(trimOptionalText)
  @IsOptional()
  @IsString({ message: 'La nota debe ser texto' })
  note?: string;

  @IsEnum(OrderPackageType, { message: `El tipo de paquete debe ser uno de: ${PACKAGE_TYPES}` })
  packageType!: OrderPackageType;

  @IsNumber({}, { message: 'La latitud de origen debe ser un número' })
  @Min(-12.60, { message: 'La latitud de origen está fuera del rango permitido (Lima)' })
  @Max(-11.55, { message: 'La latitud de origen está fuera del rango permitido (Lima)' })
  @Type(() => Number)
  originLat!: number;

  @IsNumber({}, { message: 'La longitud de origen debe ser un número' })
  @Min(-77.50, { message: 'La longitud de origen está fuera del rango permitido (Lima)' })
  @Max(-76.55, { message: 'La longitud de origen está fuera del rango permitido (Lima)' })
  @Type(() => Number)
  originLng!: number;

  @IsNumber({}, { message: 'La latitud de destino debe ser un número' })
  @Min(-12.60, { message: 'La latitud de destino está fuera del rango permitido (Lima)' })
  @Max(-11.55, { message: 'La latitud de destino está fuera del rango permitido (Lima)' })
  @Type(() => Number)
  destinationLat!: number;

  @IsNumber({}, { message: 'La longitud de destino debe ser un número' })
  @Min(-77.50, { message: 'La longitud de destino está fuera del rango permitido (Lima)' })
  @Max(-76.55, { message: 'La longitud de destino está fuera del rango permitido (Lima)' })
  @Type(() => Number)
  destinationLng!: number;

  @Type(() => Number)
  @IsNumber({}, { message: 'El peso debe ser un número' })
  @Min(1, { message: 'El peso mínimo es 1 gramo' })
  weightGrams!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'El monto a cobrar debe ser un número' })
  @Min(0, { message: 'El monto a cobrar no puede ser negativo' })
  collectionAmount?: number;

  @IsOptional()
  @IsBoolean({ message: 'El recaudo debe ser verdadero o falso' })
  recaudo?: boolean;
}
