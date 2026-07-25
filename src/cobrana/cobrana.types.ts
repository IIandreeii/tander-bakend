export interface CobranaCustomer {
  documentNumber: string;
  name?: string | null;
  lastname?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
}

export interface CobranaFees {
  commission: number;
  tax: number;
  customerPays: number;
  merchantReceives: number;
}

export type CobranaChargeStatus = 'pending' | 'paid' | 'cancelled' | 'failed' | 'refunded';
export type CobranaMethod = 'services' | 'gateway' | 'external';
export type CobranaOption = '360pay' | 'cobrana' | 'monnet' | 'external';
export type CobranaFeeMode = 'merchant' | 'customer';

export interface CobranaCharge {
  id: string;
  object: 'charge';
  status: CobranaChargeStatus;
  amount: number;
  currency: string | null;
  method: CobranaMethod | null;
  option: CobranaOption | null;
  feeMode: CobranaFeeMode | null;
  fees: CobranaFees;
  paymentUrl: string | null;
  code: string | null;
  concept: string | null;
  dueDate: string | null;
  customer: CobranaCustomer;
  externalRef: string | null;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string | null;
  paidAt: string | null;
}

export interface CreateCobranaChargeRequest {
  amount: number;
  currency?: 'PEN';
  concept: string;
  method: 'services' | 'gateway';
  option: '360pay' | 'cobrana' | 'monnet';
  feeMode: 'merchant';
  customer: CobranaCustomer;
  externalRef?: string;
  dueDate?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface CobranaChargeList {
  object: 'list';
  data: CobranaCharge[];
  hasMore: boolean;
  nextCursor: string | null;
}

export interface CobranaWebhookEvent {
  id: string;
  type: 'charge.paid';
  createdAt: string;
  data: {
    object: CobranaCharge;
  };
}

export interface CobranaErrorBody {
  error: {
    type: string;
    code: string;
    message: string;
    param?: string;
  };
}
