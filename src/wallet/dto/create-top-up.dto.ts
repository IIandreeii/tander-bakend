import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class CreateTopUpDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'El monto debe ser un número' })
  @Min(100, { message: 'El monto mínimo de recarga es S/ 100' })
  amount!: number;
}
