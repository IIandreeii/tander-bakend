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
  paymentType?: string;
  note?: string;
  channel?: string;
  createdAtEmidica?: string;
  delivery: number;
  motorizedCost?: number;
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
  supportPhone: string | null;
  yapeHolderName: string | null;
  bankHolderName: string | null;
  aliclikWarehouseId: string | null;
  aliclikProductSkuId: string | null;
  aliclikProductEan: string | null;
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
  recaudo: boolean;
  originLat: Prisma.Decimal | null;
  originLng: Prisma.Decimal | null;
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

export interface AliclikEvidenceItem {
  id: number;
  deliveryStatus: string | null;
  subStatus: string | null;
  comment: string | null;
  evidenceDelivery: string | null;
  evidenceSupport: string | null;
  evidenceCall: string | null;
  evidenceChat: string | null;
  evidenceCallChat: string | null;
  method: string | null;
  deliveryDate: string | null;
  createdAt: string | null;
}

export interface AliclikPaymentItem {
  id: string;
  amount: number;
  paymentMethod: string | null;
  entity: string | null;
  paymentDate: string | null;
  paymentDocument: string | null;
  status: string;
  orderDeliveryId: number | null;
  createdAt: string | null;
}

export interface AliclikEvidencesAndPaymentsResponse {
  orderNumber: string;
  evidences: AliclikEvidenceItem[];
  payments: AliclikPaymentItem[];
}

export interface AliclikCreateWarehousePayload {
  companyId: number;
  name: string;
  address: string;
  lat: string;
  lng: string;
  department: string;
  province: string;
  district: string;
  phone: string;
  typeWarehouse: 'NORMAL';
  codeBank?: string;
  nameBank?: string;
  accountNumber?: string;
  holderName?: string;
  // Solo se usa al crear (no en update): almacén del que clonar la cobertura de
  // transporte, para que el almacén nuevo pueda cotizar envíos desde el primer pedido.
  referenceWarehouseId?: number;
}

export interface AliclikCreateWarehouseResponse {
  id: number;
  name: string;
  countryCode: string;
  departmentName: string;
  provinceName: string;
  districtName: string;
}

export interface AliclikCreateProductForWarehouseResponse {
  productId: number;
  skuId: number;
  sku: string;
  ean: string;
}

export interface AliclikUbigeoItem {
  id: number;
  name: string;
  countryCode: string;
  parentId?: number | null;
  nivel?: number;
}
