import { IsString } from 'class-validator';

export class AliclikWebhookPayloadDto {
  @IsString()
  orderNumber!: string;

  @IsString()
  dispatchStatus!: string;

  @IsString()
  status!: string;

  @IsString()
  callStatus!: string;
}
