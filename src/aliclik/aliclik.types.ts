import type { Prisma } from '../../generated/prisma/client';

export const ALICLIK_SYNC_STATUS = {
  NOT_SYNCED: 'NOT_SYNCED',
  SYNCED: 'SYNCED',
  ERROR: 'ERROR',
} as const;

export type AliclikSyncStatus = (typeof ALICLIK_SYNC_STATUS)[keyof typeof ALICLIK_SYNC_STATUS];

export const ALICLIK_SYNC_ACTION = {
  QUOTE: 'QUOTE',
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  CONFIRM: 'CONFIRM',
  RESCHEDULE: 'RESCHEDULE',
  CANCEL: 'CANCEL',
  LOOKUP: 'LOOKUP',
} as const;

export type AliclikSyncAction = (typeof ALICLIK_SYNC_ACTION)[keyof typeof ALICLIK_SYNC_ACTION];

export interface AliclikCourierOption {
  id: number;
  addDays: number;
  deliveryCost: number;
  returnCost: number;
  transportId: number;
  transportName: string;
  transportUrlImage: string | null;
  flagDeliveryExpress: boolean;
  schedule: string;
  scheduleExpressStart: string | null;
  scheduleExpressEnd: string | null;
}

export interface AliclikQuoteUbigeoItem {
  name: string;
}

export interface AliclikQuoteUbigeo {
  department: AliclikQuoteUbigeoItem;
  province: AliclikQuoteUbigeoItem;
  district: AliclikQuoteUbigeoItem;
}

export interface AliclikShippingQuoteResponse {
  ubigeo: AliclikQuoteUbigeo;
  couriers: AliclikCourierOption[];
  message?: string;
}

export interface AliclikSelectedCourier extends AliclikCourierOption {}

export interface AliclikCustomerPayload {
  lastName?: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
}

export interface AliclikShippingPayload {
  address1: string;
  address2?: string;
  lat: string;
  lng: string;
  reference?: string;
  district?: string;
  province?: string;
  department?: string;
}

export interface AliclikProductPayload {
  ean?: string;
  sku?: string;
  quantity: number;
  price: number;
}

export interface AliclikCourierPayload {
  addDays: number;
  deliveryCost: number;
  schedule?: string | null;
  scheduleExpressEnd?: string | null;
  scheduleExpressStart?: string | null;
  returnCost: number;
  transportId: number;
  flagDeliveryExpress: boolean;
}

export interface AliclikCountryPayload {
  code: string;
  name: string;
}

export interface AliclikCurrencyPayload {
  code: string;
  symbol: string;
}

export interface AliclikOrderPayload {
  user?: string;
  orderNumber: string;
  total: number | string;
  note?: string;
  channel?: string;
  createdAtEmidica?: string;
  delivery: number;
  companyCode?: string;
  companyName?: string;
  companyParentId?: number;
  country?: AliclikCountryPayload;
  currency?: AliclikCurrencyPayload;
  customer: AliclikCustomerPayload;
  shipping: AliclikShippingPayload;
  products: AliclikProductPayload[];
  courier: AliclikCourierPayload;
}

export interface AliclikOrderUserRecord {
  id: string;
  email: string;
}

export interface AliclikOrderRecord {
  id: string;
  userId: string;
  packageType: string;
  status: string;
  origin: string;
  destination: string;
  recipientFullName: string;
  recipientPhone: string;
  note: string | null;
  weightGrams: number;
  collectionAmount: Prisma.Decimal | null;
  destinationLat: Prisma.Decimal | null;
  destinationLng: Prisma.Decimal | null;
  createdAt: Date;
  updatedAt: Date;
  aliclikOrderNumber: string | null;
  aliclikSyncStatus: AliclikSyncStatus;
  aliclikLastSyncAction: AliclikSyncAction | null;
  aliclikLastSyncAttemptAt: Date | null;
  aliclikSyncedAt: Date | null;
  aliclikLastSyncError: string | null;
  user: AliclikOrderUserRecord;
}

export interface AliclikOrderSyncState {
  orderId: string;
  aliclikOrderNumber: string | null;
  aliclikSyncStatus: AliclikSyncStatus;
  aliclikLastSyncAction: AliclikSyncAction | null;
  aliclikLastSyncAttemptAt: Date | null;
  aliclikSyncedAt: Date | null;
  aliclikLastSyncError: string | null;
}

export interface AliclikOrderSyncResult extends AliclikOrderSyncState {
  message: string;
  externalOrder: unknown;
}
