import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, OrderStatus, WalletTransactionType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import {
  ORDER_ACTIVE_STATUSES,
  ORDER_CREATION_CREDIT_ESTIMATE_DEFAULT,
  ORDER_DELIVERED_CHARGE_REASON,
  ORDER_DELIVERED_WALLET_CHARGE_DEFAULT,
  ORDER_PACKAGE_PRESETS,
  ORDER_STATUS_TRANSITIONS,
  ORDER_TERMINAL_STATUSES,
} from './orders.constants';
import type {
  OrderCreationCapacityResponse,
  OrderHistoryResponse,
  OrderPackageConfigResponse,
  OrderStatusHistoryItem,
  OrderSummary,
} from './orders.types';

interface WalletSnapshot {
  id: string;
  userId: string;
  balance: Prisma.Decimal;
}

interface OrderUserRecord {
  id: string;
  email: string;
  role: OrderSummary['user']['role'];
}

interface OrderRecord {
  id: string;
  userId: string;
  packageType: OrderSummary['packageType'];
  status: OrderSummary['status'];
  origin: string;
  destination: string;
  recipientFullName: string;
  recipientPhone: string;
  note: string | null;
  weightGrams: number;
  collectionAmount: Prisma.Decimal | null;
  originLat: Prisma.Decimal | null;
  originLng: Prisma.Decimal | null;
  destinationLat: Prisma.Decimal | null;
  destinationLng: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
  deliveredChargeTransaction?: {
    id: string;
  } | null;
  user: OrderUserRecord;
}

interface OrderHistoryRecord {
  id: string;
  status: OrderSummary['status'];
  createdAt: Date;
  changedByUser: OrderUserRecord;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderSummary> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "wallets" WHERE "userId" = ${userId} FOR UPDATE`;

      const wallet = await this.findWalletByUserIdOrThrow(tx, userId);
      const activeOrders = await tx.order.count({
        where: {
          userId,
          status: {
            in: [...ORDER_ACTIVE_STATUSES],
          },
        },
      });

      const capacity = this.calculateCreationCapacity(wallet.balance, activeOrders);

      if (!capacity.canCreate) {
        throw new BadRequestException('Not enough order creation capacity');
      }

      const order = await tx.order.create({
        data: {
          userId,
          packageType: dto.packageType,
          origin: dto.origin,
          destination: dto.destination,
          recipientFullName: dto.recipientFullName,
          recipientPhone: dto.recipientPhone,
          weightGrams: dto.weightGrams,
          note: dto.note ?? null,
          collectionAmount: dto.collectionAmount != null ? new Prisma.Decimal(dto.collectionAmount) : null,
          originLat: dto.originLat != null ? new Prisma.Decimal(dto.originLat) : null,
          originLng: dto.originLng != null ? new Prisma.Decimal(dto.originLng) : null,
          destinationLat: dto.destinationLat != null ? new Prisma.Decimal(dto.destinationLat) : null,
          destinationLng: dto.destinationLng != null ? new Prisma.Decimal(dto.destinationLng) : null,
          status: OrderStatus.PENDING,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          changedByUserId: userId,
        },
      });

      return this.mapOrder(order);
    });
  }

  async updateOrder(userId: string, orderId: string, dto: UpdateOrderDto): Promise<OrderSummary> {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order can only be edited while pending');
    }

    const data: Prisma.OrderUpdateInput = {};

    if (dto.origin !== undefined) data.origin = dto.origin;
    if (dto.destination !== undefined) data.destination = dto.destination;
    if (dto.recipientFullName !== undefined) data.recipientFullName = dto.recipientFullName;
    if (dto.recipientPhone !== undefined) data.recipientPhone = dto.recipientPhone;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.packageType !== undefined) data.packageType = dto.packageType;
    if (dto.weightGrams !== undefined) data.weightGrams = dto.weightGrams;
    if (dto.collectionAmount !== undefined) data.collectionAmount = new Prisma.Decimal(dto.collectionAmount);
    if (dto.originLat !== undefined) data.originLat = new Prisma.Decimal(dto.originLat);
    if (dto.originLng !== undefined) data.originLng = new Prisma.Decimal(dto.originLng);
    if (dto.destinationLat !== undefined) data.destinationLat = new Prisma.Decimal(dto.destinationLat);
    if (dto.destinationLng !== undefined) data.destinationLng = new Prisma.Decimal(dto.destinationLng);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return this.mapOrder(updated);
  }

  async deleteOrder(userId: string, orderId: string): Promise<void> {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order can only be deleted while pending');
    }

    await this.prisma.order.delete({ where: { id: orderId } });
  }

  async getMyOrders(userId: string): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return orders.map((order) => this.mapOrder(order));
  }

  async getMyOrder(userId: string, orderId: string): Promise<OrderSummary> {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);

    return this.mapOrder(order);
  }

  async getMyOrderHistory(userId: string, orderId: string): Promise<OrderHistoryResponse> {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    const history = await this.prisma.orderStatusHistory.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        changedByUser: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return {
      order: this.mapOrder(order),
      history: history.map((item) => this.mapHistoryItem(item)),
    };
  }

  async getMyCreationCapacity(userId: string): Promise<OrderCreationCapacityResponse> {
    const wallet = await this.findWalletByUserIdOrThrow(this.prisma, userId);
    const activeOrders = await this.prisma.order.count({
      where: {
        userId,
        status: {
          in: [...ORDER_ACTIVE_STATUSES],
        },
      },
    });

    return this.calculateCreationCapacity(wallet.balance, activeOrders);
  }

  getPackageConfig(): OrderPackageConfigResponse {
    return {
      creationCreditEstimate: this.getCreationCreditEstimate().toString(),
      deliveredWalletCharge: this.getDeliveredWalletCharge().toString(),
      packages: ORDER_PACKAGE_PRESETS.map((preset) => ({
        ...preset,
        dimensions: { ...preset.dimensions },
      })),
    };
  }

  async getAdminOrders(): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return orders.map((order) => this.mapOrder(order));
  }

  async getAdminOrder(orderId: string): Promise<OrderSummary> {
    const order = await this.findOrderByIdOrThrow(orderId);

    return this.mapOrder(order);
  }

  async updateOrderStatus(
    orderId: string,
    dto: UpdateOrderStatusDto,
    actorUserId: string,
  ): Promise<OrderSummary> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "orders" WHERE "id" = ${orderId} FOR UPDATE`;

