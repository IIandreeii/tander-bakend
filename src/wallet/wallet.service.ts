import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, WalletTopUpStatus, WalletTransactionType } from '../../generated/prisma/client';
import { CobranaService } from '../cobrana/cobrana.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import { CreateTopUpDto } from './dto/create-top-up.dto';
import type {
  InitiateTopUpResponse,
  TopUpSummary,
  WalletAdjustmentResponse,
  WalletHistoryResponse,
  WalletSummary,
  WalletTransactionHistoryItem,
} from './wallet.types';

@Injectable()
export class WalletService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cobranaService: CobranaService,
  ) {}

  async getMyWallet(userId: string): Promise<WalletSummary> {
    return this.getWalletByUserId(userId);
  }

  async getWalletByUserId(userId: string): Promise<WalletSummary> {
    const wallet = await this.findWalletByUserIdOrThrow(userId);

    return this.mapWallet(wallet);
  }

  async getMyTransactions(userId: string): Promise<WalletHistoryResponse> {
    return this.getTransactionsByUserId(userId);
  }

  async getTransactionsByUserId(userId: string): Promise<WalletHistoryResponse> {
    const wallet = await this.findWalletByUserIdOrThrow(userId);
    const transactions = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      include: {
        actorUser: {
          select: {
            id: true,
            email: true,
            role: true,
          },
        },
        wallet: {
          select: {
            id: true,
            userId: true,
            user: {
              select: {
                id: true,
                email: true,
                role: true,
              },
            },
          },
        },
      },
    });

    return {
      wallet: this.mapWallet(wallet),
      transactions: transactions.map((transaction) => this.mapTransaction(transaction)),
    };
  }

  async adjustWallet(
    targetUserId: string,
    dto: AdjustWalletDto,
    actorUserId: string,
  ): Promise<WalletAdjustmentResponse> {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: targetUserId },
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

      if (!wallet) {
        throw new NotFoundException('Wallet not found');
      }

      const amount = new Prisma.Decimal(dto.amount);
      const resultingBalance =
        dto.type === WalletTransactionType.CREDIT
          ? wallet.balance.plus(amount)
          : wallet.balance.minus(amount);

      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: resultingBalance },
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

      const transaction = await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          actorUserId,
          type: dto.type,
          amount,
          reason: dto.reason,
          balanceAfter: resultingBalance,
        },
        include: {
          actorUser: {
            select: {
              id: true,
              email: true,
              role: true,
            },
          },
          wallet: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  role: true,
                },
              },
            },
          },
        },
      });

      return {
        wallet: this.mapWallet(updatedWallet),
        transaction: this.mapTransaction(transaction),
      };
    });
  }

  async initiateTopUp(userId: string, dto: CreateTopUpDto): Promise<InitiateTopUpResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, documentNumber: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!user.documentNumber) {
      throw new BadRequestException('Debés configurar tu número de documento (DNI/RUC) en el perfil antes de recargar');
    }

    const wallet = await this.findWalletByUserIdOrThrow(userId);

    const topUp = await this.prisma.walletTopUp.create({
      data: {
        walletId: wallet.id,
        userId,
        amount: new Prisma.Decimal(dto.amount),
        status: WalletTopUpStatus.PENDING,
      },
    });

    const { cobranaChargeId, code, paymentUrl } = await this.cobranaService.createTopUpCharge({
      topUpId: topUp.id,
      amount: dto.amount,
      documentNumber: user.documentNumber,
      email: user.email,
    });

    const updatedTopUp = await this.prisma.walletTopUp.update({
      where: { id: topUp.id },
      data: { cobranaChargeId, cobranaCode: code, paymentUrl },
    });

    return {
      topUp: this.mapTopUp(updatedTopUp),
      code,
      paymentUrl,
    };
  }

  async getMyTopUp(userId: string, topUpId: string): Promise<TopUpSummary> {
    const topUp = await this.prisma.walletTopUp.findFirst({
      where: { id: topUpId, userId },
    });

    if (!topUp) {
      throw new NotFoundException('Recarga no encontrada');
    }

    return this.mapTopUp(topUp);
  }

  async getMyTopUps(userId: string): Promise<TopUpSummary[]> {
    const topUps = await this.prisma.walletTopUp.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return topUps.map((t) => this.mapTopUp(t));
  }

  async handleChargePaid(params: {
    cobranaChargeId: string;
    externalRef: string;
    eventId: string;
    paidAt: string | null;
  }): Promise<void> {
    const topUp = await this.prisma.walletTopUp.findFirst({
      where: { id: params.externalRef },
    });

    if (!topUp) {
      return;
    }

    if (topUp.status === WalletTopUpStatus.PAID) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.walletTopUp.update({
        where: { id: topUp.id },
        data: {
          status: WalletTopUpStatus.PAID,
          cobranaEventId: params.eventId,
          paidAt: params.paidAt ? new Date(params.paidAt) : new Date(),
        },
      });

      const wallet = await tx.wallet.findUnique({
        where: { id: updated.walletId },
        select: { id: true, balance: true },
      });

      if (!wallet) return;

      const amount = topUp.amount;
      const balanceAfter = wallet.balance.plus(amount);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          actorUserId: topUp.userId,
          type: WalletTransactionType.CREDIT,
          amount,
          reason: `Recarga de saldo — Cobrana ${params.cobranaChargeId}`,
          balanceAfter,
        },
      });
    }).catch((error: unknown) => {
      if (
        typeof error === 'object' &&
        error !== null &&
        (error as { code?: string }).code === 'P2002'
      ) {
        throw new ConflictException('Evento ya procesado');
      }
      throw error;
    });
  }

  private async findWalletByUserIdOrThrow(userId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
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

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    return wallet;
  }

  private mapWallet(wallet: {
    id: string;
    userId: string;
    balance: Prisma.Decimal;
    createdAt: Date;
    updatedAt: Date;
    user: {
      id: string;
      email: string;
      role: Role;
    };
  }): WalletSummary {
    return {
      id: wallet.id,
      userId: wallet.userId,
      balance: wallet.balance.toString(),
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      user: wallet.user,
    };
  }

  private mapTopUp(topUp: {
    id: string;
    walletId: string;
    userId: string;
    amount: Prisma.Decimal;
    status: WalletTopUpStatus;
    cobranaCode: string | null;
    paymentUrl: string | null;
    paidAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): TopUpSummary {
    return {
      id: topUp.id,
      walletId: topUp.walletId,
      userId: topUp.userId,
      amount: topUp.amount.toString(),
      status: topUp.status,
      cobranaCode: topUp.cobranaCode,
      paymentUrl: topUp.paymentUrl,
      paidAt: topUp.paidAt,
      createdAt: topUp.createdAt,
      updatedAt: topUp.updatedAt,
    };
  }

  private mapTransaction(transaction: {
    id: string;
    type: WalletTransactionType;
    amount: Prisma.Decimal;
    reason: string;
    balanceAfter: Prisma.Decimal;
    createdAt: Date;
    actorUser: {
      id: string;
      email: string;
      role: Role;
    };
    wallet: {
      id: string;
      userId: string;
      user: {
        id: string;
        email: string;
        role: Role;
      };
    };
  }): WalletTransactionHistoryItem {
    return {
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount.toString(),
      reason: transaction.reason,
      balanceAfter: transaction.balanceAfter.toString(),
      createdAt: transaction.createdAt,
      actor: transaction.actorUser,
      wallet: transaction.wallet,
    };
  }
}
