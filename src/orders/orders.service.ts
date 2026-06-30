import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as xlsx from 'xlsx';
import { Prisma, OrderStatus, WalletTransactionType } from '../../generated/prisma/client';
import { AliclikService } from '../aliclik/aliclik.service';
import { ALICLIK_SYNC_STATUS } from '../aliclik/aliclik.types';
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
  AdminOrdersPage,
  BulkCreateOrdersResponse,
  BulkOrderRowResult,
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
  paymentMethod?: string | null;
  paymentPhone?: string | null;
  bank?: string | null;
  bankAccountNumber?: string | null;
  bankHolderName?: string | null;
  yapeHolderName?: string | null;
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
  aliclikOrderNumber: string | null;
  aliclikSyncStatus: OrderSummary['aliclikSyncStatus'];
  aliclikLastSyncAction: OrderSummary['aliclikLastSyncAction'];
  aliclikLastSyncAttemptAt: Date | null;
  aliclikSyncedAt: Date | null;
  aliclikLastSyncError: string | null;
  aliclikWebhookStatus: string | null;
  aliclikWebhookDispatchStatus: string | null;
  aliclikWebhookCallStatus: string | null;
  labelGeneratedAt: Date | null;
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

function formatDecimal(value: Prisma.Decimal | null, digits: number): string | null {
  if (!value) {
    return null;
  }

  const numericValue = Number(value.toString());

  return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : null;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly aliclikService: AliclikService,
  ) {}

  private buildPaymentNote(user: { paymentPhone: string | null; paymentMethod: string | null; bank: string | null; bankAccountNumber: string | null } | null): string {
    const lines: string[] = [];
    if (user?.paymentMethod && user?.paymentPhone) {
      const label = user.paymentMethod === 'YAPE' ? 'Yape' : 'Plin';
      lines.push(`${label}: ${user.paymentPhone}`);
    }
    if (user?.bank && user?.bankAccountNumber) {
      lines.push(`${user.bank} Cta: ${user.bankAccountNumber}`);
    }
    if (lines.length === 0) return '';
    return '\n\nDatos de cobro:\n' + lines.map((l) => `• ${l}`).join('\n');
  }

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { paymentPhone: true, paymentMethod: true, bank: true, bankAccountNumber: true },
    });
    const paymentNote = this.buildPaymentNote(user);
    const finalNote = dto.note ? dto.note + paymentNote : (paymentNote || null);

    const created = await this.prisma.$transaction(async (tx) => {
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
          note: finalNote,
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

    this.logger.log(`Order ${created.id} created in DB — starting Aliclik sync`);

    try {
      await this.aliclikService.createOrder(userId, created.id);
      this.logger.log(`Order ${created.id} synced to Aliclik successfully`);
    } catch (error) {
      const response = typeof (error as { getResponse?: () => unknown }).getResponse === 'function'
        ? (error as { getResponse: () => unknown }).getResponse()
        : undefined;
      this.logger.error(
        `Order ${created.id} Aliclik sync failed`,
        JSON.stringify({ message: error instanceof Error ? error.message : String(error), response }, null, 2),
      );
    }

    return this.getMyOrder(userId, created.id);
  }

  async generateBulkTemplate(userId: string): Promise<Buffer> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { defaultOrigin: true, defaultOriginLat: true, defaultOriginLng: true },
    });

    const hasDefaultOrigin =
      user?.defaultOrigin && user.defaultOriginLat != null && user.defaultOriginLng != null;

    const exampleOrigin    = hasDefaultOrigin ? user!.defaultOrigin! : 'Av. Ejemplo 123, Lima';
    const exampleOriginLat = hasDefaultOrigin ? parseFloat(Number(user!.defaultOriginLat).toFixed(7)) : -12.046374;
    const exampleOriginLng = hasDefaultOrigin ? parseFloat(Number(user!.defaultOriginLng).toFixed(7)) : -77.042793;

    const wb = xlsx.utils.book_new();

    const headers = [
      'tipoPaquete', 'pesoGramos',
      'origen', 'origenLat', 'origenLng',
      'destino', 'destinoLat', 'destinoLng',
      'nombreDestinatario', 'telefonoDestinatario', 'montoACobrar', 'nota',
      'Ver origen en Maps', 'Ver destino en Maps',
    ];

    const exampleRow = [
      'XXS', 100,
      exampleOrigin, exampleOriginLat, exampleOriginLng,
      'Calle Destino 456, Miraflores', -12.1198930, -77.0298970,
      'Juan Pérez', '987654321', 50, 'Entregar en portería',
      { f: 'IF(AND(D2<>"",E2<>""),HYPERLINK("https://maps.google.com/?q="&D2&","&E2,"Ver en mapa"),"")' },
      { f: 'IF(AND(G2<>"",H2<>""),HYPERLINK("https://maps.google.com/?q="&G2&","&H2,"Ver en mapa"),"")' },
    ];

    const BLANK_ROWS = 20;
    const blankRows = Array.from({ length: BLANK_ROWS }, (_, i) => {
      const rowNum = i + 3;
      return [
        '', '',
        '', '', '',
        '', '', '',
        '', '', '', '',
        { f: `IF(AND(D${rowNum}<>"",E${rowNum}<>""),HYPERLINK("https://maps.google.com/?q="&D${rowNum}&","&E${rowNum},"Ver en mapa"),"")` },
        { f: `IF(AND(G${rowNum}<>"",H${rowNum}<>""),HYPERLINK("https://maps.google.com/?q="&G${rowNum}&","&H${rowNum},"Ver en mapa"),"")` },
      ];
    });

    const DATA_RANGE = `A2:A${2 + BLANK_ROWS}`;
    const WEIGHT_RANGE = `B2:B${2 + BLANK_ROWS}`;

    const ws = xlsx.utils.aoa_to_sheet([headers, exampleRow, ...blankRows]);
    ws['!cols'] = [
      { wch: 14 }, { wch: 12 },
      { wch: 32 }, { wch: 13 }, { wch: 13 },
      { wch: 32 }, { wch: 13 }, { wch: 13 },
      { wch: 24 }, { wch: 20 }, { wch: 14 }, { wch: 28 },
      { wch: 20 }, { wch: 22 },
    ];

    ws['!dataValidations'] = [
      {
        type: 'list',
        sqref: DATA_RANGE,
        formula1: '"XXS,XS,S,M"',
        showDropDown: false,
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Tipo de paquete inválido',
        error: 'Seleccioná uno de los tipos disponibles: XXS, XS, S o M',
        allowBlank: true,
      },
      {
        type: 'custom',
        sqref: WEIGHT_RANGE,
        formula1: 'AND(B2>=1,IF(A2="XXS",B2<=250,IF(A2="XS",B2<=500,IF(A2="S",B2<=2000,IF(A2="M",B2<=5000,FALSE)))))',
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Peso fuera de rango',
        error: 'XXS: máx 250 g  |  XS: máx 500 g  |  S: máx 2000 g  |  M: máx 5000 g',
        allowBlank: true,
      },
    ];

    xlsx.utils.book_append_sheet(wb, ws, 'Pedidos');

    const originNote = hasDefaultOrigin
      ? '✅ Tu origen por defecto ya está cargado en las filas.'
      : 'ℹ️  Completá tu origen en el perfil para que se pre-rellene automáticamente.';

    const instructions = [
      ['INSTRUCCIONES DE CARGA MASIVA — TANDER'],
      [''],
      [originNote],
      [''],
      ['CÓMO OBTENER COORDENADAS DESDE GOOGLE MAPS'],
      [''],
      ['1. Abrí maps.google.com en tu navegador'],
      ['2. Navegá hasta la ubicación exacta'],
      ['3. Hacé clic derecho sobre el punto exacto del mapa'],
      ['4. Las coordenadas aparecen arriba del menú contextual'],
      ['   Ejemplo: -12.046374, -77.042793'],
      ['5. El primer número es la LATITUD  (origenLat / destinoLat)'],
      ['6. El segundo número es la LONGITUD (origenLng / destinoLng)'],
      [''],
      ['CAMPOS OBLIGATORIOS'],
      ['tipoPaquete, pesoGramos, origen, origenLat, origenLng,'],
      ['destino, destinoLat, destinoLng, nombreDestinatario,'],
      ['telefonoDestinatario, montoACobrar'],
      [''],
      ['CAMPOS OPCIONALES'],
      ['nota (texto libre, los datos de cobro se agregan automáticamente)'],
      [''],
      ['TIPOS DE PAQUETE Y PESOS MÁXIMOS'],
      ['XXS  →  máx. 250 g'],
      ['XS   →  máx. 500 g'],
      ['S    →  máx. 2.000 g'],
      ['M    →  máx. 5.000 g'],
      [''],
      ['La columna tipoPaquete tiene un menú desplegable en el Excel.'],
      ['La columna pesoGramos valida automáticamente el rango según el tipo.'],
      [''],
      ['IMPORTANTE'],
      ['- Los valores negativos en lat/lng son correctos para Lima, Perú'],
      ['- Las columnas "Ver origen en Maps" y "Ver destino en Maps"'],
      ['  son de verificación — no las modifiques'],
      ['- Si montoACobrar es 0, el destinatario no paga nada'],
    ];

    const wsInstr = xlsx.utils.aoa_to_sheet(instructions);
    wsInstr['!cols'] = [{ wch: 65 }];
    xlsx.utils.book_append_sheet(wb, wsInstr, 'Instrucciones');

    const packageTable = [
      ['tipoPaquete', 'Peso máximo', 'Largo', 'Ancho', 'Alto'],
      ['XXS', '250 g',   '15 cm', '10 cm', '10 cm'],
      ['XS',  '500 g',   '15 cm', '20 cm', '12 cm'],
      ['S',   '2.000 g', '20 cm', '30 cm', '12 cm'],
      ['M',   '5.000 g', '24 cm', '30 cm', '20 cm'],
    ];

    const wsPkg = xlsx.utils.aoa_to_sheet(packageTable);
    wsPkg['!cols'] = [
      { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    ];
    xlsx.utils.book_append_sheet(wb, wsPkg, 'Tipos válidos');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  async bulkCreateOrders(userId: string, fileBuffer: Buffer): Promise<BulkCreateOrdersResponse> {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    const dataRows = rows.slice(1).filter((row) => {
      const r = row as unknown[];
      return r.some((cell) => cell !== '' && cell !== null && cell !== undefined);
    }) as unknown[][];

    const results: BulkOrderRowResult[] = [];
    let succeeded = 0;
    let failed = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = i + 2;
      const row = dataRows[i] as unknown[];

      const rawDto = {
        packageType: String(row[0] ?? '').trim().toUpperCase(),
        weightGrams: Number(row[1]),
        origin: String(row[2] ?? '').trim(),
        originLat: Number(row[3]),
        originLng: Number(row[4]),
        destination: String(row[5] ?? '').trim(),
        destinationLat: Number(row[6]),
        destinationLng: Number(row[7]),
        recipientFullName: String(row[8] ?? '').trim(),
        recipientPhone: String(row[9] ?? '').trim(),
        collectionAmount: row[10] !== '' && row[10] !== null && row[10] !== undefined ? Number(row[10]) : undefined,
        note: row[11] !== '' && row[11] !== null && row[11] !== undefined ? String(row[11]).trim() : undefined,
      };

      const dto = plainToInstance(CreateOrderDto, rawDto);
      const errors = await validate(dto);

      if (errors.length > 0) {
        const message = errors
          .map((e) => Object.values(e.constraints ?? {}).join(', '))
          .join('; ');
        results.push({ row: rowNumber, status: 'error', error: `Validación: ${message}` });
        failed++;
        continue;
      }

      try {
        const order = await this.createOrder(userId, dto);
        results.push({ row: rowNumber, status: 'success', orderId: order.id });
        succeeded++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ row: rowNumber, status: 'error', error: message });
        failed++;
      }
    }

    return { total: dataRows.length, succeeded, failed, results };
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

    if (order.aliclikOrderNumber) {
      this.logger.log(`Order ${orderId} updated in DB — starting Aliclik sync`);
      try {
        await this.aliclikService.updateOrder(userId, orderId);
        this.logger.log(`Order ${orderId} re-synced to Aliclik successfully`);
      } catch (error) {
        this.logger.error(
          `Order ${orderId} Aliclik re-sync failed`,
          JSON.stringify({ message: error instanceof Error ? error.message : String(error) }, null, 2),
        );
      }
    }

    return this.mapOrder(updated);
  }

  async deleteOrder(userId: string, orderId: string): Promise<void> {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('Order can only be deleted while pending');
    }

    await this.prisma.order.delete({ where: { id: orderId } });
  }

  async markLabelGenerated(userId: string, orderId: string, generated: boolean): Promise<void> {
    const order = await this.findOrderByIdAndUserIdOrThrow(userId, orderId);
    await this.prisma.order.update({
      where: { id: orderId },
      data: { labelGeneratedAt: generated ? new Date() : null },
    });

    if (generated && order.aliclikOrderNumber) {
      this.logger.log(`Order ${orderId} label generated — preparing in Aliclik`);
      try {
        await this.aliclikService.prepareOrder(userId, orderId);
        this.logger.log(`Order ${orderId} marked as prepared in Aliclik`);
      } catch (error) {
        this.logger.error(
          `Order ${orderId} Aliclik prepare failed`,
          JSON.stringify({ message: error instanceof Error ? error.message : String(error) }, null, 2),
        );
      }
    }
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

  async getOrdersWithAliclikErrors(): Promise<OrderSummary[]> {
    const orders = await this.prisma.order.findMany({
      where: { aliclikSyncStatus: 'ERROR' },
      orderBy: { aliclikLastSyncAttemptAt: 'desc' },
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

  async getAdminOrders(params: { search?: string; status?: string; page?: number; limit?: number }): Promise<AdminOrdersPage> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 25));
    const skip = (page - 1) * limit;

    const where = {
      ...(params.status ? { status: params.status as import('../../generated/prisma/client').OrderStatus } : {}),
      ...(params.search ? {
        OR: [
          { recipientFullName: { contains: params.search, mode: 'insensitive' as const } },
          { recipientPhone: { contains: params.search, mode: 'insensitive' as const } },
          { origin: { contains: params.search, mode: 'insensitive' as const } },
          { destination: { contains: params.search, mode: 'insensitive' as const } },
          { id: { contains: params.search, mode: 'insensitive' as const } },
        ],
      } : {}),
    };

    const include = {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          paymentMethod: true,
          paymentPhone: true,
          bank: true,
          bankAccountNumber: true,
          bankHolderName: true,
          yapeHolderName: true,
        },
      },
    };

    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({ where, include, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((order) => this.mapOrder(order)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAdminOrder(orderId: string): Promise<OrderSummary> {
    const order = await this.findOrderByIdOrThrow(orderId);

    return this.mapOrder(order);
  }

  async getAdminOrderHistory(orderId: string): Promise<OrderHistoryResponse> {
    const order = await this.findOrderByIdOrThrow(orderId);
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
      originLat: formatDecimal(order.originLat, 7),
      originLng: formatDecimal(order.originLng, 7),
      destination: order.destination,
      destinationLat: formatDecimal(order.destinationLat, 7),
      destinationLng: formatDecimal(order.destinationLng, 7),
      recipientFullName: order.recipientFullName,
      recipientPhone: order.recipientPhone,
      note: order.note,
      weightGrams: order.weightGrams,
      collectionAmount: formatDecimal(order.collectionAmount, 2),
      aliclikOrderNumber: order.aliclikOrderNumber ?? null,
      aliclikSyncStatus: order.aliclikSyncStatus ?? ALICLIK_SYNC_STATUS.NOT_SYNCED,
      aliclikLastSyncAction: order.aliclikLastSyncAction ?? null,
      aliclikLastSyncAttemptAt: order.aliclikLastSyncAttemptAt ?? null,
      aliclikSyncedAt: order.aliclikSyncedAt ?? null,
      aliclikLastSyncError: order.aliclikLastSyncError ?? null,
      aliclikWebhookStatus: order.aliclikWebhookStatus ?? null,
      aliclikWebhookDispatchStatus: order.aliclikWebhookDispatchStatus ?? null,
      aliclikWebhookCallStatus: order.aliclikWebhookCallStatus ?? null,
      labelGeneratedAt: order.labelGeneratedAt ?? null,
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
