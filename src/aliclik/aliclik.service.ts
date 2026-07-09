import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AliclikClient } from './aliclik.client';
import {
  ALICLIK_SYNC_ACTION,
  ALICLIK_SYNC_STATUS,
  type AliclikOrderRecord,
  type AliclikOrderSyncResult,
  type AliclikOrderSyncState,
  type AliclikSelectedCourier,
  type AliclikShippingQuoteResponse,
} from './aliclik.types';
import {
  buildAliclikOrderNumber,
  buildOrderPayload,
  buildQuoteRequest,
  selectCourierOption,
} from './aliclik.mapper';

interface AliclikOrderPayloadResult {
  order: AliclikOrderRecord;
  orderNumber: string;
  payload: ReturnType<typeof buildOrderPayload>;
  selectedCourier: AliclikSelectedCourier;
  quote: AliclikShippingQuoteResponse;
}

@Injectable()
export class AliclikService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly client: AliclikClient,
  ) {}

  async getSyncState(userId: string, orderId: string) {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    const externalOrder = await this.fetchLinkedExternalOrder(order);

    return {
      ...this.mapSyncState(order),
      externalOrder,
    };
  }

  async quoteShipping(userId: string, orderId: string) {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    this.assertOrderHasDestinationCoordinates(order);
    const warehouseId = this.getDefaultWarehouseId();
    const quote = await this.client.quoteShipping(buildQuoteRequest(order, warehouseId));
    const selectedCourier = selectCourierOption(quote);

    return {
      orderId: order.id,
      warehouseId,
      quote,
      selectedCourier,
    };
  }

  async createOrder(userId: string, orderId: string) {
    const payload = await this.resolveOrderPayload(userId, orderId, true);

    try {
      const externalOrder = await this.client.createOrder(payload.payload);
      const aliclikOrderNumber = this.extractOrderNumber(externalOrder) ?? payload.orderNumber;

      await this.persistSyncSuccess(payload.order.id, ALICLIK_SYNC_ACTION.CREATE, aliclikOrderNumber);

      return this.buildSyncResult(
        'Aliclik order created successfully',
        payload.order.id,
        ALICLIK_SYNC_ACTION.CREATE,
        aliclikOrderNumber,
        externalOrder,
      );
    } catch (error) {
      await this.persistSyncFailure(payload.order.id, ALICLIK_SYNC_ACTION.CREATE, error);
      throw error;
    }
  }

  async updateOrder(userId: string, orderId: string) {
    const payload = await this.resolveOrderPayload(userId, orderId, false);

    try {
      const externalOrder = await this.client.updateOrder(payload.payload);
      const aliclikOrderNumber = this.extractOrderNumber(externalOrder) ?? payload.orderNumber;

      await this.persistSyncSuccess(payload.order.id, ALICLIK_SYNC_ACTION.UPDATE, aliclikOrderNumber);

      return this.buildSyncResult(
        'Aliclik order updated successfully',
        payload.order.id,
        ALICLIK_SYNC_ACTION.UPDATE,
        aliclikOrderNumber,
        externalOrder,
      );
    } catch (error) {
      await this.persistSyncFailure(payload.order.id, ALICLIK_SYNC_ACTION.UPDATE, error);
      throw error;
    }
  }

  async confirmOrder(userId: string, orderId: string) {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    const aliclikOrderNumber = this.requireLinkedOrderNumber(order);

    try {
      const externalOrder = await this.client.confirmOrder(aliclikOrderNumber);

      await this.persistSyncSuccess(order.id, ALICLIK_SYNC_ACTION.CONFIRM, aliclikOrderNumber);

      return this.buildSyncResult(
        'Aliclik order confirmed successfully',
        order.id,
        ALICLIK_SYNC_ACTION.CONFIRM,
        aliclikOrderNumber,
        externalOrder,
      );
    } catch (error) {
      await this.persistSyncFailure(order.id, ALICLIK_SYNC_ACTION.CONFIRM, error);
      throw error;
    }
  }

  async prepareOrder(userId: string, orderId: string) {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    const aliclikOrderNumber = this.requireLinkedOrderNumber(order);

    try {
      const externalOrder = await this.client.prepareOrder(aliclikOrderNumber);

      await this.persistSyncSuccess(order.id, ALICLIK_SYNC_ACTION.UPDATE, aliclikOrderNumber);

      return this.buildSyncResult(
        'Aliclik order prepared successfully',
        order.id,
        ALICLIK_SYNC_ACTION.UPDATE,
        aliclikOrderNumber,
        externalOrder,
      );
    } catch (error) {
      await this.persistSyncFailure(order.id, ALICLIK_SYNC_ACTION.UPDATE, error);
      throw error;
    }
  }

  async rescheduleOrder(userId: string, orderId: string, scheduleDate: string) {
    if (!scheduleDate) {
      throw new BadRequestException('scheduleDate is required');
    }

    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    const aliclikOrderNumber = this.requireLinkedOrderNumber(order);

    try {
      const externalOrder = await this.client.rescheduleOrder(aliclikOrderNumber, scheduleDate);

      await this.persistSyncSuccess(order.id, ALICLIK_SYNC_ACTION.RESCHEDULE, aliclikOrderNumber);

      return this.buildSyncResult(
        'Aliclik order rescheduled successfully',
        order.id,
        ALICLIK_SYNC_ACTION.RESCHEDULE,
        aliclikOrderNumber,
        externalOrder,
      );
    } catch (error) {
      await this.persistSyncFailure(order.id, ALICLIK_SYNC_ACTION.RESCHEDULE, error);
      throw error;
    }
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    const aliclikOrderNumber = this.requireLinkedOrderNumber(order);

    try {
      const externalOrder = await this.client.cancelOrder(aliclikOrderNumber);

      await this.persistSyncSuccess(order.id, ALICLIK_SYNC_ACTION.CANCEL, aliclikOrderNumber);

      return this.buildSyncResult(
        'Aliclik order cancelled successfully',
        order.id,
        ALICLIK_SYNC_ACTION.CANCEL,
        aliclikOrderNumber,
        externalOrder,
      );
    } catch (error) {
      await this.persistSyncFailure(order.id, ALICLIK_SYNC_ACTION.CANCEL, error);
      throw error;
    }
  }

  async getOrderByNumber(userId: string, orderId: string, orderNumber: string) {
    await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    return this.client.getOrderByNumber(orderNumber);
  }

  async getEvidencesAndPayments(userId: string, orderId: string) {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    const aliclikOrderNumber = this.requireLinkedOrderNumber(order);

    const response = await this.client.getEvidencesAndPayments(aliclikOrderNumber);

    await this.prisma.$transaction([
      ...response.evidences.map((e) =>
        this.prisma.aliclikOrderEvidence.upsert({
          where: { orderId_remoteId: { orderId: order.id, remoteId: e.id } },
          create: {
            orderId: order.id,
            remoteId: e.id,
            deliveryStatus: e.deliveryStatus,
            subStatus: e.subStatus,
            comment: e.comment,
            evidenceDelivery: e.evidenceDelivery,
            evidenceSupport: e.evidenceSupport,
            evidenceCall: e.evidenceCall,
            evidenceChat: e.evidenceChat,
            evidenceCallChat: e.evidenceCallChat,
            method: e.method,
            deliveryDate: e.deliveryDate ? new Date(e.deliveryDate) : null,
            remoteCreatedAt: e.createdAt ? new Date(e.createdAt) : null,
          },
          update: {
            deliveryStatus: e.deliveryStatus,
            subStatus: e.subStatus,
            comment: e.comment,
            evidenceDelivery: e.evidenceDelivery,
            evidenceSupport: e.evidenceSupport,
            evidenceCall: e.evidenceCall,
            evidenceChat: e.evidenceChat,
            evidenceCallChat: e.evidenceCallChat,
            method: e.method,
            deliveryDate: e.deliveryDate ? new Date(e.deliveryDate) : null,
          },
        }),
      ),
      ...response.payments.map((p) =>
        this.prisma.aliclikOrderPayment.upsert({
          where: { orderId_remoteId: { orderId: order.id, remoteId: p.id } },
          create: {
            orderId: order.id,
            remoteId: p.id,
            amount: p.amount,
            paymentMethod: p.paymentMethod,
            entity: p.entity,
            paymentDate: p.paymentDate ? new Date(p.paymentDate) : null,
            paymentDocument: p.paymentDocument,
            status: p.status,
            orderDeliveryRemoteId: p.orderDeliveryId,
            remoteCreatedAt: p.createdAt ? new Date(p.createdAt) : null,
          },
          update: {
            amount: p.amount,
            paymentMethod: p.paymentMethod,
            entity: p.entity,
            paymentDate: p.paymentDate ? new Date(p.paymentDate) : null,
            paymentDocument: p.paymentDocument,
            status: p.status,
            orderDeliveryRemoteId: p.orderDeliveryId,
          },
        }),
      ),
    ]);

    return response;
  }

  async retryOrderSync(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, userId: true, aliclikOrderNumber: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.aliclikOrderNumber) {
      return this.updateOrder(order.userId, orderId);
    }

    return this.createOrder(order.userId, orderId);
  }

  private async resolveOrderPayload(
    userId: string,
    orderId: string,
    isCreate: boolean,
  ): Promise<AliclikOrderPayloadResult> {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    this.assertOrderHasDestinationCoordinates(order);
    const linkedOrderNumber = order.aliclikOrderNumber;

    if (isCreate && linkedOrderNumber) {
      throw new ConflictException('Order is already linked to Aliclik');
    }

    if (!isCreate && !linkedOrderNumber) {
      throw new BadRequestException('Order is not linked to Aliclik');
    }

    const productIdentifiers = this.getProductIdentifiers();
    const warehouseId = this.getDefaultWarehouseId();
    const transportId = this.getDefaultTransportId();
    const quote = await this.client.quoteShipping(buildQuoteRequest(order, warehouseId));
    const selectedCourier = selectCourierOption(quote, transportId);
    const orderNumber = linkedOrderNumber ?? buildAliclikOrderNumber();
    const payload = buildOrderPayload({
      order,
      orderNumber,
      selectedCourier,
      productSku: productIdentifiers.sku,
      productEan: productIdentifiers.ean,
    });

    return {
      order,
      orderNumber,
      payload,
      selectedCourier,
      quote,
    };
  }

  private async findOrderByIdAndUserIdOrThrow(userId: string, orderId: string): Promise<AliclikOrderRecord> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: {
        id: true,
        userId: true,
        packageType: true,
        status: true,
        origin: true,
        destination: true,
        recipientFullName: true,
        recipientPhone: true,
        note: true,
        weightGrams: true,
        collectionAmount: true,
        originLat: true,
        originLng: true,
        destinationLat: true,
        destinationLng: true,
        createdAt: true,
        updatedAt: true,
        aliclikOrderNumber: true,
        aliclikSyncStatus: true,
        aliclikLastSyncAction: true,
        aliclikLastSyncAttemptAt: true,
        aliclikSyncedAt: true,
        aliclikLastSyncError: true,
        user: {
          select: {
            id: true,
            email: true,
            supportPhone: true,
            yapeHolderName: true,
            bankHolderName: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async persistSyncSuccess(
    orderId: string,
    action: typeof ALICLIK_SYNC_ACTION[keyof typeof ALICLIK_SYNC_ACTION],
    aliclikOrderNumber: string,
  ): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        aliclikOrderNumber,
        aliclikSyncStatus: ALICLIK_SYNC_STATUS.SYNCED,
        aliclikLastSyncAction: action,
        aliclikLastSyncAttemptAt: new Date(),
        aliclikSyncedAt: new Date(),
        aliclikLastSyncError: null,
      },
    });
  }

  private async persistSyncFailure(
    orderId: string,
    action: typeof ALICLIK_SYNC_ACTION[keyof typeof ALICLIK_SYNC_ACTION],
    error: unknown,
  ): Promise<void> {
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        aliclikSyncStatus: ALICLIK_SYNC_STATUS.ERROR,
        aliclikLastSyncAction: action,
        aliclikLastSyncAttemptAt: new Date(),
        aliclikLastSyncError: this.formatError(error),
      },
    });
  }

  private async fetchLinkedExternalOrder(order: AliclikOrderRecord): Promise<unknown> {
    if (!order.aliclikOrderNumber) {
      return null;
    }

    try {
      return await this.client.getOrderByNumber(order.aliclikOrderNumber);
    } catch {
      return null;
    }
  }

  private mapSyncState(order: AliclikOrderRecord): AliclikOrderSyncState {
    return {
      orderId: order.id,
      aliclikOrderNumber: order.aliclikOrderNumber,
      aliclikSyncStatus: order.aliclikSyncStatus,
      aliclikLastSyncAction: order.aliclikLastSyncAction,
      aliclikLastSyncAttemptAt: order.aliclikLastSyncAttemptAt,
      aliclikSyncedAt: order.aliclikSyncedAt,
      aliclikLastSyncError: order.aliclikLastSyncError,
    };
  }

  private buildSyncResult(
    message: string,
    orderId: string,
    action: typeof ALICLIK_SYNC_ACTION[keyof typeof ALICLIK_SYNC_ACTION],
    aliclikOrderNumber: string,
    externalOrder: unknown,
  ): AliclikOrderSyncResult {
    return {
      message,
      orderId,
      aliclikOrderNumber,
      aliclikSyncStatus: ALICLIK_SYNC_STATUS.SYNCED,
      aliclikLastSyncAction: action,
      aliclikLastSyncAttemptAt: new Date(),
      aliclikSyncedAt: new Date(),
      aliclikLastSyncError: null,
      externalOrder,
    };
  }

  private requireLinkedOrderNumber(order: AliclikOrderRecord): string {
    if (!order.aliclikOrderNumber) {
      throw new BadRequestException('Order is not linked to Aliclik');
    }

    return order.aliclikOrderNumber;
  }

  private assertOrderHasDestinationCoordinates(order: AliclikOrderRecord): void {
    if (order.destinationLat === null || order.destinationLng === null) {
      throw new BadRequestException('Order is missing destination coordinates');
    }
  }

  private extractOrderNumber(externalOrder: unknown): string | null {
    if (typeof externalOrder !== 'object' || externalOrder === null) {
      return null;
    }

    const maybeOrder = externalOrder as { orderNumber?: unknown };

    return typeof maybeOrder.orderNumber === 'string' && maybeOrder.orderNumber.length > 0
      ? maybeOrder.orderNumber
      : null;
  }

  private formatError(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown Aliclik error';
    }
  }

  private getDefaultWarehouseId(): number {
    const warehouseId = Number(this.configService.getOrThrow<string>('ALICLIK_DEFAULT_WAREHOUSE_ID'));

    if (!Number.isInteger(warehouseId) || warehouseId <= 0) {
      throw new BadRequestException('ALICLIK_DEFAULT_WAREHOUSE_ID must be a positive integer');
    }

    return warehouseId;
  }

  private getDefaultTransportId(): number | undefined {
    const raw = this.configService.get<string>('ALICLIK_TRANSPORT_ID');

    if (!raw) return undefined;

    const transportId = Number(raw);

    if (!Number.isInteger(transportId) || transportId <= 0) {
      throw new BadRequestException('ALICLIK_TRANSPORT_ID must be a positive integer');
    }

    return transportId;
  }

  private getProductIdentifiers(): { sku?: string; ean?: string } {
    const sku = this.configService.get<string>('ALICLIK_PRODUCT_SKU');
    const ean = this.configService.get<string>('ALICLIK_PRODUCT_EAN');

    if (!sku && !ean) {
      throw new BadRequestException('ALICLIK_PRODUCT_SKU or ALICLIK_PRODUCT_EAN must be configured for Aliclik create/update flows');
    }

    return { sku: sku ?? undefined, ean: ean ?? undefined };
  }
}
