import type { Role, WalletTopUpStatus, WalletTransactionType } from '../../generated/prisma/client';

export interface WalletUserSummary {
  id: string;
  email: string;
  role: Role;
}

export interface WalletSummary {
  id: string;
  userId: string;
  balance: string;
  createdAt: Date;
  updatedAt: Date;
  user: WalletUserSummary;
}

export interface WalletTransactionActorSummary {
  id: string;
  email: string;
  role: Role;
}

export interface WalletTransactionWalletSummary {
  id: string;
  userId: string;
  user: WalletUserSummary;
}

export interface WalletTransactionHistoryItem {
  id: string;
  type: WalletTransactionType;
  amount: string;
  reason: string;
  balanceAfter: string;
  createdAt: Date;
  actor: WalletTransactionActorSummary;
  wallet: WalletTransactionWalletSummary;
}

export interface WalletHistoryResponse {
  wallet: WalletSummary;
  transactions: WalletTransactionHistoryItem[];
}

export interface WalletAdjustmentResponse {
  wallet: WalletSummary;
  transaction: WalletTransactionHistoryItem;
}

export interface TopUpSummary {
  id: string;
  walletId: string;
  userId: string;
  amount: string;
  status: WalletTopUpStatus;
  cobranaCode: string | null;
  paymentUrl: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitiateTopUpResponse {
  topUp: TopUpSummary;
  code: string | null;
  paymentUrl: string | null;
}
