import { buildAliclikOrderNumber, buildOrderPayload, selectCourierOption } from './aliclik.mapper';
import type { AliclikOrderRecord, AliclikShippingQuoteResponse } from './aliclik.types';

describe('Aliclik mapper', () => {
  const order = {
    id: 'order-1',
    userId: 'user-1',
    packageType: 'XS',
    status: 'PENDING',
    origin: 'Origin',
    destination: 'Destination',
    recipientFullName: 'Test Receiver',
    recipientPhone: '999999999',
    note: 'Internal note',
    weightGrams: 120,
    collectionAmount: null,
    destinationLat: { toString: () => '-12.04640' },
    destinationLng: { toString: () => '-77.04280' },
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    aliclikOrderNumber: null,
    aliclikSyncStatus: 'NOT_SYNCED',
    aliclikLastSyncAction: null,
    aliclikLastSyncAttemptAt: null,
    aliclikSyncedAt: null,
    aliclikLastSyncError: null,
    user: {
      id: 'user-1',
      email: 'user@example.com',
    },
  } as unknown as AliclikOrderRecord;

  const quote: AliclikShippingQuoteResponse = {
    ubigeo: {
      department: { name: 'Lima' },
      province: { name: 'Lima' },
      district: { name: 'Miraflores' },
    },
    couriers: [
      {
        id: 2,
        addDays: 1,
        deliveryCost: 14,
        returnCost: 4,
        transportId: 20,
        transportName: 'Courier B',
        transportUrlImage: null,
        flagDeliveryExpress: false,
        schedule: '10:00-18:00',
        scheduleExpressStart: null,
        scheduleExpressEnd: null,
      },
      {
        id: 1,
        addDays: 0,
        deliveryCost: 12,
        returnCost: 3,
        transportId: 10,
        transportName: 'Courier A',
        transportUrlImage: null,
        flagDeliveryExpress: true,
        schedule: '08:00-12:00',
        scheduleExpressStart: '08:00',
        scheduleExpressEnd: '12:00',
      },
    ],
  };

  it('builds stable Aliclik order numbers', () => {
    expect(buildAliclikOrderNumber('order-1')).toBe('TANDER-order-1');
  });

  it('selects the cheapest courier and maps the payload', () => {
    const selectedCourier = selectCourierOption(quote);

    expect(selectedCourier.id).toBe(1);

    const payload = buildOrderPayload({
      order,
      orderNumber: 'TANDER-order-1',
      selectedCourier,
      productSku: 'SKU-123',
      productEan: 'EAN-456',
    });

    expect(payload.orderNumber).toBe('TANDER-order-1');
    expect(payload.delivery).toBe(12);
    expect(payload.customer.address).toBe('Destination');
    expect(payload.shipping.lat).toBe('-12.0464000');
    expect(payload.products).toHaveLength(1);
    expect(payload.products[0]).toMatchObject({
      sku: 'SKU-123',
      ean: 'EAN-456',
      quantity: 1,
      price: 0,
    });
    expect(payload.courier.transportId).toBe(10);
  });
});
