import type { Role, OrderPackageType, OrderStatus } from '../../generated/prisma/client';
import type { AliclikSyncAction, AliclikSyncStatus } from '../aliclik/aliclik.types';

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
  originLat: string | null;
  originLng: string | null;
  destination: string;
  destinationLat: string | null;
  destinationLng: string | null;
  recipientFullName: string;
  recipientPhone: string;
  note: string | null;
  weightGrams: number;
  collectionAmount: string | null;
  aliclikOrderNumber: string | null;
  aliclikSyncStatus: AliclikSyncStatus;
  aliclikLastSyncAction: AliclikSyncAction | null;
  aliclikLastSyncAttemptAt: Date | null;
  aliclikSyncedAt: Date | null;
  aliclikLastSyncError: string | null;
  aliclikWebhookStatus: string | null;
  aliclikWebhookDispatchStatus: string | null;
  aliclikWebhookCallStatus: string | null;
  labelGeneratedAt: Date | null;
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

export interface BulkOrderRowResult {
  row: number;
  status: 'success' | 'error';
  orderId?: string;
  error?: string;
}

export interface BulkCreateOrdersResponse {
  total: number;
  succeeded: number;
  failed: number;
  results: BulkOrderRowResult[];
}
