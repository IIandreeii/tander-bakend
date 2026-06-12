import { Body, Controller, HttpCode, Logger, Post } from '@nestjs/common';
import { OrderStatus } from '../../generated/prisma/client';
import { OrdersService } from '../orders/orders.service';
import { PrismaService } from '../prisma/prisma.service';

interface AliclikWebhookPayload {
  orderNumber: string;
  dispatchStatus: string;
  status: string;
  callStatus: string;
  [key: string]: unknown;
}

function mapAliclikStatusToTander(payload: AliclikWebhookPayload): OrderStatus | null {
  const { status, dispatchStatus, callStatus } = payload;

  if (status === 'DELIVERED') {
    return OrderStatus.DELIVERED;
  }

  if (
    callStatus === 'ANNULLED' ||
    dispatchStatus === 'CANCEL' ||
    dispatchStatus === 'ANNULLED' ||
    dispatchStatus === 'REFUSED' ||
    dispatchStatus === 'TO_RETURN' ||
    dispatchStatus === 'RETURNED'
  ) {
    return OrderStatus.CANCELLED;
  }

  if (
    status === 'IN_TRANSIT' ||
    status === 'PENDING_DELIVERY' ||
    dispatchStatus === 'IN_TRANSIT' ||
    dispatchStatus === 'IN_AGENCY' ||
    dispatchStatus === 'PICKED'
  ) {
    return OrderStatus.SHIPPED;
  }

  if (
    dispatchStatus === 'TO_PREPARE' ||
    dispatchStatus === 'PREPARED' ||
    dispatchStatus === 'CONFIRMED'
  ) {
    return OrderStatus.PROCESSING;
  }

  return null;
}

@Controller('webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
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
}
