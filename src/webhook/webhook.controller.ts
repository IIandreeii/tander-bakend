import { Body, Controller, Headers, HttpCode, Logger, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { OrderStatus } from '../../generated/prisma/client';
import { CobranaService } from '../cobrana/cobrana.service';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';

interface AliclikWebhookPayload {
  orderNumber: string;
  dispatchStatus: string;
  status: string;
  callStatus: string;
  [key: string]: unknown;
}

function mapAliclikStatusToTander(payload: AliclikWebhookPayload): OrderStatus | null {
  const { status, dispatchStatus, callStatus } = payload;

  // dispatchStatus LEFT_IN_WAREHOUSE → devuelto (terminal)
  if (dispatchStatus === 'LEFT_IN_WAREHOUSE') {
    return OrderStatus.RETURNED;
  }

  // status DELIVERED → entregado (terminal)
  if (status === 'DELIVERED') {
    return OrderStatus.DELIVERED;
  }

  // status ANNULLED o callStatus ANNULLED → cancelado
  if (status === 'ANNULLED' || callStatus === 'ANNULLED') {
    return OrderStatus.CANCELLED;
  }

  // status terminal → en devolución
  if (['REFUSED', 'NOT_RESPOND', 'CANCEL', 'TRAVEL', 'OUT_OF_COVER', 'OUT_OF_STOCK', 'NOT_DISPATCH', 'NOT_COST'].includes(status)) {
    return OrderStatus.RETURNING;
  }

  // dispatchStatus TO_RETURN, RETURNED, REMAINING_IN_TRANSIT, STORE_CENTRAL → en devolución
  if (['TO_RETURN', 'RETURNED', 'REMAINING_IN_TRANSIT', 'STORE_CENTRAL'].includes(dispatchStatus)) {
    return OrderStatus.RETURNING;
  }

  // dispatchStatus AVAILABLE → en ruta
  if (dispatchStatus === 'AVAILABLE') {
    return OrderStatus.IN_TRANSIT;
  }

  // dispatchStatus PICKED, IN_TRANSIT, IN_AGENCY → recolectado
  if (['PICKED', 'IN_TRANSIT', 'IN_AGENCY'].includes(dispatchStatus)) {
    return OrderStatus.PICKED;
  }

  // dispatchStatus TO_PREPARE, PREPARED → pendiente
  if (['TO_PREPARE', 'PREPARED'].includes(dispatchStatus)) {
    return OrderStatus.PENDING;
  }

  return null;
}

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly cobranaService: CobranaService,
    private readonly walletService: WalletService,
  ) {}

  @Post('order-status')
  @HttpCode(200)
  async handleOrderStatus(@Body() body: AliclikWebhookPayload) {
    this.logger.log(`Aliclik webhook received — ${JSON.stringify(body)}`);

    const { orderNumber, status, dispatchStatus, callStatus } = body;

    if (typeof orderNumber !== 'string' || !orderNumber) {
      this.logger.warn('Webhook payload missing orderNumber — ignoring');
      return { received: true };
    }

    this.logger.log(
      `orderNumber: ${orderNumber}, status: ${status}, dispatchStatus: ${dispatchStatus}, callStatus: ${callStatus}`,
    );

    const tenderStatus = mapAliclikStatusToTander(body);

    if (!tenderStatus) {
      this.logger.log(`No status mapping for orderNumber: ${orderNumber} — ignoring`);
      return { received: true };
    }

    this.logger.log(`Mapped to Tander status: ${tenderStatus} for orderNumber: ${orderNumber}`);

    const order = await this.prisma.order.findUnique({
      where: { aliclikOrderNumber: orderNumber },
      select: { id: true, userId: true },
    });

    if (!order) {
      this.logger.warn(`No Tander order found for aliclikOrderNumber: ${orderNumber}`);
      return { received: true };
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        aliclikWebhookStatus: body.status as string,
        aliclikWebhookDispatchStatus: body.dispatchStatus as string,
        aliclikWebhookCallStatus: body.callStatus as string,
      },
    });

    this.logger.log(`Updating order ${order.id} to status ${tenderStatus}`);
    await this.ordersService.updateOrderStatus(order.id, { status: tenderStatus }, order.userId);
    this.logger.log(`Order ${order.id} status updated successfully to ${tenderStatus}`);

    return { received: true };
  }

  @Post('cobrana')
  @HttpCode(200)
  async handleCobrana(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-cobrana-signature') signature: string,
  ) {
    const rawBody = req.rawBody ?? Buffer.from('');

    this.logger.log(`Cobrana webhook received — signature: ${signature}`);

    try {
      this.cobranaService.verifyWebhookSignature(rawBody, signature ?? '');
    } catch (error) {
      this.logger.warn(`Cobrana webhook signature verification failed: ${error instanceof Error ? error.message : String(error)}`);
      return { received: false };
    }

    const event = this.cobranaService.parseWebhookEvent(rawBody);

    this.logger.log(`Cobrana event ${event.id} type: ${event.type}`);

    if (event.type !== 'charge.paid') {
      return { received: true };
    }

    const charge = event.data.object;

    if (!charge.externalRef) {
      this.logger.warn(`Cobrana charge.paid event ${event.id} has no externalRef — ignoring`);
      return { received: true };
    }

    try {
      await this.walletService.handleChargePaid({
        cobranaChargeId: charge.id,
        externalRef: charge.externalRef,
        eventId: event.id,
        paidAt: charge.paidAt,
      });
      this.logger.log(`Cobrana event ${event.id} processed — top-up ${charge.externalRef} credited`);
    } catch (error) {
      this.logger.error(`Cobrana event ${event.id} processing failed`, error instanceof Error ? error.message : String(error));
    }

    return { received: true };
  }
}
