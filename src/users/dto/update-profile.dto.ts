import { IsIn, IsNumber, IsOptional, IsString, ValidateIf, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.paymentPhone !== '')
  @Matches(/^\d{9,15}$/, { message: 'paymentPhone must be 9–15 digits' })
  paymentPhone?: string;

  @IsOptional()
  @IsIn(['YAPE', 'PLIN'])
  paymentMethod?: string;

  @IsOptional()
  @IsIn(['BCP'])
  bank?: string;

  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.supportPhone !== '')
  @Matches(/^\d{9,15}$/, { message: 'supportPhone must be 9–15 digits' })
  supportPhone?: string;

  @IsOptional()
  @IsString()
  defaultOrigin?: string;

  @IsOptional()
  @ValidateIf((o) => o.defaultOriginLat !== undefined && o.defaultOriginLat !== null)
  @IsNumber()
  defaultOriginLat?: number;

  @IsOptional()
  @ValidateIf((o) => o.defaultOriginLng !== undefined && o.defaultOriginLng !== null)
  @IsNumber()
  defaultOriginLng?: number;
}
