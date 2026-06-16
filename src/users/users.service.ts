import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
        createdAt: true,
      },
    });
  }

  updateProfile(userId: string, data: { paymentPhone?: string; paymentMethod?: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        role: true,
        isEmailVerified: true,
        paymentPhone: true,
        paymentMethod: true,
        createdAt: true,
      },
    });
  }
}
