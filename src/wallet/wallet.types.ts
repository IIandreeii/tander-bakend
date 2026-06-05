import type { Role, WalletTransactionType } from '../../generated/prisma/client';

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
