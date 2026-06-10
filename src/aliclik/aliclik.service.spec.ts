import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AliclikClient } from './aliclik.client';
import { AliclikService } from './aliclik.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../../generated/prisma/client', () => ({
  PrismaClient: class PrismaClient {},
  Prisma: {
    Decimal: class Decimal {
      constructor(private readonly value: number | string) {}

      toString(): string {
        return String(this.value);
      }
    },
  },
}));

describe('AliclikService', () => {
  let service: AliclikService;

  const order = {
    id: 'order-1',
    userId: 'user-1',
    packageType: 'XS',
    status: 'PENDING',
    origin: 'Origin',
    destination: 'Destination',
    recipientFullName: 'Test Receiver',
    recipientPhone: '999999999',
    note: 'Internal note',
    weightGrams: 120,
    collectionAmount: { toNumber: () => 125 },
    destinationLat: { toString: () => '-12.04640' },
    destinationLng: { toString: () => '-77.04280' },
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    aliclikOrderNumber: null,
    aliclikSyncStatus: 'NOT_SYNCED',
    aliclikLastSyncAction: null,
    aliclikLastSyncAttemptAt: null,
    aliclikSyncedAt: null,
    aliclikLastSyncError: null,
    user: {
      id: 'user-1',
      email: 'user@example.com',
    },
  };

  const linkedOrder = {
    ...order,
    aliclikOrderNumber: 'TANDER-order-1',
  };

  const quote = {
    ubigeo: {
      department: { name: 'Lima' },
      province: { name: 'Lima' },
      district: { name: 'Miraflores' },
    },
    couriers: [
      {
        id: 1,
        addDays: 0,
        deliveryCost: 12,
        returnCost: 3,
        transportId: 10,
        transportName: 'Courier A',
        transportUrlImage: null,
        flagDeliveryExpress: true,
        schedule: '08:00-12:00',
        scheduleExpressStart: '08:00',
        scheduleExpressEnd: '12:00',
      },
    ],
  };

  const prisma = {
    order: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };

  const configService = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  const client = {
    quoteShipping: jest.fn(),
    createOrder: jest.fn(),
    updateOrder: jest.fn(),
    confirmOrder: jest.fn(),
    rescheduleOrder: jest.fn(),
    cancelOrder: jest.fn(),
    getOrderByNumber: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AliclikService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: AliclikClient, useValue: client },
      ],
    }).compile();

    service = module.get<AliclikService>(AliclikService);

    prisma.order.findFirst.mockResolvedValue(order);
    configService.getOrThrow.mockReturnValue('1');
    configService.get.mockReturnValue(undefined);
    client.quoteShipping.mockResolvedValue(quote);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fails clearly when Aliclik product identifiers are missing on create', async () => {
    prisma.order.findFirst.mockResolvedValueOnce(order);

    await expect(service.createOrder('user-1', 'order-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(client.quoteShipping).not.toHaveBeenCalled();
    expect(client.createOrder).not.toHaveBeenCalled();
  });

  it('fails clearly when Aliclik product identifiers are missing on update', async () => {
    prisma.order.findFirst.mockResolvedValueOnce(linkedOrder);

    await expect(service.updateOrder('user-1', 'order-1')).rejects.toBeInstanceOf(BadRequestException);

    expect(client.quoteShipping).not.toHaveBeenCalled();
    expect(client.updateOrder).not.toHaveBeenCalled();
  });
});
