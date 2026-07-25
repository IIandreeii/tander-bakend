import { BadGatewayException, BadRequestException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { CobranaClient } from './cobrana.client';
import type { CobranaWebhookEvent, CreateCobranaChargeRequest } from './cobrana.types';

export interface CreateTopUpChargeParams {
  topUpId: string;
  amount: number;
  documentNumber: string;
  email: string;
}

export interface TopUpChargeResult {
  cobranaChargeId: string;
  code: string | null;
  paymentUrl: string | null;
}

@Injectable()
export class CobranaService {
  private readonly logger = new Logger(CobranaService.name);

  constructor(
    private readonly client: CobranaClient,
    private readonly configService: ConfigService,
  ) {}

  async createTopUpCharge(params: CreateTopUpChargeParams): Promise<TopUpChargeResult> {
    const gatewayMaxAmount = parseFloat(
      this.configService.get<string>('COBRANA_GATEWAY_MAX_AMOUNT') ?? '154.99',
    );
    const useGateway = params.amount < gatewayMaxAmount;

    const payload: CreateCobranaChargeRequest = useGateway
      ? {
          amount: params.amount,
          currency: 'PEN',
          concept: 'Recarga de saldo Tander',
          method: 'gateway',
          option: 'monnet',
          feeMode: 'merchant',
          customer: { documentNumber: params.documentNumber, email: params.email },
          externalRef: params.topUpId,
        }
      : {
          amount: params.amount,
          currency: 'PEN',
          concept: 'Recarga de saldo Tander',
          method: 'services',
          option: '360pay',
          feeMode: 'merchant',
          customer: { documentNumber: params.documentNumber, email: params.email },
          externalRef: params.topUpId,
        };

    this.logger.log(
      `Creating Cobrana charge for top-up ${params.topUpId}, amount: ${params.amount}, method: ${payload.method}/${payload.option}`,
    );

    let charge;
    try {
      charge = await this.client.createCharge(payload, params.topUpId);
    } catch (error) {
      this.logger.error(`Cobrana charge creation failed for top-up ${params.topUpId}`, error);
      throw new BadGatewayException('No se pudo iniciar el pago en Cobrana');
    }

    if (useGateway && !charge.paymentUrl) {
      throw new BadRequestException('Cobrana no devolvió un enlace de pago');
    }
    if (!useGateway && !charge.code) {
      throw new BadRequestException('Cobrana no devolvió un código de pago');
    }

    return {
      cobranaChargeId: charge.id,
      code: charge.code ?? null,
      paymentUrl: charge.paymentUrl ?? null,
    };
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): void {
    // Format: t=<unix>,v1=<hex>
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(',')) {
      const eqIdx = part.indexOf('=');
      if (eqIdx !== -1) {
        parts[part.slice(0, eqIdx)] = part.slice(eqIdx + 1);
      }
    }

    const t = parts['t'];
    const v1 = parts['v1'];

    if (!t || !v1) {
      throw new UnauthorizedException('Formato de firma inválido');
    }

    const timestamp = parseInt(t, 10);
    if (isNaN(timestamp)) {
      throw new UnauthorizedException('Timestamp de firma inválido');
    }

    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > 300) {
      throw new UnauthorizedException('Firma del webhook expirada');
    }

    const secret = this.configService.getOrThrow<string>('COBRANA_WEBHOOK_SECRET');
    const payload = `${t}.${rawBody.toString('utf8')}`;
    const expectedHex = createHmac('sha256', secret).update(payload).digest('hex');

    const expectedBuf = Buffer.from(expectedHex, 'hex');
    const receivedBuf = Buffer.from(v1, 'hex');

    if (expectedBuf.length !== receivedBuf.length || !timingSafeEqual(expectedBuf, receivedBuf)) {
      throw new UnauthorizedException('Firma del webhook inválida');
    }
  }

  parseWebhookEvent(rawBody: Buffer): CobranaWebhookEvent {
    try {
      return JSON.parse(rawBody.toString('utf8')) as CobranaWebhookEvent;
    } catch {
      throw new BadRequestException('Payload del webhook inválido');
    }
  }
}
