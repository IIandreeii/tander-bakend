import { OrderPackageType, OrderStatus } from '../../generated/prisma/client';

export const ORDER_CREATION_CREDIT_ESTIMATE_DEFAULT = '10';
export const ORDER_DELIVERED_WALLET_CHARGE_DEFAULT = '13.5';

export const ORDER_PACKAGE_PRESETS: readonly {
  type: OrderPackageType;
  maxWeightGrams: number;
  dimensions: {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
  };
}[] = [
  {
    type: OrderPackageType.XXS,
    maxWeightGrams: 250,
    dimensions: {
      lengthCm: 15,
      widthCm: 10,
      heightCm: 10,
    },
  },
  {
    type: OrderPackageType.XS,
    maxWeightGrams: 500,
    dimensions: {
      lengthCm: 15,
      widthCm: 20,
      heightCm: 12,
    },
  },
  {
    type: OrderPackageType.S,
    maxWeightGrams: 2000,
    dimensions: {
      lengthCm: 20,
      widthCm: 30,
      heightCm: 12,
    },
  },
  {
    type: OrderPackageType.M,
    maxWeightGrams: 5000,
    dimensions: {
      lengthCm: 24,
      widthCm: 30,
      heightCm: 20,
    },
  },
];

export const ORDER_ACTIVE_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
];

export const ORDER_TERMINAL_STATUSES: readonly OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  [OrderStatus.PENDING]: [
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
    OrderStatus.DELIVERED,
  ],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED, OrderStatus.DELIVERED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
  [OrderStatus.DELIVERED]: [],
  [OrderStatus.CANCELLED]: [],
};

export const ORDER_DELIVERED_CHARGE_REASON = 'Order delivered charge';
