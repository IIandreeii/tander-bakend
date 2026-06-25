import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '../../generated/prisma/client';
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
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      where: { role: { not: Role.SUPER_MASTER } },
      select: { id: true, email: true, role: true, isEmailVerified: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
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
        defaultOrigin: true,
        defaultOriginLat: true,
        defaultOriginLng: true,
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
    defaultOrigin?: string;
    defaultOriginLat?: number;
    defaultOriginLng?: number;
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
      aliclikUserCreated: true,
      defaultOrigin: true,
      defaultOriginLat: true,
      defaultOriginLng: true,
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

    const { aliclikUserCreated: _, ...profile } = updated;
    return profile;
  }

  private isProfileComplete(user: {
    supportPhone: string | null;
    paymentPhone: string | null;
    paymentMethod: string | null;
    defaultOrigin: string | null;
  }): boolean {
    return !!(user.supportPhone && user.paymentPhone && user.paymentMethod && user.defaultOrigin);
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
}
