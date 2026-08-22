import { BadRequestException } from '@nestjs/common';
import type { AliclikCourierOption, AliclikOrderPayload, AliclikOrderRecord, AliclikSelectedCourier, AliclikShippingQuoteResponse } from './aliclik.types';

export interface AliclikQuoteRequest {
  warehouseId: number;
  lat: string;
  lng: string;
}

export interface AliclikResolvedOrderPayload {
  orderNumber: string;
  payload: AliclikOrderPayload;
  selectedCourier: AliclikSelectedCourier;
}

export interface AliclikProductIdentifiers {
  sku?: string;
  ean?: string;
}

const ALICLIK_ORDER_PREFIX = 'TANDER';

// Costo de motorizado que se manda a Aliclik según el flag "recaudo" del pedido: 10 si el
// recaudo está activo, 5 si no. Ver Order.recaudo / Shipping.motorizedCost en aliclik-api.
const MOTORIZED_COST_RECAUDO_ACTIVE = 10;
const MOTORIZED_COST_RECAUDO_INACTIVE = 5;

function formatDecimal(value: { toString(): string } | null | undefined, digits: number): string {
  if (!value) {
    return '';
  }

  const numericValue = Number(value.toString());

  return Number.isFinite(numericValue) ? numericValue.toFixed(digits) : '';
}

export function buildAliclikOrderNumber(): string {
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${ALICLIK_ORDER_PREFIX}${Date.now()}${rand}`;
}

export function buildQuoteRequest(order: AliclikOrderRecord, warehouseId: number): AliclikQuoteRequest {
  return {
    warehouseId,
    lat: formatDecimal(order.destinationLat, 7),
    lng: formatDecimal(order.destinationLng, 7),
  };
}

export function selectCourierOption(quote: AliclikShippingQuoteResponse, preferredTransportId?: number): AliclikSelectedCourier {
  if (quote.couriers.length === 0) {
    throw new BadRequestException('Aliclik returned no courier options');
  }

  if (preferredTransportId !== undefined) {
    const preferred = quote.couriers.find((c) => c.transportId === preferredTransportId);

    if (!preferred) {
      throw new BadRequestException(
        `Aliclik courier with transportId ${preferredTransportId} not available for this destination`,
      );
    }

    return preferred;
  }

  return [...quote.couriers].sort((left, right) => {
    const deliveryDiff = left.deliveryCost - right.deliveryCost;

    if (deliveryDiff !== 0) {
      return deliveryDiff;
    }

    return left.id - right.id;
  })[0];
}

export function buildOrderPayload(params: {
  order: AliclikOrderRecord;
  orderNumber: string;
  selectedCourier: AliclikCourierOption;
  productSku?: string;
  productEan?: string;
}): AliclikOrderPayload {
  const { order, orderNumber, selectedCourier, productSku, productEan } = params;
  const collectionAmount = order.collectionAmount?.toNumber() ?? 0;
  // Antes se mandaba total=0 y el monto real solo iba como texto en el note.
  // Ahora se manda el monto real también en total/price (el note se deja igual).
  const total = collectionAmount;
  const product: AliclikOrderPayload['products'][number] = {
    quantity: 1,
    price: total,
  };

  if (productSku) {
    product.sku = productSku;
  }

  if (productEan) {
    product.ean = productEan;
  }

  return {
    user: order.user.email,
    orderNumber,
    total,
    // 'C' = contraentrega/COD, único valor que maneja tander por ahora.
    paymentType: 'C',
    note: [
      order.note,
      `Monto total: ${collectionAmount}`,
      `Recaudo: ${order.recaudo ? 'Sí' : 'No'}`,
      order.user.supportPhone ? `Soporte: ${order.user.supportPhone}` : null,
      order.user.yapeHolderName ? `Titular Yape: ${order.user.yapeHolderName}` : null,
      order.user.bankHolderName ? `Titular Banco: ${order.user.bankHolderName}` : null,
      `Origen: ${order.origin} (${formatDecimal(order.originLat, 7)}, ${formatDecimal(order.originLng, 7)})`,
    ].filter(Boolean).join(' | '),
    channel: 'TANDER',
    createdAtEmidica: order.createdAt.toISOString(),
    delivery: selectedCourier.deliveryCost,
    motorizedCost: order.recaudo ? MOTORIZED_COST_RECAUDO_ACTIVE : MOTORIZED_COST_RECAUDO_INACTIVE,
    currency: { code: 'PEN', symbol: 'S/' },
    customer: {
      name: order.recipientFullName,
      phone: order.recipientPhone,
      address: order.destination,
    },
    shipping: {
      address1: order.destination,
      address2: order.origin,
      lat: formatDecimal(order.destinationLat, 7),
      lng: formatDecimal(order.destinationLng, 7),
    },
    products: [product],
    courier: {
      addDays: selectedCourier.addDays,
      deliveryCost: selectedCourier.deliveryCost,
      schedule: selectedCourier.schedule,
      scheduleExpressEnd: selectedCourier.scheduleExpressEnd,
      scheduleExpressStart: selectedCourier.scheduleExpressStart,
      returnCost: selectedCourier.returnCost,
      transportId: selectedCourier.transportId,
      flagDeliveryExpress: selectedCourier.flagDeliveryExpress,
    },
  };
}

export function buildResolvedOrderPayload(params: {
  order: AliclikOrderRecord;
  orderNumber: string;
  quote: AliclikShippingQuoteResponse;
  productSku?: string;
  productEan?: string;
}): AliclikResolvedOrderPayload {
  const selectedCourier = selectCourierOption(params.quote);

  return {
    orderNumber: params.orderNumber,
    payload: buildOrderPayload({
      order: params.order,
      orderNumber: params.orderNumber,
      selectedCourier,
      productSku: params.productSku,
      productEan: params.productEan,
    }),
    selectedCourier,
  };
}
