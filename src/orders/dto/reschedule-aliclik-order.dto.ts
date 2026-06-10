import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class RescheduleAliclikOrderDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'scheduleDate must have format YYYY-MM-DD',
  })
  scheduleDate!: string;
}
