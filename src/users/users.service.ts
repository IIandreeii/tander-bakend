import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '../../generated/prisma/client';
import { UbigeoMatcher } from '../aliclik/ubigeo-matcher';
import { AliclikClient } from '../aliclik/aliclik.client';
import { PrismaService } from '../prisma/prisma.service';

const ALICLIK_USER_DEFAULTS = {
  companyId: 62235,
  roleId: 1,
  roleName: 'ADMIN_STORE',
  countryPhoneId: 16,
  isOwnerStore: false,
  markerIcon: {},
  status: 'ACTIVE',
  password: 'TANDER2026$',
} as const;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly ubigeoMatcher: UbigeoMatcher,
    private readonly aliclikClient: AliclikClient,
  ) {}

  async findAll(params: { search?: string; page?: number; limit?: number } = {}) {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      role: { not: Role.SUPER_MASTER },
      ...(params.search ? {
        email: { contains: params.search, mode: 'insensitive' as const },
      } : {}),
    };

    const select = { id: true, email: true, role: true, isEmailVerified: true, createdAt: true };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select, orderBy: { createdAt: 'desc' }, skip, take: limit }),
      this.prisma.user.count({ where }),
    ]);

    return { users, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  create(data: Prisma.UserCreateInput) {
    return this.prisma.user.create({ data });
  }

  update(id: string, data: Prisma.UserUpdateInput) {
    return this.prisma.user.update({ where: { id }, data });
  }

  getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        paymentPhone: true,
        paymentMethod: true,
        bank: true,
        bankAccountNumber: true,
        bankHolderName: true,
        yapeHolderName: true,
        supportPhone: true,
        documentNumber: true,
        storeName: true,
        defaultOrigin: true,
        defaultOriginLat: true,
        defaultOriginLng: true,
        defaultOriginDepartment: true,
        defaultOriginProvince: true,
        defaultOriginDistrict: true,
        createdAt: true,
      },
    });
  }

  async updateProfile(userId: string, data: {
    paymentPhone?: string;
    paymentMethod?: string;
    bank?: string;
    bankAccountNumber?: string;
    bankHolderName?: string;
    yapeHolderName?: string;
    supportPhone?: string;
    documentNumber?: string;
    storeName?: string;
    defaultOrigin?: string;
    defaultOriginLat?: number;
    defaultOriginLng?: number;
    defaultOriginDepartment?: string;
    defaultOriginProvince?: string;
    defaultOriginDistrict?: string;
  }) {
    const profileSelect = {
      id: true,
      email: true,
      role: true,
      isEmailVerified: true,
      paymentPhone: true,
      paymentMethod: true,
      bank: true,
      bankAccountNumber: true,
      bankHolderName: true,
      yapeHolderName: true,
      supportPhone: true,
      documentNumber: true,
      storeName: true,
      aliclikUserCreated: true,
      aliclikWarehouseId: true,
      defaultOrigin: true,
      defaultOriginLat: true,
      defaultOriginLng: true,
      defaultOriginDepartment: true,
      defaultOriginProvince: true,
      defaultOriginDistrict: true,
      createdAt: true,
    } as const;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...data,
        defaultOriginLat: data.defaultOriginLat !== undefined ? new Prisma.Decimal(data.defaultOriginLat) : undefined,
        defaultOriginLng: data.defaultOriginLng !== undefined ? new Prisma.Decimal(data.defaultOriginLng) : undefined,
      },
      select: profileSelect,
    });

    if (!updated.aliclikUserCreated && this.isProfileComplete(updated)) {
      this.syncAliclikUser(updated).catch(() => {});
    }

    // Se dispara siempre que el perfil esté completo — syncAliclikWarehouse decide
    // internamente si crea (primera vez) o actualiza (ya existe aliclikWarehouseId),
    // así los cambios posteriores del perfil (dirección, banco, etc.) se propagan.
    if (this.isProfileComplete(updated)) {
      this.syncAliclikWarehouse(updated).catch(() => {});
    }

    const { aliclikUserCreated: _aliclikUserCreated, aliclikWarehouseId: _aliclikWarehouseId, ...profile } = updated;
    return profile;
  }

  private isProfileComplete(user: {
    supportPhone: string | null;
    paymentPhone: string | null;
    paymentMethod: string | null;
    defaultOrigin: string | null;
    defaultOriginDepartment: string | null;
    defaultOriginProvince: string | null;
    defaultOriginDistrict: string | null;
  }): boolean {
    return !!(
      user.supportPhone
      && user.paymentPhone
      && user.paymentMethod
      && user.defaultOrigin
      && user.defaultOriginDepartment
      && user.defaultOriginProvince
      && user.defaultOriginDistrict
    );
  }

  private async syncAliclikUser(user: { id: string; email: string; supportPhone: string | null }) {
    const baseUrl = this.configService.get<string>('ALICLIK_USER_API_URL')
      ?? 'https://aliclik-api-release-f6985904c9e2.herokuapp.com';

    const payload = {
      ...ALICLIK_USER_DEFAULTS,
      email: user.email,
      fullname: user.email,
      userMail: user.email,
      phone: user.supportPhone,
    };

    this.logger.log(`Creating Aliclik user for ${user.email}`);

    const originName = this.configService.getOrThrow<string>('ALICLIK_ORIGIN_HEADER_NAME');
    const originValue = this.configService.getOrThrow<string>('ALICLIK_ORIGIN_EXPECTED');

    const response = await fetch(`${baseUrl}/user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [originName]: originValue,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Aliclik user creation failed for ${user.email}: ${body}`);
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { aliclikUserCreated: true },
    });

    this.logger.log(`Aliclik user created for ${user.email}`);
  }

  private async syncAliclikWarehouse(user: {
    id: string;
    email: string;
    bank: string | null;
    bankAccountNumber: string | null;
    bankHolderName: string | null;
    supportPhone: string | null;
    storeName: string | null;
    aliclikWarehouseId?: string | null;
    defaultOrigin: string | null;
    defaultOriginLat: Prisma.Decimal | null;
    defaultOriginLng: Prisma.Decimal | null;
    defaultOriginDepartment: string | null;
    defaultOriginProvince: string | null;
    defaultOriginDistrict: string | null;
  }) {
    const matchedUbigeo = await this.ubigeoMatcher.matchUbigeo({
      department: user.defaultOriginDepartment,
      province: user.defaultOriginProvince,
      district: user.defaultOriginDistrict,
    });

    if (!matchedUbigeo.department || !matchedUbigeo.province || !matchedUbigeo.district) {
      this.logger.warn(
        `Aliclik warehouse sync skipped for ${user.email}: ubigeo from Google did not fully match Aliclik's table. `
        + `Google values -> department="${user.defaultOriginDepartment}", province="${user.defaultOriginProvince}", district="${user.defaultOriginDistrict}". `
        + `Matched so far -> department="${matchedUbigeo.department ?? '(none)'}", province="${matchedUbigeo.province ?? '(none)'}", district="${matchedUbigeo.district ?? '(none)'}"`,
      );
      return;
    }

    const payload = {
      companyId: ALICLIK_USER_DEFAULTS.companyId,
      name: user.storeName ? `TANDER-${user.storeName}` : `TANDER-${user.bankHolderName ?? user.email}`,
      // `isProfileComplete()` ya garantiza que estos campos no son null en runtime;
      // el `?? ''` es solo para conformar al tipo (TS no lo sabe desde acá).
      address: user.defaultOrigin ?? '',
      lat: String(user.defaultOriginLat),
      lng: String(user.defaultOriginLng),
      department: matchedUbigeo.department,
      province: matchedUbigeo.province,
      district: matchedUbigeo.district,
      phone: user.supportPhone ?? '',
      typeWarehouse: 'NORMAL' as const,
      codeBank: user.bank ?? undefined,
      nameBank: user.bank ?? undefined,
      accountNumber: user.bankAccountNumber ?? undefined,
      holderName: user.bankHolderName ?? undefined,
    };

    // Ya existe un almacén para este usuario (creado en un sync anterior) -> actualizar
    // en vez de crear uno nuevo, así una edición posterior del perfil (dirección, banco,
    // nombre de tienda) se propaga en vez de generar un duplicado en Aliclik.
    if (user.aliclikWarehouseId) {
      try {
        await this.aliclikClient.updateWarehouse(user.aliclikWarehouseId, payload);
        this.logger.log(`Aliclik warehouse updated for ${user.email} (id=${user.aliclikWarehouseId})`);
      } catch (error) {
        this.logger.error(`Aliclik warehouse update failed for ${user.email}: ${error?.message ?? error}`);
      }
      return;
    }

    let result: { id?: number | string };
    try {
      result = await this.aliclikClient.createWarehouse(payload);
    } catch (error) {
      this.logger.error(`Aliclik warehouse creation failed for ${user.email}: ${error?.message ?? error}`);
      return;
    }

    if (result?.id === undefined || result?.id === null) {
      this.logger.error(`Aliclik warehouse creation returned no id for ${user.email}`);
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { aliclikWarehouseId: String(result.id) },
    });

    this.logger.log(`Aliclik warehouse created for ${user.email}`);
  }
}
