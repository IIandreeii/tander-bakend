import type { Role, OrderPackageType, OrderStatus } from '../../generated/prisma/client';

export interface OrderUserSummary {
  id: string;
  email: string;
  role: Role;
}

export interface OrderPackageDimensions {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
}

export interface OrderPackagePreset {
  type: OrderPackageType;
  maxWeightGrams: number;
  dimensions: OrderPackageDimensions;
}

export interface OrderPackageConfigResponse {
  creationCreditEstimate: string;
  deliveredWalletCharge: string;
  packages: OrderPackagePreset[];
}

export interface OrderCreationCapacityResponse {
  walletBalance: string;
  creationCreditEstimate: string;
  maxActiveOrders: number;
  activeOrders: number;
  availableOrders: number;
  canCreate: boolean;
}

export interface OrderSummary {
  id: string;
  userId: string;
  user: OrderUserSummary;
  packageType: OrderPackageType;
  status: OrderStatus;
  origin: string;
  destination: string;
  recipientFullName: string;
  recipientPhone: string;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
  deliveredChargeTransactionId: string | null;
}

export interface OrderHistoryActorSummary {
  id: string;
  email: string;
  role: Role;
}

export interface OrderStatusHistoryItem {
  id: string;
  status: OrderStatus;
  createdAt: Date;
  changedBy: OrderHistoryActorSummary;
}

export interface OrderHistoryResponse {
  order: OrderSummary;
  history: OrderStatusHistoryItem[];
}
