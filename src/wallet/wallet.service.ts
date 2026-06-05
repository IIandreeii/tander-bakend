import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role, WalletTransactionType } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdjustWalletDto } from './dto/adjust-wallet.dto';
import type {
  WalletAdjustmentResponse,
  WalletHistoryResponse,
  WalletSummary,
  WalletTransactionHistoryItem,
} from './wallet.types';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

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
