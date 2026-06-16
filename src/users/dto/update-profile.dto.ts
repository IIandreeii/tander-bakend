import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{9,15}$/, { message: 'paymentPhone must be 9–15 digits' })
  paymentPhone?: string;

  @IsOptional()
  @IsIn(['YAPE', 'PLIN'])
  paymentMethod?: string;
}
