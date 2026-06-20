import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AliclikOrderPayload, AliclikShippingQuoteResponse } from './aliclik.types';

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
      signal: AbortSignal.timeout(15_000),
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
