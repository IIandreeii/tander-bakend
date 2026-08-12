import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AliclikCreateProductForWarehouseResponse,
  AliclikCreateWarehousePayload,
  AliclikCreateWarehouseResponse,
  AliclikEvidencesAndPaymentsResponse,
  AliclikOrderPayload,
  AliclikShippingQuoteResponse,
  AliclikUbigeoItem,
} from './aliclik.types';

interface AliclikRequestOptions {
  method: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

@Injectable()
export class AliclikClient {
  private readonly logger = new Logger(AliclikClient.name);

  constructor(private readonly configService: ConfigService) {}

  async quoteShipping(params: { warehouseId: number; lat: string; lng: string }): Promise<AliclikShippingQuoteResponse> {
    return this.request<AliclikShippingQuoteResponse>({
      method: 'GET',
      path: '/integration/order/shipping/cost',
      query: params,
    });
  }

  async createOrder(payload: AliclikOrderPayload): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/external/integration/order',
      body: payload,
    });
  }

  async updateOrder(payload: AliclikOrderPayload): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/external/integration/order/update',
      body: payload,
    });
  }

  async confirmOrder(orderNumber: string): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/integration/order/confirm',
      body: { orderNumber },
    });
  }

  async prepareOrder(orderNumber: string): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/external/integration/order/prepare',
      body: { orderNumber },
    });
  }

  async rescheduleOrder(orderNumber: string, scheduleDate: string): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/integration/order/reschedule',
      body: { orderNumber, scheduleDate },
    });
  }

  async cancelOrder(orderNumber: string): Promise<unknown> {
    return this.request<unknown>({
      method: 'POST',
      path: '/integration/order/cancel',
      body: { orderNumber },
    });
  }

  async getOrderByNumber(orderNumber: string): Promise<unknown> {
    return this.request<unknown>({
      method: 'GET',
      path: `/integration/order/by-number/${encodeURIComponent(orderNumber)}`,
    });
  }

  async getEvidencesAndPayments(orderNumber: string): Promise<AliclikEvidencesAndPaymentsResponse> {
    return this.request<AliclikEvidencesAndPaymentsResponse>({
      method: 'GET',
      path: `/external/integration/order/${encodeURIComponent(orderNumber)}/evidences-payments`,
    });
  }

  /**
   * Creates a warehouse (store) record in Aliclik. This endpoint lives under the
   * `order-public` prefix and is authenticated with an `x-api-key` header (ApiKeyAppGuard),
   * NOT the Bearer token used by `request()` for order endpoints — so it uses its own
   * fetch/headers instead of the shared `request()` helper.
   */
  async createWarehouse(payload: AliclikCreateWarehousePayload): Promise<AliclikCreateWarehouseResponse> {
    const baseUrl = this.configService.get<string>('ALICLIK_WAREHOUSE_API_URL')
      ?? this.configService.get<string>('ALICLIK_USER_API_URL')
      ?? 'https://aliclik-api-release-f6985904c9e2.herokuapp.com';
    const apiKey = this.configService.getOrThrow<string>('ALICLIK_APP_API_KEY');

    const url = `${baseUrl.replace(/\/$/, '')}/external/store/warehouse/create`;

    this.logger.log(`→ POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        // El middleware de aliclik-api (IpBlockMiddleware) exige este header exacto en
        // TODAS las rutas, incluidas las server-to-server — sin esto responde 403.
        'x-aliclik-origin': 'aliclik-web',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const rawBody = await response.text();
    const parsedBody = this.parseResponseBody(rawBody);

    this.logger.log(`← ${response.status} ${url}`);
    this.logger.log(`  response: ${rawBody}`);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Aliclik warehouse creation failed',
        status: response.status,
        body: parsedBody ?? rawBody,
      });
    }

    return parsedBody as AliclikCreateWarehouseResponse;
  }

  /**
   * Updates a warehouse already created in Aliclik. Used instead of `createWarehouse`
   * once we already have an `aliclikWarehouseId` saved, so re-syncing a profile update
   * doesn't create a duplicate warehouse.
   */
  async updateWarehouse(
    id: string,
    payload: AliclikCreateWarehousePayload,
  ): Promise<AliclikCreateWarehouseResponse> {
    const baseUrl = this.configService.get<string>('ALICLIK_WAREHOUSE_API_URL')
      ?? this.configService.get<string>('ALICLIK_USER_API_URL')
      ?? 'https://aliclik-api-release-f6985904c9e2.herokuapp.com';
    const apiKey = this.configService.getOrThrow<string>('ALICLIK_APP_API_KEY');

    const url = `${baseUrl.replace(/\/$/, '')}/external/store/warehouse/${encodeURIComponent(id)}`;

    this.logger.log(`→ PATCH ${url}`);

    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-aliclik-origin': 'aliclik-web',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });

    const rawBody = await response.text();
    const parsedBody = this.parseResponseBody(rawBody);

    this.logger.log(`← ${response.status} ${url}`);
    this.logger.log(`  response: ${rawBody}`);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Aliclik warehouse update failed',
        status: response.status,
        body: parsedBody ?? rawBody,
      });
    }

    return parsedBody as AliclikCreateWarehouseResponse;
  }

  /**
   * Creates the generic "TANDER BOX" product/sku, linked via a new WarehouseSku to the
   * given warehouse. Called right after a store's warehouse is created, so each store gets
   * its own sku/ean to send when creating orders (instead of the old shared env-configured
   * ALICLIK_PRODUCT_SKU/EAN).
   */
  async createProductForWarehouse(warehouseId: number): Promise<AliclikCreateProductForWarehouseResponse> {
    const baseUrl = this.configService.get<string>('ALICLIK_WAREHOUSE_API_URL')
      ?? this.configService.get<string>('ALICLIK_USER_API_URL')
      ?? 'https://aliclik-api-release-f6985904c9e2.herokuapp.com';
    const apiKey = this.configService.getOrThrow<string>('ALICLIK_APP_API_KEY');

    const url = `${baseUrl.replace(/\/$/, '')}/external/product/create-for-warehouse`;

    this.logger.log(`→ POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'x-aliclik-origin': 'aliclik-web',
      },
      body: JSON.stringify({ warehouseId }),
      signal: AbortSignal.timeout(15_000),
    });

    const rawBody = await response.text();
    const parsedBody = this.parseResponseBody(rawBody);

    this.logger.log(`← ${response.status} ${url}`);
    this.logger.log(`  response: ${rawBody}`);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Aliclik product creation failed',
        status: response.status,
        body: parsedBody ?? rawBody,
      });
    }

    return parsedBody as AliclikCreateProductForWarehouseResponse;
  }

  /**
   * Reads Aliclik's ubigeo catalog (`GET /ubigeo/public`). This route is unauthenticated
   * (no `x-api-key`/Bearer needed) but only reachable server-to-server, same host as
   * `createWarehouse`. Used to validate/normalize department/province/district names
   * before creating a warehouse, since Aliclik's `validateUbigeo()` requires an exact
   * string match against this same table.
   */
  async getUbigeoPublic(params: { nivel: 1 | 2 | 3; countryCode?: string; parentId?: number }): Promise<AliclikUbigeoItem[]> {
    const baseUrl = this.configService.get<string>('ALICLIK_WAREHOUSE_API_URL')
      ?? this.configService.get<string>('ALICLIK_USER_API_URL')
      ?? 'https://aliclik-api-release-f6985904c9e2.herokuapp.com';

    const url = new URL('/external/ubigeo/public', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
    url.searchParams.set('nivel', String(params.nivel));
    url.searchParams.set('countryCode', params.countryCode ?? 'PER');
    if (params.parentId !== undefined) {
      url.searchParams.set('parentId', String(params.parentId));
    }
    const requestUrl = url.toString();

    this.logger.log(`→ GET ${requestUrl}`);

    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: {
        'x-aliclik-origin': 'aliclik-web',
      },
      signal: AbortSignal.timeout(15_000),
    });

    const rawBody = await response.text();
    const parsedBody = this.parseResponseBody(rawBody);

    this.logger.log(`← ${response.status} ${requestUrl}`);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Aliclik ubigeo lookup failed',
        status: response.status,
        body: parsedBody ?? rawBody,
      });
    }

    return (parsedBody as AliclikUbigeoItem[] | null) ?? [];
  }

  private async request<T>(options: AliclikRequestOptions): Promise<T> {
    const url = this.buildUrl(options.path, options.query);
    const headers = this.buildHeaders(options.body !== undefined);
    const bodyStr = options.body !== undefined ? JSON.stringify(options.body) : undefined;

    this.logger.log(`→ ${options.method} ${url}`);
    if (bodyStr) this.logger.log(`  body: ${bodyStr}`);

    const response = await fetch(url, {
      method: options.method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(30_000),
    });

    const rawBody = await response.text();
    const parsedBody = this.parseResponseBody(rawBody);

    this.logger.log(`← ${response.status} ${url}`);
    this.logger.log(`  response: ${rawBody}`);

    if (!response.ok) {
      throw new BadGatewayException({
        message: 'Aliclik request failed',
        status: response.status,
        body: parsedBody ?? rawBody,
      });
    }

    return parsedBody as T;
  }

  private buildHeaders(includeJsonContentType: boolean): HeadersInit {
    const token = this.configService.getOrThrow<string>('ALICLIK_TOKEN');
    const originName = this.configService.getOrThrow<string>('ALICLIK_ORIGIN_HEADER_NAME');
    const originValue = this.configService.getOrThrow<string>('ALICLIK_ORIGIN_EXPECTED');

    return {
      Authorization: `Bearer ${token}`,
      [originName]: originValue,
      ...(includeJsonContentType ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const baseUrl = this.configService.getOrThrow<string>('ALICLIK_BASE_URL');
    const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }

    return url.toString();
  }

  private parseResponseBody(body: string): unknown {
    if (body.length === 0) {
      return null;
    }

    try {
      return JSON.parse(body) as unknown;
    } catch {
      return body;
    }
  }
}