      const order = await this.findOrderByIdOrThrowInTransaction(tx, orderId);

      if (order.status === dto.status) {
        return this.mapOrder(order);
      }

      if (ORDER_TERMINAL_STATUSES.includes(order.status)) {
        throw new ConflictException('Order status can no longer be changed');
      }

      const allowedStatuses = ORDER_STATUS_TRANSITIONS[order.status];

      if (!allowedStatuses.includes(dto.status)) {
        throw new BadRequestException('Invalid order status transition');
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: { status: dto.status },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: dto.status,
          changedByUserId: actorUserId,
        },
      });

      if (dto.status === OrderStatus.DELIVERED && !order.deliveredChargeTransaction) {
        await tx.$queryRaw`SELECT "id" FROM "wallets" WHERE "userId" = ${order.userId} FOR UPDATE`;

        const wallet = await this.findWalletByUserIdOrThrow(tx, order.userId);
        const deliveredCharge = this.getDeliveredWalletCharge();
        const balanceAfter = wallet.balance.minus(deliveredCharge);

        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: balanceAfter },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            actorUserId,
            orderId,
            type: WalletTransactionType.DEBIT,
            amount: deliveredCharge,
            reason: ORDER_DELIVERED_CHARGE_REASON,
            balanceAfter,
          },
        });

        const chargedOrder = await this.findOrderByIdOrThrowInTransaction(tx, orderId);

        return this.mapOrder(chargedOrder);
      }

      return this.mapOrder(updatedOrder);
    }).catch((error: unknown) => {
      if (this.isUniqueOrderChargeConflict(error)) {
        return this.getAdminOrder(orderId);
      }

      throw error;
    });
  }

  private calculateCreationCapacity(
    balance: Prisma.Decimal,
    activeOrders: number,
  ): OrderCreationCapacityResponse {
    const creationEstimate = this.getCreationCreditEstimate();

    if (balance.lte(0)) {
      return {
        walletBalance: balance.toString(),
        creationCreditEstimate: creationEstimate.toString(),
        maxActiveOrders: 0,
        activeOrders,
        availableOrders: 0,
        canCreate: false,
      };
    }

    const maxActiveOrders = Math.floor(balance.div(creationEstimate).toNumber());
    const availableOrders = Math.max(0, maxActiveOrders - activeOrders);

    return {
      walletBalance: balance.toString(),
      creationCreditEstimate: creationEstimate.toString(),
      maxActiveOrders,
      activeOrders,
      availableOrders,
      canCreate: availableOrders > 0,
    };
  }

  private async findWalletByUserIdOrThrow(
    tx: Pick<PrismaService, 'wallet'>,
    userId: string,
  ): Promise<WalletSnapshot> {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        balance: true,
      },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  private async findOrderByIdAndUserIdOrThrow(userId: string, orderId: string): Promise<OrderRecord> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async findOrderByIdOrThrow(orderId: string): Promise<OrderRecord> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        deliveredChargeTransaction: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private async findOrderByIdOrThrowInTransaction(
    tx: Pick<PrismaService, 'order'>,
    orderId: string,
  ): Promise<OrderRecord> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        deliveredChargeTransaction: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  private mapOrder(order: OrderRecord): OrderSummary {
    return {
      id: order.id,
      userId: order.userId,
      user: order.user,
      packageType: order.packageType,
      status: order.status,
      origin: order.origin,
      originLat: order.originLat?.toFixed(7) ?? null,
      originLng: order.originLng?.toFixed(7) ?? null,
      destination: order.destination,
      destinationLat: order.destinationLat?.toFixed(7) ?? null,
      destinationLng: order.destinationLng?.toFixed(7) ?? null,
      recipientFullName: order.recipientFullName,
      recipientPhone: order.recipientPhone,
      note: order.note,
      weightGrams: order.weightGrams,
      collectionAmount: order.collectionAmount?.toFixed(2) ?? null,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      deliveredChargeTransactionId: order.deliveredChargeTransaction?.id ?? null,
    };
  }

  private mapHistoryItem(historyItem: OrderHistoryRecord): OrderStatusHistoryItem {
    return {
      id: historyItem.id,
      status: historyItem.status,
      createdAt: historyItem.createdAt,
      changedBy: historyItem.changedByUser,
    };
  }

  private getCreationCreditEstimate(): Prisma.Decimal {
    return new Prisma.Decimal(
      this.configService.get<string>('ORDER_CREATION_CREDIT_ESTIMATE') ??
        ORDER_CREATION_CREDIT_ESTIMATE_DEFAULT,
    );
  }

  private getDeliveredWalletCharge(): Prisma.Decimal {
    return new Prisma.Decimal(
      this.configService.get<string>('ORDER_DELIVERED_WALLET_CHARGE') ??
        ORDER_DELIVERED_WALLET_CHARGE_DEFAULT,
    );
  }

  private isUniqueOrderChargeConflict(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const maybeKnownError = error as { code?: string; meta?: { target?: string[] } };

    return maybeKnownError.code === 'P2002' && maybeKnownError.meta?.target?.includes('orderId') === true;
  }
}
