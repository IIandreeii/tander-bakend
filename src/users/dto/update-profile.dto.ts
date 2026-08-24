import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  Matches,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

const DOCUMENT_TYPES = ['DNI', 'CE', 'PAS', 'RUC'] as const;

// documentNumber se valida según documentType: 8 dígitos exactos para DNI, 11 para RUC;
// CE y PAS solo se validan por longitud (Cobrana no exige un formato fijo para esos).
function IsValidDocumentNumber(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidDocumentNumber',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          const documentType = (args.object as { documentType?: string }).documentType ?? 'DNI';
          if (documentType === 'DNI') return /^\d{8}$/.test(value);
          if (documentType === 'RUC') return /^\d{11}$/.test(value);
          return value.length >= 6 && value.length <= 15;
        },
        defaultMessage(args: ValidationArguments) {
          const documentType = (args.object as { documentType?: string }).documentType ?? 'DNI';
          if (documentType === 'DNI') return 'documentNumber must be exactly 8 digits for DNI';
          if (documentType === 'RUC') return 'documentNumber must be exactly 11 digits for RUC';
          return 'documentNumber must be between 6 and 15 characters';
        },
      },
    });
  };
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  lastname?: string;

  @IsOptional()
  @IsIn(DOCUMENT_TYPES)
  documentType?: (typeof DOCUMENT_TYPES)[number];

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
  bankHolderName?: string;

  @IsOptional()
  @IsString()
  yapeHolderName?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.supportPhone !== '')
  @Matches(/^\d{9,15}$/, { message: 'supportPhone must be 9–15 digits' })
  supportPhone?: string;

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  defaultOrigin?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultOriginLat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  defaultOriginLng?: number;

  @IsOptional()
  @IsString()
  defaultOriginDepartment?: string;

  @IsOptional()
  @IsString()
  defaultOriginProvince?: string;

  @IsOptional()
  @IsString()
  defaultOriginDistrict?: string;

  @IsOptional()
  @IsString()
  @IsValidDocumentNumber()
  documentNumber?: string;
}
