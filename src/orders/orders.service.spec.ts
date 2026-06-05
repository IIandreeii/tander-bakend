import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
jest.mock('../../generated/prisma/client', () => {
  class Decimal {
    constructor(private readonly value: number | string) {}

    toString(): string {
      return String(this.value);
    }

    toNumber(): number {
      return Number(this.value);
    }

    lte(other: number | string): boolean {
      return Number(this.value) <= Number(other);
    }

    div(other: Decimal): Decimal {
      return new Decimal(Number(this.value) / Number(other.toString()));
    }

    minus(other: Decimal): Decimal {
      return new Decimal(Number(this.value) - Number(other.toString()));
    }
  }

  return {
    Prisma: {
      Decimal,
    },
    PrismaClient: class PrismaClient {},
    OrderPackageType: {
      XXS: 'XXS',
      XS: 'XS',
      S: 'S',
      M: 'M',
    },
    OrderStatus: {
      PENDING: 'PENDING',
      PROCESSING: 'PROCESSING',
      SHIPPED: 'SHIPPED',
      DELIVERED: 'DELIVERED',
      CANCELLED: 'CANCELLED',
    },
    Role: {
      MASTER: 'MASTER',
      SUPER_MASTER: 'SUPER_MASTER',
    },
    WalletTransactionType: {
      CREDIT: 'CREDIT',
      DEBIT: 'DEBIT',
    },
  };
});

import { Prisma, OrderPackageType, OrderStatus, Role, WalletTransactionType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  let service: OrdersService;

  const tx = {
    $queryRaw: jest.fn(),
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    order: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    orderStatusHistory: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
    },
  };

  const prismaService = {
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    order: tx.order,
    wallet: tx.wallet,
    orderStatusHistory: tx.orderStatusHistory,
    walletTransaction: tx.walletTransaction,
  } as unknown as PrismaService;

  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'ORDER_CREATION_CREDIT_ESTIMATE') {
        return '10';
      }

      if (key === 'ORDER_DELIVERED_WALLET_CHARGE') {
        return '13.5';
      }

      return undefined;
    }),
  } as unknown as ConfigService;

  const walletBalance = new Prisma.Decimal('20');

  const baseOrder = {
    id: 'order-1',
    userId: 'user-1',
    packageType: OrderPackageType.XS,
    status: OrderStatus.PENDING,
    origin: 'A',
    destination: 'B',
    recipientFullName: 'Test Receiver',
    recipientPhone: '+5491111111111',
    createdAt: new Date('2026-06-05T00:00:00.000Z'),
    updatedAt: new Date('2026-06-05T00:00:00.000Z'),
    deliveredChargeTransactionId: null,
    user: {
      id: 'user-1',
      email: 'user@example.com',
      role: Role.MASTER,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: PrismaService, useValue: prismaService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('blocks order creation when the user has no available capacity', async () => {
    tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', userId: 'user-1', balance: walletBalance });
    tx.order.count.mockResolvedValue(2);

    await expect(
      service.createOrder('user-1', {
        origin: 'Origin',
        destination: 'Destination',
        recipientFullName: 'Recipient',
        recipientPhone: '123456789',
        packageType: OrderPackageType.XS,
      }),
    ).rejects.toThrow('Not enough order creation capacity');
  });

  it('applies the delivered charge only once', async () => {
    const pendingOrder = {
      ...baseOrder,
      status: OrderStatus.SHIPPED,
      deliveredChargeTransaction: null,
    };
    const deliveredOrder = {
      ...baseOrder,
      status: OrderStatus.DELIVERED,
      deliveredChargeTransaction: {
        id: 'txn-1',
      },
    };

    tx.$queryRaw.mockResolvedValue(undefined);
    tx.wallet.findUnique.mockResolvedValue({ id: 'wallet-1', userId: 'user-1', balance: walletBalance });
    tx.order.findUnique
      .mockResolvedValueOnce(pendingOrder)
      .mockResolvedValueOnce(deliveredOrder)
      .mockResolvedValueOnce(deliveredOrder);
    tx.order.update.mockResolvedValue(deliveredOrder);
    tx.orderStatusHistory.create.mockResolvedValue(undefined);
    tx.wallet.update.mockResolvedValue(undefined);
    tx.walletTransaction.create.mockResolvedValue({ id: 'txn-1' });

    const firstResult = await service.updateOrderStatus(
      'order-1',
      { status: OrderStatus.DELIVERED },
      'admin-1',
    );

    const secondResult = await service.updateOrderStatus(
      'order-1',
      { status: OrderStatus.DELIVERED },
      'admin-1',
    );

    expect(firstResult.status).toBe(OrderStatus.DELIVERED);
    expect(secondResult.status).toBe(OrderStatus.DELIVERED);
    expect(firstResult.deliveredChargeTransactionId).toBe('txn-1');
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw.mock.calls[1][0]).toEqual([
      'SELECT "id" FROM "wallets" WHERE "userId" = ',
      ' FOR UPDATE',
    ]);
    expect(tx.$queryRaw.mock.calls[1][1]).toBe('user-1');
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          actorUserId: 'admin-1',
          type: WalletTransactionType.DEBIT,
        }),
      }),
    );
  });
});
